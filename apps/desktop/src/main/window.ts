import { join } from "node:path"
import { logStartupTiming } from "./runtime/startup-timing"
import type { AppSnapshot } from "@meldshell/contracts"
import { is } from "@electron-toolkit/utils"
import { guardPreviews } from "./preview"
import { app, BrowserWindow, Menu, nativeTheme, shell, type Event, type Rectangle } from "electron"

let mainWindow: BrowserWindow | null = null
/** Threads popped out into windows of their own, by thread id. */
const threadWindows = new Map<string, BrowserWindow>()

export const getMainWindow = (): BrowserWindow | null => mainWindow

export const getThreadWindow = (threadId: string): BrowserWindow | undefined =>
  threadWindows.get(threadId)

export const threadWindowIds = (): string[] => [...threadWindows.keys()]

/** Every window that shows the app: the main window and each popped-out thread. */
export const appWindows = (): BrowserWindow[] =>
  [mainWindow, ...threadWindows.values()].filter(
    (window): window is BrowserWindow => window !== null && !window.isDestroyed(),
  )

/** The window that shows a thread: its own when it was popped out, else the main window. */
export const windowForThread = (threadId: unknown): BrowserWindow | null => {
  const own = typeof threadId === "string" ? threadWindows.get(threadId) : undefined
  return own !== undefined && !own.isDestroyed() ? own : mainWindow
}

const updateCaptionTheme = (): void => {
  for (const window of appWindows())
    window.setTitleBarOverlay({
      symbolColor: nativeTheme.shouldUseDarkColors ? "#f2f2f3" : "#202024",
    })
}
nativeTheme.on("updated", updateCaptionTheme)
export const applyAppearance = (snapshot: AppSnapshot): void => {
  nativeTheme.themeSource = snapshot.settings.theme ?? "dark"
  updateCaptionTheme()
}

// Electron's default menu carries browser shortcuts: Ctrl+W closes the window, Ctrl+R reloads,
// Ctrl+=/- zoom the page, and Alt reveals a hidden menu bar. MeldShell defines its own shortcuts,
// so only macOS keeps a menu, where the edit roles back its copy and paste keys.
export const installApplicationMenu = (): void => {
  Menu.setApplicationMenu(
    process.platform === "darwin"
      ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }])
      : null,
  )
}

// Development keeps the reload and inspector keys the removed menu provided.
const watchDevelopmentShortcuts = (window: BrowserWindow): void => {
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return
    const command = input.control || input.meta
    if (input.code === "F12" || (command && input.shift && input.code === "KeyI")) {
      event.preventDefault()
      window.webContents.toggleDevTools()
    } else if (command && input.code === "KeyR") {
      event.preventDefault()
      if (input.shift) window.webContents.reloadIgnoringCache()
      else window.webContents.reload()
    }
  })
}

export const THREAD_WINDOW_MIN = { width: 420, height: 400 } as const

/** A window that shows the renderer, framed and locked down alike for every app window. */
function createAppWindow(
  frame: Partial<Rectangle> & {
    width: number
    height: number
    minWidth: number
    minHeight: number
  },
  query: Record<string, string> = {},
): BrowserWindow {
  const window = new BrowserWindow({
    icon: join(app.getAppPath(), "resources/icon.png"),
    ...frame,
    show: false,
    // Linux has no acrylic backdrop; keep its backing opaque even before the renderer loads.
    backgroundColor: process.platform === "linux" ? "#161617" : "#00000000",
    backgroundMaterial: process.platform === "linux" ? "none" : "acrylic",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: nativeTheme.shouldUseDarkColors ? "#f2f2f3" : "#202024",
      height: 44,
    },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The thread preview shows pages in `<webview>`; `guardPreviews` locks each guest down.
      webviewTag: true,
    },
  })

  if (is.dev) watchDevelopmentShortcuts(window)
  guardPreviews(window)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"), { query })
  }
  return window
}

export const createWindow = (onClose: (event: Event) => void): void => {
  const window = createAppWindow({ width: 1440, height: 920, minWidth: 720, minHeight: 520 })
  mainWindow = window
  window.on("close", onClose)
  window.once("ready-to-show", () => {
    logStartupTiming("ready-to-show")
    window.show()
  })
  window.on("closed", () => {
    mainWindow = null
  })
}

/** Opens a window that shows only one thread; the renderer reads the thread from its address. */
export const createThreadWindow = (threadId: string, bounds: Rectangle): BrowserWindow => {
  // A lone thread needs no sidebars, so its window can narrow to a strip beside other work.
  const window = createAppWindow(
    { ...bounds, minWidth: THREAD_WINDOW_MIN.width, minHeight: THREAD_WINDOW_MIN.height },
    { thread: threadId },
  )
  threadWindows.set(threadId, window)
  window.once("ready-to-show", () => window.show())
  window.on("closed", () => {
    if (threadWindows.get(threadId) === window) threadWindows.delete(threadId)
  })
  return window
}
