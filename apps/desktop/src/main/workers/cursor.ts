import { runCursorWorker } from "@meldshell/provider-cursor/worker"

const parentPort = process.parentPort
if (parentPort === undefined) throw new Error("Cursor must run as an Electron utility process.")
const worker = runCursorWorker(parentPort)
process.once("beforeExit", () => {
  void worker.shutdown()
})
