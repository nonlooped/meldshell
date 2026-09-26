import { basename } from "node:path"
import which from "which"
import type { IPty } from "node-pty"
import { IPC, type TerminalOpenInput, type TerminalSession } from "@meldshell/contracts/ipc"
import type { Host } from "./host"
import { childEnvironment } from "./environment"

interface Terminal {
  pty?: IPty
  closed: boolean
  pending: string
  flush?: NodeJS.Timeout | undefined
}

const dimension = (value: number, fallback: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.min(1000, Math.floor(value))) : fallback

function shellCommand(): { file: string; args: string[] } {
  if (process.platform === "win32")
    return {
      file:
        which.sync("pwsh.exe", { nothrow: true }) ??
        which.sync("powershell.exe", { nothrow: true }) ??
        process.env.COMSPEC ??
        "cmd.exe",
      args: [],
    }
  return {
    file: process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"),
    args: process.platform === "darwin" ? ["-l"] : [],
  }
}

/** PTYs live alongside the host, including when the desktop is on Windows and the host is Linux. */
export function createTerminals(
  host: Pick<Host, "terminalContext">,
  send: (channel: string, args: unknown[]) => void,
) {
  const sessions = new Map<string, Terminal>()
  const flush = (id: string, entry: Terminal) => {
    clearTimeout(entry.flush)
    entry.flush = undefined
    if (entry.pending) send(IPC.terminalData, [id, entry.pending])
    entry.pending = ""
  }
  const close = async (id: string): Promise<void> => {
    const entry = sessions.get(id)
    if (!entry) return
    entry.closed = true
    sessions.delete(id)
    clearTimeout(entry.flush)
    try {
      entry.pty?.kill()
    } catch {
      /* Already exited. */
    }
  }
  return {
    open: async (input: TerminalOpenInput): Promise<TerminalSession> => {
      if (typeof input?.id !== "string" || typeof input.threadId !== "string")
        throw new Error("A terminal needs a thread.")
      if (sessions.has(input.id)) throw new Error("This terminal is already open.")
      const entry: Terminal = { closed: false, pending: "" }
      sessions.set(input.id, entry)
      try {
        const { file, args } = shellCommand()
        const { cwd, env, run } = await host.terminalContext(input, input.run)
        const { spawn } = await import("node-pty")
        if (entry.closed) throw new Error("This terminal was closed while opening.")
        const pty = spawn(file, args, {
          name: "xterm-256color",
          cwd,
          env: childEnvironment({
            ...env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            TERM_PROGRAM: "MeldShell",
          }),
          cols: dimension(input.cols, 80),
          rows: dimension(input.rows, 24),
        })
        entry.pty = pty
        pty.onData((data) => {
          entry.pending += data
          if (entry.pending.length >= 64 * 1024) flush(input.id, entry)
          else entry.flush ??= setTimeout(() => flush(input.id, entry), 4)
        })
        pty.onExit(({ exitCode }) => {
          if (sessions.get(input.id) !== entry) return
          flush(input.id, entry)
          sessions.delete(input.id)
          send(IPC.terminalExit, [input.id, exitCode])
        })
        if (run !== null) pty.write(`${run.command}\r`)
        return {
          cwd,
          windowsPty: process.platform === "win32",
          shell: basename(file).replace(/\.exe$/i, ""),
          ...(run === null ? {} : { run }),
        }
      } catch (cause) {
        if (sessions.get(input.id) === entry) await close(input.id)
        throw cause
      }
    },
    write: (id: string, data: string) => {
      if (typeof data === "string") sessions.get(id)?.pty?.write(data)
    },
    resize: (id: string, cols: number, rows: number) => {
      const pty = sessions.get(id)?.pty
      try {
        pty?.resize(dimension(cols, 80), dimension(rows, 24))
      } catch {
        /* Resize races exit. */
      }
    },
    close,
    closeAll: async () => {
      await Promise.all([...sessions.keys()].map(close))
    },
  }
}
