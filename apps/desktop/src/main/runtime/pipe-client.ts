import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { JsonLines } from "@meldshell/host/json-lines"
import type {
  DesktopConnection,
  DesktopFrame,
  DesktopMethod,
  DesktopMethods,
  DesktopNotification,
  DesktopNotifications,
} from "@meldshell/host/desktop-protocol"

// Interactive Bash without a TTY prints these on every start; they carry no information.
const BASH_NO_TTY =
  /^bash: (?:cannot set terminal process group|no job control in this shell).*\n?/gm

/** Requests are sent once. Losing the pipe rejects even requests whose outcome is uncertain. */
export class PipeClient implements DesktopConnection {
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >()
  private failure: Error | null = null
  private diagnostics = ""
  private readonly ready = Promise.withResolvers<void>()
  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly event: (channel: string, args: readonly unknown[]) => void,
    private readonly disconnected: () => void,
    private readonly timeout = 300_000,
  ) {
    // Read startup failures through waitUntilReady rather than an unhandled rejection.
    void this.ready.promise.catch(() => undefined)
    const lines = new JsonLines((frame) => this.receive(frame))
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        lines.push(chunk)
      } catch {
        this.fail(new Error("The WSL host sent an invalid response."))
      }
    })
    child.stderr.on("data", (chunk: Buffer) => {
      this.diagnostics = (this.diagnostics + chunk.toString("utf8"))
        .replace(BASH_NO_TTY, "")
        .slice(-8000)
    })
    child.once("error", (error) => this.fail(error))
    child.stdin.once("error", (error) => this.fail(error))
    child.once("close", () =>
      this.fail(
        new Error(
          `The WSL host disconnected. Sent work was not retried.\n${this.diagnostics.trim()}`,
        ),
      ),
    )
  }

  get connected(): boolean {
    return this.failure === null
  }

  async waitUntilReady(): Promise<void> {
    const timer = setTimeout(
      () => this.fail(new Error(`The WSL host did not start in time.\n${this.diagnostics.trim()}`)),
      this.timeout,
    )
    try {
      await this.ready.promise
    } finally {
      clearTimeout(timer)
    }
  }

  private receive(raw: unknown): void {
    const frame = raw as DesktopFrame
    if (!frame || typeof frame !== "object") throw new Error("Invalid frame")
    if (frame.type === "event" && typeof frame.channel === "string" && Array.isArray(frame.args)) {
      if (frame.channel === "host:ready") {
        this.ready.resolve()
        return
      }
      this.event(frame.channel, frame.args)
      return
    }
    if (frame.type !== "result" || typeof frame.id !== "string" || typeof frame.ok !== "boolean")
      throw new Error("Invalid result")
    const entry = this.pending.get(frame.id)
    if (!entry) return
    this.pending.delete(frame.id)
    clearTimeout(entry.timer)
    if (frame.ok) entry.resolve(frame.value)
    else
      entry.reject(
        new Error(typeof frame.error === "string" ? frame.error : "The host operation failed."),
      )
  }

  private write(frame: DesktopFrame): void {
    this.child.stdin.write(`${JSON.stringify(frame)}\n`, (error) => {
      if (error) this.fail(error)
    })
  }

  request<M extends DesktopMethod>(
    method: M,
    ...args: Parameters<DesktopMethods[M]>
  ): Promise<Awaited<ReturnType<DesktopMethods[M]>>> {
    if (this.failure) return Promise.reject(this.failure)
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      // A slow answer fails only its own request; a dead pipe is reported by the close event.
      const timer = setTimeout(
        () => {
          this.pending.delete(id)
          reject(new Error("The WSL host did not respond in time. Sent work was not retried."))
        },
        method === "close" ? Math.min(this.timeout, 20_000) : this.timeout,
      )
      this.pending.set(id, {
        resolve: (value) => resolve(value as Awaited<ReturnType<DesktopMethods[M]>>),
        reject,
        timer,
      })
      this.write({ type: "request", id, method, args })
    })
  }

  notify<N extends DesktopNotification>(
    method: N,
    ...args: Parameters<DesktopNotifications[N]>
  ): void {
    if (!this.failure) this.write({ type: "notify", method, args })
  }

  private fail(error: Error): void {
    if (this.failure) return
    this.failure = error
    this.ready.reject(error)
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
    // EOF lets the Linux host stop its own workers and save state. Never terminate the distro.
    this.child.stdin.end()
    const deadline = setTimeout(() => this.child.kill(), 20_000)
    deadline.unref()
    this.child.once("close", () => clearTimeout(deadline))
    this.disconnected()
  }

  async close(): Promise<void> {
    if (!this.connected) return
    try {
      await this.request("close")
    } finally {
      this.fail(new Error("MeldShell closed the WSL host."))
    }
  }
}
