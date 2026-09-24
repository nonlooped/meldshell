import { basename } from "node:path"
import { ipcMain, type WebContents } from "electron"
import { spawn, type IPty } from "node-pty"
import which from "which"
import { IPC, type TerminalOpenInput, type TerminalSession } from "@meldshell/contracts/ipc"
import { desktopHost } from "./runtime/services"

/*
 * Thread terminals. Each shell runs in a pseudo-terminal owned by this process, so it keeps running
 * while its view is detached — another thread selected, a tab closed — and ends only when the
 * renderer closes it, the renderer that opened it goes away, or MeldShell quits.
 */

interface Session {
  readonly pty: IPty
  readonly owner: WebContents
  pending: string
  flush: NodeJS.Timeout | undefined
}

const sessions = new Map<string, Session>()
const watchedOwners = new WeakSet<WebContents>()

// Streams arrive in small chunks; a short window merges them into fewer IPC messages.
const flushDelay = 4

function shellCommand(): { readonly file: string; readonly args: string[] } {
  if (process.platform === "win32")
    return {
      file:
        which.sync("pwsh.exe", { nothrow: true }) ??
        which.sync("powershell.exe", { nothrow: true }) ??
        process.env.COMSPEC ??
        "cmd.exe",
      args: [],
    }
  const file = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash")
  // macOS terminals start login shells, which is where its PATH is assembled.
  return { file, args: process.platform === "darwin" ? ["-l"] : [] }
}

function shellEnvironment(scripts: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    // Electron's own switches would change how child Node or Electron processes start.
    if (value !== undefined && !key.startsWith("ELECTRON_")) env[key] = value
  }
  return {
    ...env,
    ...scripts,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TERM_PROGRAM: "MeldShell",
  }
}

const dimension = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(1000, Math.floor(value)))
    : fallback

function send(session: Session, channel: string, ...args: unknown[]): void {
  if (!session.owner.isDestroyed()) session.owner.send(channel, ...args)
}

function flush(id: string, session: Session): void {
  session.flush = undefined
  if (session.pending === "") return
  send(session, IPC.terminalData, id, session.pending)
  session.pending = ""
}

function close(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  sessions.delete(id)
  clearTimeout(session.flush)
  try {
    session.pty.kill()
  } catch {
    // The shell has already exited.
  }
}

function closeOwnedBy(owner: WebContents): void {
  for (const [id, session] of sessions) if (session.owner === owner) close(id)
}

/** A reload or crash leaves no view to show these shells again, so they end with it. */
function watchOwner(owner: WebContents): void {
  if (watchedOwners.has(owner)) return
  watchedOwners.add(owner)
  owner.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) closeOwnedBy(owner)
  })
  owner.on("render-process-gone", () => closeOwnedBy(owner))
  owner.once("destroyed", () => closeOwnedBy(owner))
}

async function open(owner: WebContents, input: TerminalOpenInput): Promise<TerminalSession> {
  if (typeof input?.id !== "string" || typeof input.threadId !== "string")
    throw new Error("A terminal needs a thread.")
  if (sessions.has(input.id)) throw new Error("This terminal is already open.")
  const host = await desktopHost.start()
  const { cwd, env, run } = await host.terminalContext(
    { workspaceId: input.workspaceId, threadId: input.threadId },
    typeof input.run === "string" ? input.run : undefined,
  )
  const shell = shellCommand()
  const pty = spawn(shell.file, shell.args, {
    name: "xterm-256color",
    cwd,
    env: shellEnvironment(env),
    cols: dimension(input.cols, 80),
    rows: dimension(input.rows, 24),
  })
  const session: Session = { pty, owner, pending: "", flush: undefined }
  sessions.set(input.id, session)
  watchOwner(owner)
  pty.onData((data) => {
    session.pending += data
    session.flush ??= setTimeout(() => flush(input.id, session), flushDelay)
  })
  pty.onExit(({ exitCode }) => {
    if (sessions.get(input.id) !== session) return
    clearTimeout(session.flush)
    flush(input.id, session)
    sessions.delete(input.id)
    send(session, IPC.terminalExit, input.id, exitCode)
  })
  // Typed into the shell rather than passed as its command, so stopping the script leaves a prompt.
  if (run !== null) pty.write(`${run.command}\r`)
  return {
    cwd,
    shell: basename(shell.file).replace(/\.exe$/i, ""),
    ...(run === null ? {} : { run }),
  }
}

export function registerTerminalIpc(): void {
  ipcMain.handle(IPC.terminalOpen, (event, input: TerminalOpenInput) => open(event.sender, input))
  ipcMain.on(IPC.terminalWrite, (event, id: unknown, data: unknown) => {
    const session = typeof id === "string" ? sessions.get(id) : undefined
    if (session?.owner === event.sender && typeof data === "string") session.pty.write(data)
  })
  ipcMain.on(IPC.terminalResize, (event, id: unknown, cols: unknown, rows: unknown) => {
    const session = typeof id === "string" ? sessions.get(id) : undefined
    if (session?.owner !== event.sender) return
    try {
      session.pty.resize(dimension(cols, session.pty.cols), dimension(rows, session.pty.rows))
    } catch {
      // Resizing races the shell's exit; the exit event follows.
    }
  })
  ipcMain.on(IPC.terminalClose, (event, id: unknown) => {
    if (typeof id === "string" && sessions.get(id)?.owner === event.sender) close(id)
  })
}

/** Ends every shell; called once MeldShell has decided to quit. */
export function closeTerminals(): void {
  for (const id of [...sessions.keys()]) close(id)
}
