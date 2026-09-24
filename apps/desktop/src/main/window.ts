import { join } from "node:path"
import { logStartupTiming } from "./runtime/startup-timing"
import type { AppSnapshot } from "@meldshell/contracts"
import { is } from "@electron-toolkit/utils"
import { guardPreviews } from "./preview"
import { app, BrowserWindow, Menu, nativeTheme, shell, type Event } from "electron"

let mainWindow: BrowserWindow | null = null

export const getMainWindow = (): BrowserWindow | null => mainWindow

const updateCaptionTheme = (): void => {
  mainWindow?.setTitleBarOverlay({
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

export const createWindow = (onClose: (event: Event) => void): void => {
  const window = new BrowserWindow({
    icon: join(app.getAppPath(), "resources/icon.png"),
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    // Linux has no acrylic backdrop; keep its backing opaque even before the renderer loads.
    backgroundColor: process.platform === "linux" ? "#161617" : "#00000000",
    backgroundMaterial: process.platform === "linux" ? "none" : "acrylic",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: "#f2f2f3",
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

  mainWindow = window
  if (is.dev) watchDevelopmentShortcuts(window)
  guardPreviews(window)
  window.on("close", onClose)
  window.once("ready-to-show", () => {
    logStartupTiming("ready-to-show")
    window.show()
  })
  window.on("closed", () => {
    mainWindow = null
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"))
  }
}
