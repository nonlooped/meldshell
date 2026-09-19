import { runClaudeWorker } from "@meldshell/provider-claude/worker"

const parentPort = process.parentPort
if (parentPort === undefined)
  throw new Error("The Claude integration must run as an Electron utility process.")
const worker = runClaudeWorker(parentPort)
process.once("beforeExit", () => {
  void worker.shutdown()
})
