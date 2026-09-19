import { spawn } from "node:child_process"

export const stopProcessTree = (pid: number): Promise<void> =>
  new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      try {
        process.kill(pid, "SIGTERM")
        resolve()
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ESRCH") resolve()
        else reject(cause)
      }
      return
    }
    const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error("Timed out terminating the Codex process tree."))
    }, 5_000)
    child.once("error", (cause) => {
      clearTimeout(timeout)
      reject(cause)
    })
    child.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
