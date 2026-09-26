import { fork } from "node:child_process"
import type { HostProcess } from "@meldshell/host/platform"

/**
 * Node children for the headless and WSL hosts. Their output goes to stderr because stdout may be
 * the desktop protocol pipe. Linux children own Linux PIDs; the Windows app never kills them.
 */
export function forkWorker(
  entry: string,
  env: Record<string, string> | undefined,
  bundled = false,
): HostProcess {
  const child = fork(new URL(bundled ? "./worker.js" : "./worker.ts", import.meta.url), [entry], {
    execArgv: bundled ? [] : ["--import", "tsx"],
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    serialization: "advanced",
  })
  child.stdout?.pipe(process.stderr)
  child.stderr?.pipe(process.stderr)
  const exits = new Map<(code: number) => void, (code: number | null) => void>()
  return {
    get pid() {
      return child.exitCode === null ? child.pid : undefined
    },
    stdout: null,
    stderr: null,
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
    off: (event, listener) => {
      if (event === "message") return child.off("message", listener)
      const wrapper = exits.get(listener as (code: number) => void)
      if (wrapper) child.off("exit", wrapper)
      exits.delete(listener as (code: number) => void)
    },
  }
}
