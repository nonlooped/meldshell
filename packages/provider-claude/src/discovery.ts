import { spawn } from "node:child_process"
import { access, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import which from "which"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"

export interface ClaudeCommand {
  /**
   * Path passed to the Agent SDK as `pathToClaudeCodeExecutable`.
   * Native binaries and JavaScript entrypoints are both valid; the SDK wraps `.js` with Node.
   */
  readonly claudePath: string
  readonly version: string
  /** Display path reported in provider status (the override or PATH hit, when known). */
  readonly executablePath: string
}

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  )

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const versionArgs = async (claudePath: string): Promise<{ command: string; args: string[] }> => {
  if (!/\.m?js$/i.test(claudePath)) return { command: claudePath, args: [] }
  const node = await which("node", { nothrow: true })
  if (!node) throw new Error("Node.js is required to run this Claude Code JavaScript entrypoint.")
  return { command: node, args: [claudePath] }
}

/**
 * Read `claude --version` for provider status. MeldShell does not hard-gate on this number:
 * the user's installed CLI is the harness. Protocol compatibility is checked by connecting.
 */
const versionOf = (command: string, args: ReadonlyArray<string>): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args, "--version"], { windowsHide: true, stdio: "pipe" })
    let output = ""
    const timer = setTimeout(() => {
      if (child.pid) void stopProcessTree(child.pid).catch(() => undefined)
      reject(new Error("Claude version check timed out."))
    }, 8_000)
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      output = (output + chunk).slice(-4096)
    })
    child.stderr.resume()
    child.once("error", (cause) => {
      clearTimeout(timer)
      reject(cause)
    })
    child.once("close", (code) => {
      clearTimeout(timer)
      const version = output.trim().match(/(?:^|\s)(\d+\.\d+\.\d+)(?:\s|$)/)?.[1]
      if (code === 0 && version) resolve(version)
      else reject(new Error("The selected executable did not report a Claude Code version."))
    })
  })

/** Resolve npm's Windows shim to the installed bin, never through cmd.exe. */
const npmEntry = async (shim: string): Promise<string | null> => {
  const root = join(dirname(shim), "node_modules", "@anthropic-ai", "claude-code")
  try {
    const manifest = record(JSON.parse(await readFile(join(root, "package.json"), "utf8")))
    const binValue = record(manifest.bin).claude
    const bin = typeof binValue === "string" ? binValue : ""
    if (!bin) return null
    const entry = join(root, bin)
    await access(entry)
    return entry
  } catch {
    return null
  }
}

const nativeCandidates = (): string[] => {
  if (process.platform !== "win32")
    return [
      join(homedir(), ".local", "bin", "claude"),
      join(homedir(), ".claude", "local", "claude"),
    ]
  const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local")
  return [
    join(homedir(), ".local", "bin", "claude.exe"),
    join(localAppData, "Programs", "claude", "claude.exe"),
    join(localAppData, "claude", "claude.exe"),
  ]
}

/**
 * Discover the user-installed Claude Code CLI. MeldShell never ships Claude Code;
 * the Agent SDK is only the protocol client and must target this executable.
 * Any runnable install is accepted; the probe connection is the compatibility check.
 */
export const discoverClaude = async (): Promise<ClaudeCommand> => {
  const override = process.env.MELDSHELL_CLAUDE_EXECUTABLE
  const found = override ?? (await which("claude", { nothrow: true }))
  let claudePath: string | null = null

  if (found && /\.(cmd|bat|ps1)$/i.test(found)) claudePath = await npmEntry(found)
  else if (found && /\.(m?js)$/i.test(found)) claudePath = found
  else if (found && !/\.(cmd|bat|ps1)$/i.test(found)) claudePath = found

  if (!claudePath && !override) {
    for (const candidate of nativeCandidates()) {
      if (await exists(candidate)) {
        claudePath = candidate
        break
      }
    }
  }

  if (!claudePath) {
    if (override)
      throw new Error(
        "Claude executable override could not be resolved to a native or JavaScript entrypoint.",
      )
    throw new Error(
      "Claude Code is not installed or is not available on PATH. Install Claude Code, then check again.",
    )
  }

  const { command, args } = await versionArgs(claudePath)
  const version = await versionOf(command, args)

  return {
    claudePath,
    version,
    executablePath: found ?? claudePath,
  }
}
