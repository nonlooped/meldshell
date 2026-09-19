import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { access, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { StringDecoder } from "node:string_decoder"
import which from "which"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"

export type RecordValue = Record<string, unknown>
export const record = (value: unknown): RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as RecordValue) : {}
export const records = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.map(record) : []
export const text = (value: unknown): string => (typeof value === "string" ? value : "")

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
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Strip ANSI colour escapes from CLI output.
  output.replaceAll(/\u001B\[[0-9;]*m/g, "").match(/logged in as\s+(\S+@\S+?)[\s.]*$/im)?.[1] ??
  null

/**
 * Asks the CLI which account is signed in. Cursor does not expose this over ACP, and a failure
 * here must never fail the probe, so an unreadable status simply has no email.
 */
export const readCursorAccountEmail = async (command: CursorCommand): Promise<string | null> => {
  try {
    return await new Promise<string | null>((resolve) => {
      const child = spawn(command.command, [...command.args, "status"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, CURSOR_INVOKED_AS: "cursor-agent" },
      })
      let output = ""
      const timer = setTimeout(() => {
        if (child.pid) void stopProcessTree(child.pid)
        resolve(null)
      }, 8_000)
      const finish = (value: string | null): void => {
        clearTimeout(timer)
        resolve(value)
      }
      child.stdout.setEncoding("utf8")
      child.stdout.on("data", (chunk: string) => {
        output = (output + chunk).slice(-4_096)
      })
      child.on("error", () => finish(null))
      child.on("close", () => finish(parseCursorAccountEmail(output)))
    })
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
  message: (message: NativeMessage) => void
  spawned?: (pid: number) => void
  stopped?: (pid: number) => void
}

export class CursorRequestError extends Error {
  constructor(readonly nativeError: unknown) {
    super(text(record(nativeError).message) || "Cursor rejected the request.")
  }
}

/** ACP v1 plus Cursor's unprefixed extensions. Unknown payloads stay intact. */
export class CursorClient {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<
    number,
    {
      resolve: (value: RecordValue) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout> | undefined
    }
  >()
  private nextId = 0
  private failure: Error | null = null
  private closing: Promise<void> | null = null
  constructor(
    command: CursorCommand,
    cwd: string,
    private readonly callbacks: ClientCallbacks,
  ) {
    this.child = spawn(command.command, [...command.args, "acp"], {
      cwd,
      windowsHide: true,
      stdio: "pipe",
      env: { ...process.env, CURSOR_INVOKED_AS: "cursor-agent" },
    })
    const decoder = new StringDecoder("utf8")
    let buffer = ""
    this.child.stdout.on("data", (chunk: Buffer) => {
      buffer += decoder.write(chunk)
      if (buffer.length > 16 * 1024 * 1024) {
        this.fail(new Error("Cursor exceeded the ACP message size limit."))
        void this.close()
        return
      }
      let end: number
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end).trim()
        buffer = buffer.slice(end + 1)
        if (line) this.receive(line)
      }
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
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(this.failure)
    }
    this.pending.clear()
  }

  private receive(line: string): void {
    try {
      const message = record(JSON.parse(line))
      if (message.jsonrpc !== "2.0") throw new Error("Invalid Cursor JSON-RPC envelope.")
      if (typeof message.method === "string") {
        const id =
          typeof message.id === "string" || typeof message.id === "number" ? message.id : undefined
        this.callbacks.message({
          method: message.method,
          params: message.params,
          ...(id === undefined ? {} : { id }),
        })
        return
      }
      if (typeof message.id !== "number") return
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error) pending.reject(new CursorRequestError(message.error))
      else pending.resolve(record(message.result))
    } catch (cause) {
      this.fail(cause instanceof Error ? cause : new Error("Invalid Cursor ACP message."))
      void this.close()
    }
  }

  private write(value: unknown): void {
    if (this.failure) throw this.failure
    this.child.stdin.write(`${JSON.stringify(value)}\n`)
  }

  request(method: string, params: unknown, timeoutMs = 20_000): Promise<RecordValue> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id)
              reject(new Error(`Cursor ${method} timed out.`))
            }, timeoutMs)
          : undefined
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.write({ jsonrpc: "2.0", id, method, params })
      } catch (cause) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(cause)
      }
    })
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params })
  }
  respond(id: string | number, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result })
  }
  reject(id: string | number, message: string, code = -32601): void {
    this.write({ jsonrpc: "2.0", id, error: { code, message } })
  }

  async initialize(): Promise<RecordValue> {
    const init = await this.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "meldshell", version: "0.1.0" },
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
        _meta: { parameterizedModelPicker: true },
      },
    })
    if (init.protocolVersion !== 1)
      throw new Error("This Cursor ACP protocol version is not supported.")
    if (!records(init.authMethods).some((method) => method.id === "cursor_login"))
      throw new Error("The discovered executable does not identify itself as Cursor ACP.")
    await this.request("authenticate", { methodId: "cursor_login" })
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
