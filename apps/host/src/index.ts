import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { mkdir } from "node:fs/promises"
import { startHost } from "@meldshell/host/host"
import { beginLink, readCredential, unlinkDevice } from "@meldshell/host/identity"
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
      "Usage: npm run host -- link --control https://meldshell.nonlooped.xyz --data-dir PATH",
    )
  const existing = await readCredential(directory)
  if (existing)
    console.info(
      `This host is already linked to ${existing.account.email} as “${existing.deviceName ?? existing.deviceId}”. Linking again replaces that credential.`,
    )
  const linking = await beginLink(directory, url)
  console.info(
    [
      "",
      "  Sign in to connect this host",
      "",
      `  1. Open   ${linking.verificationURL}`,
      `  2. Check  the page shows the code  ${linking.userCode}`,
      "  3. Choose Connect this computer",
      "",
      "  Waiting for the browser. Press Ctrl+C to stop. Linking allows unattended remote",
      "  control of this host until you remove it from Your devices.",
      "",
    ].join("\n"),
  )
  const stop = () => {
    linking.cancel()
    console.info("Sign-in cancelled. Nothing was linked.")
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  await linking.complete
  process.off("SIGINT", stop)
  process.off("SIGTERM", stop)
  const credential = await readCredential(directory)
  console.info(
    `Linked to ${credential?.account.email ?? "your account"} as “${credential?.deviceName ?? "this host"}”. Start the host to appear online: npm run host -- --data-dir ${directory}`,
  )
} else if (args.includes("unlink")) {
  const existing = await readCredential(directory)
  await unlinkDevice(directory)
  console.info(
    existing
      ? `Remote access disabled. “${existing.deviceName ?? existing.deviceId}” stays listed on Your devices until you remove it there.`
      : "This host was not linked. Nothing changed.",
  )
} else {
  const host = await startHost(directory, {
    databasePath: join(directory, "meldshell.sqlite"),
    notify: () => undefined,
    fork: (entry, _label, env) => forkWorker(entry, env),
  })
  const workspace = option("--workspace")
  if (workspace) await host.addWorkspace(resolve(workspace))
  const status = await host.remote.status()
  console.info(
    status.linked
      ? `MeldShell host running in ${directory}, linked to ${status.account?.email ?? "your account"} as “${status.deviceName ?? "this host"}”.`
      : `MeldShell host running in ${directory}. It is not linked; run “npm run host -- link --control URL --data-dir ${directory}” to reach it remotely.`,
  )
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
