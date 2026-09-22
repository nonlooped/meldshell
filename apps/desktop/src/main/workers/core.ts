import { startCore } from "@meldshell/host/core-server"

const parentPort = process.parentPort
const databasePath = process.env.MELDSHELL_DATABASE_PATH
if (!parentPort || !databasePath)
  throw new Error("Core process requires a parent and database path.")
const core = startCore(parentPort, databasePath)
void core.ready.catch((cause: unknown) => {
  console.error("MeldShell core failed to start.", cause)
  process.exit(1)
})
process.once("beforeExit", () => core.dispose())
