import { execa } from "execa"
import { stopProcessTree } from "./process-tree"

export interface CommandResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}

/**
 * Runs a command to completion and returns its trimmed output. Windows command shims such as
 * `codex.cmd` start without quoting of our own. A command still running at the deadline is stopped
 * with everything it started, and the call fails, as it does when the command cannot start.
 */
export const runCommand = async (
  file: string,
  args: ReadonlyArray<string>,
  options: {
    readonly timeoutMs: number
    readonly env?: Readonly<Record<string, string>>
    /** Stops the command early; the call then fails. */
    readonly signal?: AbortSignal
  },
): Promise<CommandResult> => {
  const subprocess = execa(file, args, {
    reject: false,
    stdin: "ignore",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.signal === undefined ? {} : { cancelSignal: options.signal }),
  })
  let timedOut = false
  const deadline = setTimeout(() => {
    timedOut = true
    if (subprocess.pid === undefined) subprocess.kill()
    else void stopProcessTree(subprocess.pid).catch(() => subprocess.kill())
  }, options.timeoutMs)
  try {
    const result = await subprocess
    if (timedOut) throw new Error(`${[file, ...args].join(" ")} did not finish in time.`)
    if (result.isCanceled) throw new Error(`${[file, ...args].join(" ")} was cancelled.`)
    if (result.failed && result.exitCode === undefined) throw new Error(result.shortMessage)
    return {
      exitCode: result.exitCode ?? null,
      stdout: String(result.stdout).trim(),
      stderr: String(result.stderr).trim(),
    }
  } finally {
    clearTimeout(deadline)
  }
}
