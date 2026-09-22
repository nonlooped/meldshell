import { EventEmitter } from "node:events"
import { startCore } from "@meldshell/host/core-server"
import { runCodexWorker } from "@meldshell/provider-codex/worker"
import { runClaudeWorker } from "@meldshell/provider-claude/worker"
import { runCursorWorker } from "@meldshell/provider-cursor/worker"

if (!process.send) throw new Error("Host workers require a parent IPC channel.")
const messages = new EventEmitter()
const port = {
  postMessage: (message: unknown) => {
    if (process.connected) process.send!(message as object)
  },
  on: (_event: "message", listener: (event: { data: unknown }) => void) =>
    messages.on("message", listener),
  off: (_event: "message", listener: (event: { data: unknown }) => void) =>
    messages.off("message", listener),
}
process.on("message", (data) => messages.emit("message", { data }))
let shutdown: () => Promise<unknown>
const kind = process.argv[2]
if (kind === "core-worker.js") {
  if (!process.env.MELDSHELL_DATABASE_PATH) throw new Error("Missing database path")
  const core = startCore(port, process.env.MELDSHELL_DATABASE_PATH)
  shutdown = core.dispose
  void core.ready.catch((cause) => {
    console.error(cause)
    process.exit(1)
  })
} else {
  const worker =
    kind === "codex-worker.js"
      ? runCodexWorker(port)
      : kind === "claude-worker.js"
        ? runClaudeWorker(port)
        : kind === "cursor-worker.js"
          ? runCursorWorker(port)
          : null
  if (!worker) throw new Error("Unknown host worker")
  shutdown = worker.shutdown
}
process.once("disconnect", () => {
  void shutdown().finally(() => process.exit())
})
// The parent handles Ctrl+C and stops workers after settling state.
process.on("SIGINT", () => undefined)
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit())
})
