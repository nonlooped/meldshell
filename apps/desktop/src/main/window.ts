import { join } from "node:path"
import { logStartupTiming } from "./runtime/startup-timing"
import type { AppSnapshot } from "@meldshell/contracts"
import { is } from "@electron-toolkit/utils"
import { BrowserWindow, nativeTheme, shell, type Event } from "electron"

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

export const createWindow = (onClose: (event: Event) => void): void => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
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
    },
  })

  mainWindow = window
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
