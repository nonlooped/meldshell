import { spawn } from "node:child_process"
import type { Options } from "@anthropic-ai/claude-agent-sdk"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"

type SpawnClaudeProcess = NonNullable<Options["spawnClaudeCodeProcess"]>

/**
 * Starts the Claude Code process the SDK asks for, with the SDK's resolved command and arguments
 * so JavaScript entrypoints run as `node <script> …`. Its pid is reported so the host can stop it
 * if this worker dies first.
 */
export const spawnClaudeProcess =
  (report: { readonly started: (pid: number) => void; readonly stopped: (pid: number) => void }) =>
  (options: Parameters<SpawnClaudeProcess>[0]): ReturnType<SpawnClaudeProcess> => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      signal: options.signal,
    })
    if (process.platform === "win32") {
      const kill = child.kill.bind(child)
      let killing = false
      // The SDK's forwarded abort calls child.kill(). TerminateProcess alone leaves tool
      // descendants holding stdout open, so the query iterator never finishes cancelling.
      child.kill = (signal) => {
        if (child.exitCode !== null || child.signalCode !== null) return false
        if (child.pid === undefined) return kill(signal)
        if (!killing) {
          killing = true
          void stopProcessTree(child.pid).catch((cause) => {
            console.error("Could not stop the Claude process tree.", cause)
            kill(signal)
          })
        }
        return true
      }
    }
    // Drain stderr without logging prompts, credentials, or tool output to the host console.
    child.stderr.resume()
    const { pid } = child
    if (pid) {
      report.started(pid)
      child.once("exit", () => report.stopped(pid))
    }
    return child
  }
