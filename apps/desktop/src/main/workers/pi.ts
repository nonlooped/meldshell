import { runPiWorker } from "@meldshell/provider-pi/worker"

const parentPort = process.parentPort
if (parentPort === undefined) throw new Error("Pi must run as an Electron utility process.")
const worker = runPiWorker(parentPort)
process.once("beforeExit", () => {
  void worker.shutdown()
})
