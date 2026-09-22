import { fork } from "node:child_process"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { mkdir } from "node:fs/promises"
import { startHost } from "@meldshell/host/host"
import { beginLink, unlinkDevice } from "@meldshell/host/identity"
import type { HostProcess } from "@meldshell/host/platform"

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
    fork: (entry, _label, env): HostProcess => {
      const child = fork(fileURLToPath(new URL("./worker.ts", import.meta.url)), [entry], {
        execArgv: ["--import", "tsx"],
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        serialization: "advanced",
      })
      const exits = new Map<(code: number) => void, (code: number | null) => void>()
      return {
        get pid() {
          return child.exitCode === null ? child.pid : undefined
        },
        stdout: child.stdout,
        stderr: child.stderr,
        postMessage: (value) => {
          if (!child.connected) throw new Error("Worker disconnected")
          child.send(value as object, (error) => {
            if (error) child.kill()
          })
        },
        kill: () => child.kill(),
        on: (_event, listener) => child.on("message", listener),
        once: (_event, listener) => {
          const wrapper = (code: number | null) => listener(code ?? -1)
          exits.set(listener, wrapper)
          return child.once("exit", wrapper)
        },
        off: (
          event: "message" | "exit",
          listener: ((value: unknown) => void) | ((code: number) => void),
        ) => {
          if (event === "message") return child.off("message", listener)
          const wrapper = exits.get(listener as (code: number) => void)
          if (wrapper) child.off("exit", wrapper)
          exits.delete(listener as (code: number) => void)
        },
      }
    },
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
