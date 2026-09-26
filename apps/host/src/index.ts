import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { mkdir } from "node:fs/promises"
import { startHost } from "@meldshell/host/host"
import { beginLink, unlinkDevice } from "@meldshell/host/identity"
import { forkWorker } from "./platform"

const args = process.argv.slice(2)
const option = (name: string) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const directory = resolve(
  option("--data-dir") ??
    process.env.MELDSHELL_DATA_DIR ??
    join(homedir(), ".local/share/meldshell"),
)
await mkdir(directory, { recursive: true, mode: 0o700 })
if (args.includes("link")) {
  const url = option("--control")
  if (!url)
    throw new Error(
      "Usage: npm run host -- link --control https://accounts.example.com --data-dir PATH",
    )
  const linking = await beginLink(directory, url)
  console.info(
    `Open ${linking.verificationURL}\nConfirm code: ${linking.userCode}\nLinking enables unattended remote control until you revoke this device.`,
  )
  await linking.complete
  console.info("Device linked. Start the host to appear online.")
} else if (args.includes("unlink")) {
  await unlinkDevice(directory)
  console.info("Remote access disabled on this host.")
} else {
  const host = await startHost(directory, {
    databasePath: join(directory, "meldshell.sqlite"),
    notify: () => undefined,
    fork: (entry, _label, env) => forkWorker(entry, env),
  })
  const workspace = option("--workspace")
  if (workspace) await host.addWorkspace(resolve(workspace))
  console.info(`MeldShell host running in ${directory}`)
  let stopping = false
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      if (stopping) return
      stopping = true
      void host.close().catch((cause) => {
        console.error(cause)
        process.exitCode = 1
      })
    })
}
