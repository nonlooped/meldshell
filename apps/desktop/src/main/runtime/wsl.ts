import { execFile, spawn } from "node:child_process"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { app, dialog } from "electron"
import { DESKTOP_PROTOCOL } from "@meldshell/host/desktop-protocol"
import { PipeClient } from "./pipe-client"
import { distributionNames } from "@meldshell/host/wsl-paths"
import { wslArguments } from "./wsl-bootstrap"

const settingsPath = () => join(app.getPath("userData"), "wsl.json")
export class WslCancelled extends Error {}
async function chooseDistribution(reset: boolean): Promise<string> {
  const override = process.env.MELDSHELL_WSL_DISTRO
  if (override) return override
  if (!reset) {
    const stored = await readFile(settingsPath(), "utf8")
      .then((text) => JSON.parse(text))
      .catch(() => null)
    if (typeof stored?.distribution === "string" && stored.distribution) return stored.distribution
  }
  const names = await new Promise<string[]>((resolve, reject) => {
    execFile(
      "wsl.exe",
      ["--list", "--quiet"],
      { encoding: "buffer", windowsHide: true, timeout: 15_000 },
      (error, stdout) => {
        if (error)
          reject(new Error("Install WSL and a Linux distribution, then restart MeldShell."))
        else resolve(distributionNames(stdout))
      },
    )
  })
  if (names.length === 0)
    throw new Error("No WSL distributions were found. Install a Linux distribution, then retry.")
  const choice = await dialog.showMessageBox({
    type: "question",
    title: "Choose a WSL distribution",
    message: "Where should MeldShell run your agents?",
    detail:
      "Agents, Git, terminals, and thread data stay in this Linux distribution. It needs Linux Node.js 24+, npm, Python 3, make, and a C++ compiler. First launch prepares the Linux host and needs internet access.",
    buttons: [...names.map((name) => name.replaceAll("&", "&&")), "Quit"],
    cancelId: names.length,
    defaultId: 0,
    noLink: true,
  })
  const distribution = names[choice.response]
  if (!distribution) throw new WslCancelled("No WSL distribution was selected.")
  await mkdir(app.getPath("userData"), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify({ distribution }))
  return distribution
}

export async function startWsl(
  event: (channel: string, args: readonly unknown[]) => void,
  disconnected: () => void,
  reset = false,
): Promise<{ client: PipeClient; distribution: string; home: string }> {
  const distribution = await chooseDistribution(reset)
  const payload = app.isPackaged
    ? join(process.resourcesPath, "wsl-host")
    : join(__dirname, "../wsl-host")
  const digest = (await readFile(join(payload, "digest"), "utf8")).trim()
  if (!/^[a-f0-9]{64}$/.test(digest))
    throw new Error("The packaged WSL host is invalid. Reinstall MeldShell.")
  const child = spawn("wsl.exe", wslArguments(distribution, payload, digest), {
    windowsHide: true,
    stdio: "pipe",
    // WSL startup files own credentials and tool settings; never import the Windows host's.
    env: { ...process.env, WSLENV: "" },
  })
  const client = new PipeClient(child, event, disconnected)
  try {
    // Startup scripts and installers never receive protocol requests on their stdin.
    await client.waitUntilReady()
    const info = await client.request("info")
    if (
      info.protocol !== DESKTOP_PROTOCOL ||
      info.distribution?.toLowerCase() !== distribution.toLowerCase() ||
      !info.home.startsWith("/")
    )
      throw new Error("The WSL host does not match this desktop or distribution.")
    return { client, distribution, home: info.home }
  } catch (cause) {
    await client.close().catch(() => undefined)
    throw cause
  }
}
