import { runCodexWorker } from "@meldshell/provider-codex/worker"

const parentPort = process.parentPort
if (parentPort === undefined)
  throw new Error("The Codex integration must run as an Electron utility process.")
const worker = runCodexWorker(parentPort)
process.once("beforeExit", () => {
  void worker.shutdown()
})
