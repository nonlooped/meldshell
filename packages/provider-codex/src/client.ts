import { stopProcessTree } from "../../provider-runtime/src/process-tree"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"
import {
  isRecord,
  toError,
  type CodexStatus,
  type ProviderModelCatalogEntry,
} from "@meldshell/contracts"
import Ajv, { type ValidateFunction } from "ajv"
import { Effect } from "effect"
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

interface CommandResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}

const run = (executablePath: string, args: ReadonlyArray<string>) =>
  Effect.async<CommandResult, Error>((resume) => {
    try {
      const isCommandScript = /\.(?:cmd|bat)$/i.test(executablePath)
      const commandLine = `"${executablePath.replaceAll('"', '""')}" ${args
        .map((argument) => `"${argument.replaceAll('"', '""')}"`)
        .join(" ")}`
      const child = isCommandScript
        ? spawn(commandLine, {
            shell: true,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn(executablePath, args, {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          })
      let stdout = ""
      let stderr = ""

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8")
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8")
      })
      child.once("error", (cause) => {
        resume(Effect.fail(cause))
      })
      child.once("close", (exitCode) => {
        resume(Effect.succeed({ exitCode, stdout: stdout.trim(), stderr: stderr.trim() }))
      })
      return Effect.sync(() => child.kill())
    } catch (cause) {
      resume(Effect.fail(toError(cause)))
      return undefined
    }
  }).pipe(
    Effect.timeoutFail({
      duration: "8 seconds",
      onTimeout: () => new Error(`Codex command "${args.join(" ")}" timed out.`),
    }),
  )

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

  const versionResult = yield* run(executablePath, ["--version"]).pipe(
    Effect.catchAll(() => Effect.succeed({ exitCode: null, stdout: "", stderr: "" })),
  )
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

  const loginResult = yield* run(executablePath, ["login", "status"]).pipe(
    Effect.catchAll(() => Effect.succeed({ exitCode: null, stdout: "", stderr: "" })),
  )

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

interface JsonRpcResponse {
  readonly id: string | number
  readonly result?: unknown
  readonly error?: { readonly code?: number; readonly message?: string; readonly data?: unknown }
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
const validateServerNotification: ValidateFunction = ajv.compile(serverNotificationSchema)
const validateServerRequest: ValidateFunction = ajv.compile(serverRequestSchema)
const responseValidators: Record<string, ValidateFunction> = {
  "thread/start": ajv.compile(threadStartResponseSchema),
  "thread/resume": ajv.compile(threadResumeResponseSchema),
  "turn/start": ajv.compile(turnStartResponseSchema),
}
export type MessageValidation = "validated" | "unknown" | "malformed"
const methods = (schema: unknown): Set<string> => {
  const result = new Set<string>()
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return
    const record = value as Record<string, unknown>
    const properties = record.properties as
      | Record<string, { enum?: unknown[]; const?: unknown }>
      | undefined
    for (const name of properties?.method?.enum ?? [properties?.method?.const])
      if (typeof name === "string") result.add(name)
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
const validateModelListResponse: ValidateFunction = ajv.compile(modelListResponseSchema)

const rpcError = (error: JsonRpcResponse["error"]): Error => {
  const suffix = error?.code === undefined ? "" : ` (${error.code})`
  const cause = new Error(`${error?.message ?? "Codex app-server request failed."}${suffix}`)
  if (error?.data !== undefined) cause.cause = error.data
  return cause
}

interface RawModelListResponse {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly model: string
    readonly displayName: string
    readonly description: string
    readonly hidden: boolean
    readonly supportedReasoningEfforts: ReadonlyArray<{
      readonly reasoningEffort: string
      readonly description: string
    }>
    readonly defaultReasoningEffort: string
    readonly serviceTiers?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description: string
    }>
    readonly defaultServiceTier?: string | null
    readonly additionalSpeedTiers?: ReadonlyArray<string>
    readonly inputModalities?: ReadonlyArray<string>
    readonly supportsPersonality?: boolean
    readonly isDefault: boolean
    readonly upgrade?: string | null
    readonly modelSpecialty?: string | null
    readonly multiAgentVersion?: string | null
  }>
  readonly nextCursor?: string | null
}

const normalizeCatalogModel = (
  model: RawModelListResponse["data"][number],
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
    const result = await server.request("model/list", {
      limit: 100,
      includeHidden: true,
      ...(cursor === null ? {} : { cursor }),
    })
    if (!validateModelListResponse(result)) {
      throw new Error(
        `Codex returned an invalid model catalog: ${ajv.errorsText(validateModelListResponse.errors)}`,
      )
    }
    const page = result as RawModelListResponse
    models.push(...page.data.map(normalizeCatalogModel))
    const nextCursor = page.nextCursor ?? null
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
    const isCommandScript = /\.(?:cmd|bat)$/i.test(this.executablePath)
    const child = isCommandScript
      ? spawn(`"${this.executablePath.replaceAll('"', '""')}" app-server`, {
          shell: true,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        })
      : spawn(this.executablePath, ["app-server"], {
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        })
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
        else {
          const validate = responseValidators[method]
          if (validate !== undefined && !validate(value))
            reject(new Error(`Invalid ${method} response: ${ajv.errorsText(validate.errors)}`))
          else resolve(value)
        }
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
      if (record.error !== undefined)
        waiter.reject(rpcError(record.error as JsonRpcResponse["error"]))
      else waiter.resolve(record.result)
      return
    }

    if (typeof record.method !== "string") {
      this.callbacks.onProtocolError("Codex app-server message has no method.", parsed)
      return
    }
    if (typeof record.id === "string" || typeof record.id === "number") {
      this.callbacks.onRequest(
        { id: record.id, method: record.method, params: record.params },
        classifyMessage(
          { id: record.id, method: record.method, params: record.params } as JsonRpcServerRequest,
          true,
        ),
      )
      return
    }
    this.callbacks.onNotification(
      { method: record.method, params: record.params },
      classifyMessage({ method: record.method, params: record.params }),
    )
  }
}
