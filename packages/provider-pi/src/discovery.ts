import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import which from "which"
import { asRecord } from "@meldshell/contracts"
import { pathExists, runCommand } from "@meldshell/provider-runtime/command"

export interface PiCommand {
  /** The program to start; Node when Pi is a JavaScript entry point. */
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly version: string
  /** Display path reported in provider status: the override or the PATH hit. */
  readonly executablePath: string
}

/** Resolve npm's Windows shim to the installed CLI entry, never through cmd.exe. */
const npmEntry = async (shim: string): Promise<string | null> => {
  const root = join(dirname(shim), "node_modules", "@earendil-works", "pi-coding-agent")
  try {
    const manifest = asRecord(JSON.parse(await readFile(join(root, "package.json"), "utf8")))
    const bin = asRecord(manifest.bin).pi
    if (typeof bin !== "string" || !bin) return null
    const entry = join(root, bin)
    return (await pathExists(entry)) ? entry : null
  } catch {
    return null
  }
}

const launcher = async (path: string): Promise<{ command: string; args: string[] }> => {
  if (!/\.[cm]?js$/i.test(path)) return { command: path, args: [] }
  const node = await which("node", { nothrow: true })
  if (!node) throw new Error("Node.js is required to run this Pi JavaScript entry point.")
  return { command: node, args: [path] }
}

/** `pi --version` prints the bare version. */
const versionOf = async (command: string, args: ReadonlyArray<string>): Promise<string> => {
  const result = await runCommand(command, [...args, "--version"], { timeoutMs: 15_000 })
  const version = `${result.stdout}\n${result.stderr}`.match(/(?:^|\s|v)(\d+\.\d+\.\d+\S*)/)?.[1]
  if (result.exitCode === 0 && version) return version
  throw new Error("The selected executable did not report a Pi version.")
}

/**
 * Discover the user's installed Pi CLI. MeldShell never ships Pi; it drives the install the user
 * keeps up to date, and the probe's RPC connection is the compatibility check.
 */
export const discoverPi = async (): Promise<PiCommand> => {
  const override = process.env.MELDSHELL_PI_EXECUTABLE
  const found = override ?? (await which("pi", { nothrow: true }))
  const path = found && /\.(cmd|bat|ps1)$/i.test(found) ? await npmEntry(found) : found
  if (!path) {
    if (override)
      throw new Error("Pi executable override could not be resolved to a runnable entry point.")
    throw new Error(
      "Pi is not installed or is not available on PATH. Install it with npm install -g @earendil-works/pi-coding-agent, then check again.",
    )
  }
  const { command, args } = await launcher(path)
  return { command, args, version: await versionOf(command, args), executablePath: found ?? path }
}
