import treeKill from "tree-kill"

/** A Windows `taskkill` that has not finished by then is abandoned. */
const TIMEOUT_MS = 5_000

const running = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Ends a process and every process it started. A process that has already exited is not an error. */
export const stopProcessTree = (pid: number, signal: NodeJS.Signals = "SIGTERM"): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out stopping process ${pid} and its children.`)),
      TIMEOUT_MS,
    )
    treeKill(pid, signal, (error) => {
      clearTimeout(timeout)
      if (error === undefined || !running(pid)) resolve()
      else reject(error)
    })
  })
