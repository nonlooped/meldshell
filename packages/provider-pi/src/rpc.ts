import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { isRecord, type UnknownRecord } from "@meldshell/contracts"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"
import type { PiCommand } from "./discovery"

/** A Pi record larger than this is treated as a broken stream rather than buffered further. */
const MAX_RECORD_BYTES = 16 * 1024 * 1024
/** Pi disposes its runtime after stdin closes; a process still running after this is stopped. */
const SHUTDOWN_GRACE_MS = 3_000
/** Enough of stderr to explain a failed start, such as a missing API key. */
const STDERR_TAIL = 4_000

export interface RpcCallbacks {
  /** Session events and extension UI requests, in stream order. */
  readonly record: (record: UnknownRecord) => void
  readonly spawned?: (pid: number) => void
  readonly stopped?: (pid: number) => void
}

interface Pending {
  readonly resolve: (data: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout> | undefined
}

/**
 * Splits Pi's stdout into records on LF only, as Pi's RPC framing requires. Node's `readline` is
 * unsuitable because it also splits on U+2028 and U+2029, which are valid inside JSON strings.
 */
class JsonLines {
  private chunks: Buffer[] = []
  private size = 0
  constructor(private readonly line: (text: string) => void) {}

  push(chunk: Buffer): void {
    let start = 0
    for (let index = chunk.indexOf(10); index !== -1; index = chunk.indexOf(10, start)) {
      const tail = chunk.subarray(start, index)
      const bytes = this.size === 0 ? tail : Buffer.concat([...this.chunks, tail])
      this.chunks = []
      this.size = 0
      const text = bytes.toString("utf8")
      this.line(text.endsWith("\r") ? text.slice(0, -1) : text)
      start = index + 1
    }
    if (start < chunk.length) {
      this.chunks.push(chunk.subarray(start))
      this.size += chunk.length - start
      if (this.size > MAX_RECORD_BYTES) throw new Error("Pi exceeded the RPC record size limit.")
    }
  }
}

/** One `pi --mode rpc` process: correlated commands in, responses and session events out. */
export class PiRpc {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<string, Pending>()
  private nextId = 0
  private stderr = ""
  private failure: Error | null = null
  private closing: Promise<void> | null = null
  /** Settles once the process has exited, whatever the reason. */
  readonly exited: Promise<void>

  constructor(
    command: PiCommand,
    cwd: string,
    args: ReadonlyArray<string>,
    private readonly callbacks: RpcCallbacks,
  ) {
    this.child = spawn(command.command, [...command.args, "--mode", "rpc", ...args], {
      cwd,
      windowsHide: true,
      stdio: "pipe",
      env: process.env,
    })
    const lines = new JsonLines((text) => this.receive(text))
    this.child.stdout.on("data", (chunk: Buffer) => {
      try {
        lines.push(chunk)
      } catch (cause) {
        this.fail(cause instanceof Error ? cause : new Error(String(cause)))
        void this.close()
      }
    })
    this.child.stderr.setEncoding("utf8")
    this.child.stderr.on("data", (text: string) => {
      this.stderr = (this.stderr + text).slice(-STDERR_TAIL)
    })
    this.child.stdin.on("error", (error) => this.fail(error))
    this.child.once("error", (error) => this.fail(error))
    this.child.once("spawn", () => {
      if (this.child.pid) callbacks.spawned?.(this.child.pid)
    })
    this.exited = new Promise((resolve) => {
      this.child.once("close", (code, signal) => {
        this.fail(new Error(this.exitMessage(code, signal)))
        if (this.child.pid) callbacks.stopped?.(this.child.pid)
        resolve()
      })
    })
  }

  /** Why the connection can no longer be used, such as Pi exiting with its last diagnostics. */
  get error(): Error | null {
    return this.failure
  }

  private exitMessage(code: number | null, signal: NodeJS.Signals | null): string {
    const detail = this.stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(" ")
    const reason = `Pi stopped (${code === null ? (signal ?? "signal") : `exit ${code}`})`
    return detail ? `${reason}: ${detail}` : `${reason}.`
  }

  private receive(text: string): void {
    if (!text.trim()) return
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // Stdout is reserved for protocol records; anything else is diagnostics.
      return
    }
    if (!isRecord(parsed)) return
    if (parsed.type === "response" && typeof parsed.id === "string") {
      const pending = this.pending.get(parsed.id)
      if (pending === undefined) return
      this.pending.delete(parsed.id)
      clearTimeout(pending.timer)
      if (parsed.success === true) pending.resolve(parsed.data)
      else
        pending.reject(
          new Error(typeof parsed.error === "string" ? parsed.error : "Pi rejected the command."),
        )
      return
    }
    this.callbacks.record(parsed)
  }

  private fail(error: Error): void {
    this.failure ??= error
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(this.failure)
      this.pending.delete(id)
    }
  }

  private write(record: UnknownRecord): void {
    if (this.failure) throw this.failure
    this.child.stdin.write(`${JSON.stringify(record)}\n`)
  }

  /** Sends a command and resolves with its response's `data`; a zero timeout waits indefinitely. */
  request<T = unknown>(type: string, fields: UnknownRecord = {}, timeoutMs = 30_000): Promise<T> {
    if (this.failure) return Promise.reject(this.failure)
    const id = `meldshell-${++this.nextId}`
    return new Promise<T>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id)
              reject(new Error(`Pi did not answer ${type} in time.`))
            }, timeoutMs)
          : undefined
      this.pending.set(id, { resolve: (data) => resolve(data as T), reject, timer })
      try {
        this.write({ ...fields, id, type })
      } catch (cause) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(cause)
      }
    })
  }

  /** Answers a dialog an extension opened; Pi sends no response to these. */
  answer(id: string, response: UnknownRecord): void {
    this.write({ type: "extension_ui_response", id, ...response })
  }

  /** Requests an orderly shutdown by closing stdin, then stops whatever is still running. */
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.fail(new Error("Pi RPC connection closed."))
    this.closing = (async () => {
      this.child.stdin.end()
      const running = (): boolean =>
        this.child.exitCode === null &&
        this.child.signalCode === null &&
        this.child.pid !== undefined
      if (running()) {
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          this.exited,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, SHUTDOWN_GRACE_MS)
          }),
        ])
        clearTimeout(timer)
      }
      if (running()) await stopProcessTree(this.child.pid!).catch(() => this.child.kill("SIGKILL"))
      this.child.stdout.destroy()
      this.child.stderr.destroy()
    })()
    return this.closing
  }
}
