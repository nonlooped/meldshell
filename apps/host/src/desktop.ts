import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"
import { startHost } from "@meldshell/host/host"
import { desktopService } from "@meldshell/host/desktop-service"
import { JsonLines } from "@meldshell/host/json-lines"
import { wslPath } from "@meldshell/host/wsl-paths"
import type {
  DesktopFrame,
  DesktopMethod,
  DesktopNotification,
} from "@meldshell/host/desktop-protocol"
import { forkWorker } from "./platform"
import { routeDiagnosticsToStderr } from "./diagnostics"

// stdout is a protocol pipe, never a log stream. Worker logs are also routed to stderr.
routeDiagnosticsToStderr()
if (process.platform !== "linux") throw new Error("The WSL host must run with Linux Node.js.")
const distribution = process.env.WSL_DISTRO_NAME
if (!distribution) throw new Error("The desktop host must run inside WSL.")
const directory = process.env.MELDSHELL_WSL_DATA_DIR || join(homedir(), ".local/share/meldshell")
if (!directory.startsWith("/"))
  throw new Error("MELDSHELL_WSL_DATA_DIR must be a Linux absolute path.")
await mkdir(directory, { recursive: true, mode: 0o700 })

let stopping = false
const send = (frame: DesktopFrame) => {
  if (process.stdout.destroyed || process.stdout.writableEnded) return
  if (process.stdout.writableLength > 64 * 1024 * 1024) {
    void stop()
    return
  }
  process.stdout.write(`${JSON.stringify(frame)}\n`)
}
const event = (channel: string, args: readonly unknown[]) => send({ type: "event", channel, args })
const host = await startHost(
  directory,
  {
    databasePath: join(directory, "meldshell.sqlite"),
    fork: (entry, _label, env) => forkWorker(entry, env, import.meta.url.endsWith(".js")),
    notify: ({ title, body, threadId }) => event("host:notification", [title, body, threadId]),
    onCoreExit: () => {
      void stop()
    },
  },
  event,
)
const executeFile = promisify(execFile)
const { methods, notifications } = desktopService(host, event, {
  toHostPath: async (path) => {
    if (typeof path !== "string" || path.includes("\0")) throw new Error("Invalid file path.")
    const linux = wslPath(path, distribution)
    if (linux !== null) return linux
    if (path.startsWith("/") && !path.startsWith("//")) return path
    if (!/^[a-z]:[/\\]/i.test(path))
      throw new Error("Choose a file in this WSL distribution or on a local Windows drive.")
    const { stdout } = await executeFile("wslpath", ["-a", "-u", path], { timeout: 10_000 })
    return stdout.trim()
  },
})

async function stop(): Promise<void> {
  if (stopping) return
  stopping = true
  const deadline = setTimeout(() => process.exit(1), 15_000)
  try {
    await methods.close()
    if (!process.stdout.destroyed) await new Promise<void>((resolve) => process.stdout.end(resolve))
  } finally {
    clearTimeout(deadline)
    process.exit()
  }
}

async function receive(raw: unknown): Promise<void> {
  const frame = raw as { type?: unknown; id?: unknown; method?: unknown; args?: unknown }
  if (!frame || typeof frame.method !== "string" || !Array.isArray(frame.args))
    throw new Error("Invalid desktop request.")
  if (frame.type === "notify") {
    if (!stopping && Object.hasOwn(notifications, frame.method))
      Reflect.apply(notifications[frame.method as DesktopNotification], undefined, frame.args)
    return
  }
  if (frame.type !== "request" || typeof frame.id !== "string")
    throw new Error("Invalid desktop request.")
  try {
    if (stopping || !Object.hasOwn(methods, frame.method))
      throw new Error("This host operation is unavailable.")
    const value: unknown = await Reflect.apply(
      methods[frame.method as DesktopMethod],
      undefined,
      frame.args,
    )
    send({ type: "result", id: frame.id, ok: true, value: value ?? null })
    if (frame.method === "close") void stop()
  } catch (cause) {
    send({
      type: "result",
      id: frame.id,
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    })
  }
}
const lines = new JsonLines((frame) => {
  void receive(frame).catch(() => stop())
})
process.stdin.on("data", (chunk: Buffer) => {
  try {
    lines.push(chunk)
  } catch {
    void stop()
  }
})
process.stdin.once("end", () => {
  void stop()
})
process.stdout.once("error", () => {
  void stop()
})
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void stop()
  })
process.stdin.resume()
event("host:ready", [])
