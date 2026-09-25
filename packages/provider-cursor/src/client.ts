import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { access, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { stripVTControlCharacters } from "node:util"
import { Readable, Writable } from "node:stream"
import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ClientConnection,
  type ClientContext,
  type ClientRequestHandler,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type AnyMessage,
} from "@agentclientprotocol/sdk"
import which from "which"
import { asRecords, type UnknownRecord } from "@meldshell/contracts"
import { runCommand } from "@meldshell/provider-runtime/command"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"
import {
  parseCursorQuestion,
  parseCursorPlan,
  type CursorQuestion,
  type CursorPlan,
} from "./extensions"

export interface CursorCommand {
  command: string
  args: string[]
}
const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  )

/** Resolve the official Windows distribution to its bundled Node binary, without a shell. */
const windowsDistribution = async (root: string): Promise<CursorCommand | null> => {
  const versions = await readdir(join(root, "versions")).catch(() => [])
  const candidates = versions
    .filter((name) => /^\d{4}\.\d{1,2}\.\d{1,2}(-\d{2}-\d{2}-\d{2})?-[a-f0-9]+$/.test(name))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((name) => join(root, "versions", name))
  for (const directory of [root, ...candidates]) {
    if ((await exists(join(directory, "node.exe"))) && (await exists(join(directory, "index.js"))))
      return { command: join(directory, "node.exe"), args: [join(directory, "index.js")] }
  }
  return null
}

export const discoverCursor = async (): Promise<CursorCommand> => {
  const override = process.env.MELDSHELL_CURSOR_EXECUTABLE
  const found = override ?? (await which("cursor-agent", { nothrow: true }))
  if (found && !/\.(cmd|bat|ps1)$/i.test(found)) return { command: found, args: [] }
  if (process.platform === "win32") {
    const roots = [
      ...(found ? [dirname(found)] : []),
      ...(!override
        ? [join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "cursor-agent")]
        : []),
    ]
    for (const root of roots) {
      const command = await windowsDistribution(root)
      if (command) return command
    }
  }
  if (override)
    throw new Error("Cursor executable override could not be resolved to a native executable.")
  // `agent` is also used by other products. initialize() verifies Cursor's auth identity.
  const agent = await which("agent", { nothrow: true })
  if (agent && !/\.(cmd|bat|ps1)$/i.test(agent)) return { command: agent, args: [] }
  throw new Error("Install Cursor CLI, run cursor-agent login, then check again.")
}

/** Extracts the account line printed by `cursor-agent status`, ignoring its surrounding chrome. */
const parseCursorAccountEmail = (output: string): string | null =>
  stripVTControlCharacters(output).match(/logged in as\s+(\S+@\S+?)[\s.]*$/im)?.[1] ?? null

/**
 * Asks the CLI which account is signed in. Cursor does not expose this over ACP, and a failure
 * here must never fail the probe, so an unreadable status simply has no email.
 */
export const readCursorAccountEmail = async (command: CursorCommand): Promise<string | null> => {
  try {
    const result = await runCommand(command.command, [...command.args, "status"], {
      timeoutMs: 8_000,
      env: { CURSOR_INVOKED_AS: "cursor-agent" },
    })
    return parseCursorAccountEmail(result.stdout)
  } catch {
    return null
  }
}

export interface NativeMessage {
  method: string
  params: unknown
  id?: string | number
}
export interface ClientCallbacks {
  /** Observes native calls for persistence only; never handles protocol responses. */
  message: (message: NativeMessage) => void
  sessionUpdate: (params: SessionNotification) => void
  requestPermission: ClientRequestHandler<RequestPermissionRequest, RequestPermissionResponse>
  askQuestion: ClientRequestHandler<CursorQuestion, UnknownRecord>
  createPlan: ClientRequestHandler<CursorPlan, UnknownRecord>
  spawned?: (pid: number) => void
  stopped?: (pid: number) => void
}

/** ACP v1 plus Cursor's unprefixed extensions. Unknown payloads stay intact. */
export class CursorClient {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly connection: ClientConnection
  private failure: Error | null = null
  private closing: Promise<void> | null = null
  constructor(command: CursorCommand, cwd: string, callbacks: ClientCallbacks) {
    this.child = spawn(command.command, [...command.args, "acp"], {
      cwd,
      windowsHide: true,
      stdio: "pipe",
      env: { ...process.env, CURSOR_INVOKED_AS: "cursor-agent" },
    })
    let lineBytes = 0
    const stdout = Readable.toWeb(this.child.stdout) as unknown as ReadableStream<Uint8Array>
    const input = stdout.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          for (const byte of chunk) {
            lineBytes = byte === 10 ? 0 : lineBytes + 1
            if (lineBytes > 16 * 1024 * 1024)
              throw new Error("Cursor exceeded the ACP message size limit.")
          }
          controller.enqueue(chunk)
        },
      }),
    )
    const stream = ndJsonStream(Writable.toWeb(this.child.stdin), input)
    // Observe native payloads before SDK validation, without rewriting or routing them.
    const readable = stream.readable.pipeThrough(
      new TransformStream<AnyMessage, AnyMessage>({
        transform(message, controller) {
          if ("method" in message && typeof message.method === "string")
            callbacks.message({
              method: message.method,
              params: message.params,
              ...("id" in message && message.id !== null ? { id: message.id } : {}),
            })
          controller.enqueue(message)
        },
      }),
    )
    this.connection = client({ name: "meldshell" })
      .onRequest("session/request_permission", callbacks.requestPermission)
      .onRequest("cursor/ask_question", parseCursorQuestion, callbacks.askQuestion)
      .onRequest("cursor/create_plan", parseCursorPlan, callbacks.createPlan)
      .onNotification("session/update", ({ params }) => callbacks.sessionUpdate(params))
      .connect({ readable, writable: stream.writable })
    void this.connection.closed.then(() => {
      this.fail(
        this.connection.signal.reason instanceof Error
          ? this.connection.signal.reason
          : new Error("Cursor ACP disconnected. Retry explicitly."),
      )
      void this.close()
    })
    this.child.stderr.resume()
    this.child.stdin.on("error", (error) => this.fail(error))
    this.child.once("error", (error) => this.fail(error))
    this.child.once("spawn", () => {
      if (this.child.pid) callbacks.spawned?.(this.child.pid)
    })
    this.child.once("exit", (code) => {
      this.fail(new Error(`Cursor ACP disconnected (exit ${code ?? "signal"}). Retry explicitly.`))
      if (this.child.pid) callbacks.stopped?.(this.child.pid)
    })
  }

  private fail(error: Error): void {
    this.failure ??= error
    this.connection.close(this.failure)
  }

  /** Adds a host deadline without wrapping the SDK's typed request/notification APIs. */
  async run<T>(operation: (agent: ClientContext) => Promise<T>, timeoutMs = 20_000): Promise<T> {
    if (this.failure) throw this.failure
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            this.fail(new Error("Cursor ACP request timed out."))
            void this.close()
          }, timeoutMs)
        : undefined
    try {
      return await operation(this.connection.agent)
    } finally {
      clearTimeout(timer)
    }
  }

  async initialize(): Promise<UnknownRecord> {
    const init = await this.run((agent) =>
      agent.request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "meldshell", version: "0.1.0" },
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          _meta: { parameterizedModelPicker: true },
        },
      }),
    )
    if (init.protocolVersion !== PROTOCOL_VERSION)
      throw new Error("This Cursor ACP protocol version is not supported.")
    if (!asRecords(init.authMethods).some((method) => method.id === "cursor_login"))
      throw new Error("The discovered executable does not identify itself as Cursor ACP.")
    await this.run((agent) => agent.request("authenticate", { methodId: "cursor_login" }))
    return init
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.fail(new Error("Cursor ACP connection closed."))
    this.closing = (async () => {
      if (this.child.pid && this.child.exitCode === null && this.child.signalCode === null)
        await stopProcessTree(this.child.pid)
      this.child.stdin.destroy()
      this.child.stdout.destroy()
      this.child.stderr.destroy()
    })()
    return this.closing
  }
}
