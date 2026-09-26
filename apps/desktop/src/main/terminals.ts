import { ipcMain, type WebContents } from "electron"
import { IPC, type TerminalOpenInput, type TerminalSession } from "@meldshell/contracts/ipc"
import { desktopHost } from "./runtime/services"

// Renderer ownership stays in Electron; PTYs and their children belong to the host environment.
const sessions = new Map<string, WebContents>()
const watchedOwners = new WeakSet<WebContents>()
const send = (owner: WebContents, channel: string, ...args: unknown[]) => {
  if (!owner.isDestroyed()) owner.send(channel, ...args)
}
async function close(id: string): Promise<void> {
  if (!sessions.delete(id)) return
  await (await desktopHost.start()).request("terminal.close", id).catch(() => undefined)
}
function watchOwner(owner: WebContents): void {
  if (watchedOwners.has(owner)) return
  watchedOwners.add(owner)
  const closeOwned = () => {
    for (const [id, candidate] of sessions) if (candidate === owner) void close(id)
  }
  owner.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) closeOwned()
  })
  owner.on("render-process-gone", closeOwned)
  owner.once("destroyed", closeOwned)
}
async function open(owner: WebContents, input: TerminalOpenInput): Promise<TerminalSession> {
  if (typeof input?.id !== "string" || typeof input.threadId !== "string")
    throw new Error("A terminal needs a thread.")
  if (sessions.has(input.id)) throw new Error("This terminal is already open.")
  sessions.set(input.id, owner)
  watchOwner(owner)
  try {
    return await (await desktopHost.start()).request("terminal.open", input)
  } catch (cause) {
    sessions.delete(input.id)
    throw cause
  }
}
export function registerTerminalIpc(): void {
  desktopHost.subscribe((channel, args) => {
    if (channel === "host:disconnected") {
      for (const [id, owner] of sessions) send(owner, IPC.terminalExit, id, 1)
      sessions.clear()
      return
    }
    if (channel !== IPC.terminalData && channel !== IPC.terminalExit) return
    const id = args[0]
    const owner = typeof id === "string" ? sessions.get(id) : undefined
    if (!owner) return
    send(owner, channel, ...args)
    if (channel === IPC.terminalExit) sessions.delete(id as string)
  })
  ipcMain.handle(IPC.terminalOpen, (event, input: TerminalOpenInput) => open(event.sender, input))
  // An open session implies a live connection, so these resolve immediately and never reconnect.
  ipcMain.on(IPC.terminalWrite, (event, id: unknown, data: unknown) => {
    if (typeof id !== "string" || typeof data !== "string" || sessions.get(id) !== event.sender)
      return
    void desktopHost
      .start()
      .then((host) => host.notify("terminal.write", id, data))
      .catch(() => undefined)
  })
  ipcMain.on(IPC.terminalResize, (event, id: unknown, cols: unknown, rows: unknown) => {
    if (
      typeof id !== "string" ||
      typeof cols !== "number" ||
      typeof rows !== "number" ||
      sessions.get(id) !== event.sender
    )
      return
    void desktopHost
      .start()
      .then((host) => host.notify("terminal.resize", id, cols, rows))
      .catch(() => undefined)
  })
  ipcMain.on(IPC.terminalClose, (event, id: unknown) => {
    if (typeof id === "string" && sessions.get(id) === event.sender) void close(id)
  })
}
/** Host shutdown owns terminating every PTY, including terminals still opening. */
export function closeTerminals(): void {
  sessions.clear()
}
