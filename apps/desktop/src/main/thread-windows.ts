import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { app, ipcMain, screen, type BrowserWindow, type Rectangle } from "electron"
import { IPC } from "@meldshell/contracts/ipc"
import {
  appWindows,
  createThreadWindow,
  getMainWindow,
  getThreadWindow,
  THREAD_WINDOW_MIN,
  threadWindowIds,
} from "./window"

/*
 * Threads popped out into windows of their own, usually onto a second monitor. Each window runs the
 * same renderer with the thread in its address. The main window routes that thread to it, and
 * events about the thread go to the window that shows it.
 *
 * Where each window sits is remembered, and windows still open when the app quits open again at the
 * next launch.
 */

interface SavedWindow {
  readonly threadId: string
  readonly bounds: Rectangle
}

interface SavedState {
  /** Where the last thread window was; the next one opens there. */
  readonly last?: Rectangle
  readonly open: readonly SavedWindow[]
}

const file = () => join(app.getPath("userData"), "thread-windows.json")

const isRectangle = (value: unknown): value is Rectangle => {
  if (value === null || typeof value !== "object") return false
  const { x, y, width, height } = value as Record<string, unknown>
  return [x, y, width, height].every((part) => typeof part === "number" && Number.isFinite(part))
}

async function readState(): Promise<SavedState> {
  const raw: unknown = await readFile(file(), "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null)
  if (raw === null || typeof raw !== "object") return { open: [] }
  const { last, open } = raw as Record<string, unknown>
  return {
    last: isRectangle(last) ? last : undefined,
    open: Array.isArray(open)
      ? open.filter(
          (entry): entry is SavedWindow =>
            typeof entry?.threadId === "string" && isRectangle(entry.bounds),
        )
      : [],
  }
}

let state: SavedState = { open: [] }
let loaded: Promise<void> = Promise.resolve()
let writing = Promise.resolve()

/** Writes are queued so an older state never lands after a newer one. */
function save(next: SavedState): void {
  state = next
  writing = writing
    .then(async () => {
      await mkdir(dirname(file()), { recursive: true })
      await writeFile(`${file()}.tmp`, `${JSON.stringify(state)}\n`)
      await rename(`${file()}.tmp`, file())
    })
    .catch((cause: unknown) => console.error("Could not remember thread windows.", cause))
}

let quitting = false

/** Whether at least a usable corner of `bounds` shows on a connected display. */
const onScreen = (bounds: Rectangle): boolean =>
  screen.getAllDisplays().some(({ workArea }) => {
    const width = Math.min(bounds.x + bounds.width, workArea.x + workArea.width)
    const height = Math.min(bounds.y + bounds.height, workArea.y + workArea.height)
    return (
      width - Math.max(bounds.x, workArea.x) >= 120 && height - Math.max(bounds.y, workArea.y) >= 80
    )
  })

const CASCADE = 28

/**
 * Where a new thread window opens: where the last one was, else centred on a display the main
 * window is not on, else offset from the main window. Windows opened at one spot cascade.
 */
function placement(): Rectangle {
  const main = getMainWindow()
  const mainBounds = main !== null && !main.isDestroyed() ? main.getBounds() : undefined
  let bounds: Rectangle
  if (state.last !== undefined && onScreen(state.last)) bounds = { ...state.last }
  else {
    const home =
      mainBounds === undefined ? screen.getPrimaryDisplay() : screen.getDisplayMatching(mainBounds)
    const other = screen.getAllDisplays().find((display) => display.id !== home.id)
    const area = (other ?? home).workArea
    const width = Math.max(THREAD_WINDOW_MIN.width, Math.min(980, area.width - 2 * CASCADE))
    const height = Math.max(THREAD_WINDOW_MIN.height, Math.min(1000, area.height - 2 * CASCADE))
    const centred = {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
    }
    const offset =
      other === undefined && mainBounds !== undefined
        ? { x: mainBounds.x + 2 * CASCADE, y: mainBounds.y + 2 * CASCADE }
        : centred
    bounds = {
      width,
      height,
      x: Math.min(Math.max(offset.x, area.x), area.x + area.width - width),
      y: Math.min(Math.max(offset.y, area.y), area.y + area.height - height),
    }
  }
  const taken = new Set(
    appWindows().map((window) => {
      const { x, y } = window.getBounds()
      return `${x},${y}`
    }),
  )
  while (taken.has(`${bounds.x},${bounds.y}`)) {
    bounds.x += CASCADE
    bounds.y += CASCADE
  }
  return bounds
}

function broadcast(): void {
  const ids = threadWindowIds()
  for (const window of appWindows()) window.webContents.send(IPC.threadWindowsChanged, ids)
}

function remember(threadId: string, window: BrowserWindow): void {
  if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()
  save({
    last: bounds,
    open: [...state.open.filter((entry) => entry.threadId !== threadId), { threadId, bounds }],
  })
}

function open(threadId: string, bounds = placement()): BrowserWindow {
  const existing = getThreadWindow(threadId)
  if (existing !== undefined && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return existing
  }
  const window = createThreadWindow(threadId, bounds)
  let settle: NodeJS.Timeout | undefined
  const track = () => {
    clearTimeout(settle)
    settle = setTimeout(() => remember(threadId, window), 400)
  }
  window.on("move", track)
  window.on("resize", track)
  window.on("close", () => {
    clearTimeout(settle)
    remember(threadId, window)
  })
  window.on("closed", () => {
    // Windows still open when the app quits come back at the next launch.
    if (!quitting)
      save({ ...state, open: state.open.filter((entry) => entry.threadId !== threadId) })
    broadcast()
  })
  remember(threadId, window)
  broadcast()
  return window
}

/** Closes a thread's window and shows the thread in the main window, as a tab there. */
function dock(threadId: string): void {
  const main = getMainWindow()
  const own = getThreadWindow(threadId)
  const reveal = () => {
    if (main === null || main.isDestroyed()) return
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
    main.webContents.send(IPC.attentionRequested, threadId)
  }
  if (own === undefined || own.isDestroyed()) return reveal()
  // The main window learns the window closed before it is asked to show the thread.
  own.once("closed", reveal)
  own.close()
}

export function registerThreadWindows(): void {
  app.on("before-quit", () => {
    quitting = true
  })
  const threadId = (value: unknown): string => {
    if (typeof value !== "string" || value === "") throw new Error("A window shows one thread.")
    return value
  }
  ipcMain.handle(IPC.openThreadWindow, async (_event, value: unknown) => {
    const id = threadId(value)
    await loaded
    open(id)
  })
  ipcMain.handle(IPC.dockThreadWindow, (_event, value: unknown) => dock(threadId(value)))
  ipcMain.handle(IPC.listThreadWindows, () => threadWindowIds())
}

/** Opens the thread windows that were open when the app last quit, where they were. */
export function restoreThreadWindows(): Promise<void> {
  loaded = readState().then((saved) => {
    state = saved
    for (const { threadId, bounds } of saved.open)
      open(threadId, onScreen(bounds) ? bounds : placement())
  })
  return loaded
}
