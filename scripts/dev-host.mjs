import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import concurrently from "concurrently"

const controlURL = process.env.PUBLIC_CONTROL_URL || "http://localhost:3001"
// Share the development desktop's data directory so this computer appears as the same device.
const dataDirectory =
  process.env.MELDSHELL_DATA_DIR ??
  join(
    process.platform === "win32"
      ? (process.env.APPDATA ?? join(homedir(), "AppData/Roaming"))
      : process.platform === "darwin"
        ? join(homedir(), "Library/Application Support")
        : (process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")),
    "@meldshell/desktop",
  )

const run = (args) =>
  new Promise((resolve) => {
    const child = spawn("npm", ["run", "host", "--", ...args], {
      stdio: "inherit",
      shell: process.platform === "win32",
    })
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal))
    child.once("exit", (code) => (code === 0 ? resolve() : process.exit(code ?? 1)))
  })

if (process.argv[2] === "--host") {
  // Linking needs the account service, which starts alongside this process.
  if (!existsSync(join(dataDirectory, "remote-credential.json"))) {
    while (
      !(await fetch(controlURL).then(
        () => true,
        () => false,
      ))
    )
      await new Promise((resolve) => setTimeout(resolve, 500))
    await run(["link", "--control", controlURL, "--data-dir", dataDirectory])
  }
  await run(["--data-dir", dataDirectory])
} else {
  console.info("Remote dashboard: http://localhost:4321/dashboard")
  console.info(`Host data: ${dataDirectory}`)
  console.info("Press Ctrl+C to stop the host, account service, and website.")

  const { result } = concurrently(
    [
      {
        name: "host",
        command: "node scripts/dev-host.mjs --host",
        env: { PUBLIC_CONTROL_URL: controlURL },
      },
      { name: "control", command: "npm run control" },
      {
        name: "site",
        command: "npm run dev --workspace=@meldshell/site -- --port 4321",
        env: { PUBLIC_CONTROL_URL: controlURL },
      },
    ],
    { killOthersOn: ["success", "failure"], prefixColors: ["yellow", "magenta", "green"] },
  )

  try {
    await result
  } catch {
    process.exitCode = 1
  }
}
