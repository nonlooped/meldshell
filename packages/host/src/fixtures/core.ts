import { EventEmitter } from "node:events"
import { startCore } from "../core-server"
const events = new EventEmitter()
process.on("message", (data) => events.emit("message", { data }))
const core = startCore(
  {
    postMessage: (message) => {
      if (process.connected) process.send!(message as object)
    },
    on: (_event, listener) => events.on("message", listener),
    off: (_event, listener) => events.off("message", listener),
  },
  process.env.MELDSHELL_DATABASE_PATH!,
)
void core.ready.catch(() => process.exit(1))
process.once("disconnect", () => {
  void core.dispose().finally(() => process.exit())
})
process.once("SIGTERM", () => {
  void core.dispose().finally(() => process.exit())
})
