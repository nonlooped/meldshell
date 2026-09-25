import type { ServerNotification } from "./generated/ServerNotification"
import type { ServerRequest } from "./generated/ServerRequest"
import type { ThreadStartResponse } from "./generated/v2/ThreadStartResponse"
import type { ThreadResumeResponse } from "./generated/v2/ThreadResumeResponse"
import type { TurnStartResponse } from "./generated/v2/TurnStartResponse"
import type { ModelListResponse } from "./generated/v2/ModelListResponse"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"
import {
  isRecord,
  toError,
  type CodexStatus,
  type ProviderModelCatalogEntry,
} from "@meldshell/contracts"
import { runCommand } from "@meldshell/provider-runtime/command"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"
import Ajv, { type ValidateFunction } from "ajv"
import spawn from "cross-spawn"
import { Effect, Either, Schema } from "effect"
import semver from "semver"
import which from "which"
import { readCodexAccountEmail } from "./account"
import serverNotificationSchema from "../schema/ServerNotification.json"
import serverRequestSchema from "../schema/ServerRequest.json"
import threadStartResponseSchema from "../schema/v2/ThreadStartResponse.json"
import threadResumeResponseSchema from "../schema/v2/ThreadResumeResponse.json"
import turnStartResponseSchema from "../schema/v2/TurnStartResponse.json"
import modelListResponseSchema from "../schema/v2/ModelListResponse.json"

const MINIMUM_CODEX_VERSION = "0.153.0"

/** A CLI check's result; a check that cannot run at all reads as a failed one. */
const check = (executablePath: string, args: ReadonlyArray<string>) =>
  Effect.tryPromise({
    try: (signal) => runCommand(executablePath, args, { timeoutMs: 8_000, signal }),
    catch: toError,
  }).pipe(Effect.orElseSucceed(() => ({ exitCode: null, stdout: "", stderr: "" })))

const status = (
  availability: CodexStatus["availability"],
  detail: string,
  executablePath: string | null = null,
  version: string | null = null,
  accountEmail: string | null = null,
): CodexStatus => ({
  provider: "openai",
  harness: "codex",
  availability,
  executablePath,
  version,
  detail,
  accountEmail,
  checkedAt: new Date().toISOString(),
})

export const probeCodex: Effect.Effect<CodexStatus> = Effect.gen(function* () {
  const executablePath = yield* Effect.tryPromise({
    try: () => which("codex", { nothrow: true }),
    catch: () => new Error("Codex could not be searched for on PATH."),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)))

  if (executablePath === null) {
    return status("missing", "Codex is not installed or is not available on PATH.")
  }

  const versionResult = yield* check(executablePath, ["--version"])
  const parsedVersion = semver.coerce(versionResult.stdout)?.version ?? null

  if (versionResult.exitCode !== 0 || parsedVersion === null) {
    return status("error", "Codex was found but its version could not be read.", executablePath)
  }

  if (semver.lt(parsedVersion, MINIMUM_CODEX_VERSION)) {
    return status(
      "outdated",
      `Codex ${MINIMUM_CODEX_VERSION} or newer is required.`,
      executablePath,
      parsedVersion,
    )
  }

  const loginResult = yield* check(executablePath, ["login", "status"])

  if (loginResult.exitCode !== 0) {
    return status(
      "unauthenticated",
      "Codex is installed but is not authenticated.",
      executablePath,
      parsedVersion,
    )
  }

  // Codex does not report the account through the CLI, so the stored login supplies the email.
  const accountEmail = yield* Effect.promise(() => readCodexAccountEmail())

  return status(
    "ready",
    "Codex is installed, current, and authenticated.",
    executablePath,
    parsedVersion,
    accountEmail,
  )
})

export interface JsonRpcNotification {
  readonly method: string
  readonly params?: unknown
}

export interface JsonRpcServerRequest extends JsonRpcNotification {
  readonly id: string | number
}

export interface AppServerCallbacks {
  readonly onNotification: (message: JsonRpcNotification, known: MessageValidation) => void
  readonly onRequest: (message: JsonRpcServerRequest, known: MessageValidation) => void
  readonly onProtocolError: (message: string, raw?: unknown) => void
  readonly onExit: (code: number | null) => void
  readonly onSpawn?: (pid: number) => void
  readonly onStderr?: (line: string) => void
}

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  formats: {
    double: true,
    int32: true,
    int64: true,
    uint: true,
    uint16: true,
    uint32: true,
    uint64: true,
  },
})
const validateServerNotification = ajv.compile<ServerNotification>(serverNotificationSchema)
const validateServerRequest = ajv.compile<ServerRequest>(serverRequestSchema)
interface Responses {
  "thread/start": ThreadStartResponse
  "thread/resume": ThreadResumeResponse
  "turn/start": TurnStartResponse
  "model/list": ModelListResponse
}
const responseValidators: { [M in keyof Responses]: ValidateFunction<Responses[M]> } = {
  "thread/start": ajv.compile<ThreadStartResponse>(threadStartResponseSchema),
  "thread/resume": ajv.compile<ThreadResumeResponse>(threadResumeResponseSchema),
  "turn/start": ajv.compile<TurnStartResponse>(turnStartResponseSchema),
  "model/list": ajv.compile<ModelListResponse>(modelListResponseSchema),
}

/**
 * The validator and result type are generated from the same checked-in protocol schema. Methods
 * with a response schema go through here; `request` itself returns the raw reply.
 */
export async function requestCodex<M extends keyof Responses>(
  server: Pick<CodexAppServer, "request">,
  method: M,
  params: unknown,
): Promise<Responses[M]> {
  const value = await server.request(method, params)
  const validate = responseValidators[method]
  if (!validate(value))
    throw new Error(`Invalid ${method} response: ${ajv.errorsText(validate.errors)}`)
  return value
}
export type MessageValidation = "validated" | "unknown" | "malformed"
const decodeSchemaMethods = Schema.decodeUnknownEither(
  Schema.Struct({
    properties: Schema.optional(
      Schema.Struct({
        method: Schema.optional(
          Schema.Struct({
            enum: Schema.optional(Schema.Array(Schema.Unknown)),
            const: Schema.optional(Schema.Unknown),
          }),
        ),
      }),
    ),
  }),
)

const methods = (schema: unknown): Set<string> => {
  const result = new Set<string>()
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return
    const decoded = decodeSchemaMethods(value)
    if (Either.isRight(decoded))
      for (const name of decoded.right.properties?.method?.enum ?? [
        decoded.right.properties?.method?.const,
      ])
        if (typeof name === "string") result.add(name)
    const record = value
    for (const child of Object.values(record)) visit(child)
  }
  visit(schema)
  return result
}
const notificationMethods = methods(serverNotificationSchema)
const requestMethods = methods(serverRequestSchema)
const classifyMessage = (message: JsonRpcNotification, request = false): MessageValidation =>
  !(request ? requestMethods : notificationMethods).has(message.method)
    ? "unknown"
    : (request ? validateServerRequest : validateServerNotification)(message)
      ? "validated"
      : "malformed"

const RpcError = Schema.Struct({
  code: Schema.optional(Schema.Number),
  message: Schema.optional(Schema.String),
  data: Schema.optional(Schema.Unknown),
})

const rpcError = (error: typeof RpcError.Type): Error => {
  const suffix = error?.code === undefined ? "" : ` (${error.code})`
  const cause = new Error(`${error?.message ?? "Codex app-server request failed."}${suffix}`)
  if (error?.data !== undefined) cause.cause = error.data
  return cause
}

const normalizeCatalogModel = (
  model: ModelListResponse["data"][number],
): ProviderModelCatalogEntry => {
  const serviceTiers = model.serviceTiers ?? []
  const additionalSpeedTiers = model.additionalSpeedTiers ?? []
  const advertisedFastTier = serviceTiers.find(
    (tier) => tier.name.toLowerCase() === "fast" || tier.id.toLowerCase() === "fast",
  )
  return {
    catalogId: model.id,
    slug: model.model,
    displayName: model.displayName,
    description: model.description,
    reasoningEfforts: model.supportedReasoningEfforts
      .map((option) => option.reasoningEffort.trim())
      .filter((effort) => effort !== ""),
    defaultReasoningEffort: model.defaultReasoningEffort || null,
    serviceTiers: serviceTiers.map((tier) => ({ ...tier })),
    defaultServiceTier: model.defaultServiceTier ?? null,
    additionalSpeedTiers: [...additionalSpeedTiers],
    fastServiceTier:
      advertisedFastTier?.id ??
      (additionalSpeedTiers.some((tier) => tier.toLowerCase() === "fast") ? "fast" : null),
    inputModalities: [...(model.inputModalities ?? ["text", "image"])],
    supportsPersonality: model.supportsPersonality ?? false,
    isDefault: model.isDefault,
    hidden: model.hidden,
    upgrade: model.upgrade ?? null,
    modelSpecialty: model.modelSpecialty ?? null,
    multiAgentVersion: model.multiAgentVersion ?? null,
  }
}

/** Fetches every page because Codex can return a server-selected page size. */
export const listCodexModels = async (
  server: Pick<CodexAppServer, "request">,
): Promise<ReadonlyArray<ProviderModelCatalogEntry>> => {
  const models: ProviderModelCatalogEntry[] = []
  const cursors = new Set<string>()
  let cursor: string | null = null

  do {
    const page: ModelListResponse = await requestCodex(server, "model/list", {
      limit: 100,
      includeHidden: true,
      ...(cursor === null ? {} : { cursor }),
    })
    models.push(...page.data.map(normalizeCatalogModel))
    const nextCursor: string | null = page.nextCursor ?? null
    if (nextCursor !== null && cursors.has(nextCursor)) {
      throw new Error("Codex returned a repeated model catalog cursor.")
    }
    if (nextCursor !== null) cursors.add(nextCursor)
    cursor = nextCursor
  } while (cursor !== null)

  if (models.length === 0) throw new Error("Codex returned an empty model catalog.")
  return models
}

/** One stdio connection to one supervised app-server process. */
export class CodexAppServer {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<
    string | number,
    { readonly resolve: (value: unknown) => void; readonly reject: (cause: Error) => void }
  >()

  constructor(
    private readonly executablePath: string,
    private readonly callbacks: AppServerCallbacks,
  ) {}

  async start(): Promise<void> {
    if (this.child !== null) return
    // cross-spawn starts Windows command shims such as codex.cmd with correct quoting. Its types do
    // not narrow on `stdio`, but every stream is piped here.
    const child = spawn(this.executablePath, ["app-server"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams
    this.child = child
    if (child.pid !== undefined) this.callbacks.onSpawn?.(child.pid)

    createInterface({ input: child.stdout }).on("line", (line) => this.receive(line))
    createInterface({ input: child.stderr }).on("line", (line) => this.callbacks.onStderr?.(line))
    child.once("exit", (code) => {
      const cause = new Error(`Codex app-server exited with code ${String(code)}.`)
      for (const waiter of this.pending.values()) waiter.reject(cause)
      this.pending.clear()
      this.child = null
      this.callbacks.onExit(code)
    })
    child.once("error", (cause) => this.callbacks.onProtocolError(cause.message))

    await this.request("initialize", {
      clientInfo: { name: "meldshell", title: "MeldShell", version: "0.1.0" },
    })
    this.notify("initialized", {})
  }

  request(
    method: string,
    params: unknown,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const finish = (error: Error | null, value?: unknown): void => {
        clearTimeout(timer)
        options.signal?.removeEventListener("abort", abort)
        this.pending.delete(id)
        if (error !== null) reject(error)
        else resolve(value)
      }
      const abort = (): void => finish(new Error(`Codex request "${method}" was cancelled.`))
      const timer = setTimeout(
        () => finish(new Error(`Codex request "${method}" timed out.`)),
        options.timeoutMs ?? 30_000,
      )
      this.pending.set(id, {
        resolve: (value) => finish(null, value),
        reject: (error) => finish(error),
      })
      options.signal?.addEventListener("abort", abort, { once: true })
      if (options.signal?.aborted) {
        abort()
        return
      }
      try {
        this.send({ id, method, params })
      } catch (cause) {
        finish(toError(cause))
      }
    })
  }

  notify(method: string, params: unknown): void {
    this.send({ method, params })
  }

  respond(id: string | number, result: unknown): void {
    this.send({ id, result })
  }

  rejectRequest(id: string | number, code: number, message: string): void {
    this.send({ id, error: { code, message } })
  }

  async stop(): Promise<void> {
    const child = this.child
    if (child === null) return
    for (const waiter of [...this.pending.values()])
      waiter.reject(new Error("Codex app-server stopped."))
    await new Promise<void>((resolve) => {
      child.once("close", () => resolve())
      if (child.pid !== undefined) void stopProcessTree(child.pid).catch(() => child.kill())
      else child.kill()
      const timer = setTimeout(() => {
        child.kill()
        resolve()
      }, 5_000)
      child.once("close", () => clearTimeout(timer))
    })
  }

  private send(message: unknown): void {
    const child = this.child
    if (child === null || !child.stdin.writable) throw new Error("Codex app-server is unavailable.")
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private receive(line: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      this.callbacks.onProtocolError("Codex app-server wrote malformed JSON.", line)
      return
    }
    if (!isRecord(parsed)) {
      this.callbacks.onProtocolError("Codex app-server wrote a non-object message.", parsed)
      return
    }
    const record = parsed

    if ((typeof record.id === "string" || typeof record.id === "number") && !("method" in record)) {
      const waiter = this.pending.get(record.id)
      if (waiter === undefined) return
      this.pending.delete(record.id)
      if (record.error !== undefined) {
        const error = Schema.decodeUnknownEither(RpcError)(record.error)
        waiter.reject(
          Either.isRight(error)
            ? rpcError(error.right)
            : new Error(`Invalid RPC error: ${error.left.message}`),
        )
      } else waiter.resolve(record.result)
      return
    }

    if (typeof record.method !== "string") {
      this.callbacks.onProtocolError("Codex app-server message has no method.", parsed)
      return
    }
    if (typeof record.id === "string" || typeof record.id === "number") {
      this.callbacks.onRequest(
        { id: record.id, method: record.method, params: record.params },
        classifyMessage({ method: record.method, params: record.params }, true),
      )
      return
    }
    this.callbacks.onNotification(
      { method: record.method, params: record.params },
      classifyMessage({ method: record.method, params: record.params }),
    )
  }
}
