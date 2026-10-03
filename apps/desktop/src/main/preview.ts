import {
  type BrowserWindow,
  ipcMain,
  session,
  shell,
  webContents,
  type WebContents,
} from "electron"
import { IPC } from "@meldshell/contracts/ipc"
import { threadPort } from "@meldshell/host/workspace-scripts"

/*
 * The in-app browser preview. The renderer shows pages in `<webview>` elements; every guest is
 * forced into a sandbox with no preload and its own session, may only show http and https pages,
 * and hands new windows to the system browser.
 */

/** Keeps preview cookies and storage apart from the app's own session. */
export const PREVIEW_PARTITION = "persist:meldshell-preview"

const webAddress = (url: unknown): url is string =>
  typeof url === "string" && /^https?:\/\//i.test(url)

/** The preview page a window names by id, or null unless it is a preview guest of that window. */
export const previewGuest = (host: WebContents, id: unknown): WebContents | null => {
  if (typeof id !== "number") return null
  const page = webContents.fromId(id)
  if (
    page === undefined ||
    page.isDestroyed() ||
    page.getType() !== "webview" ||
    page.hostWebContents !== host ||
    page.session !== session.fromPartition(PREVIEW_PARTITION)
  )
    return null
  return page
}

export function guardPreviews(window: BrowserWindow): void {
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    if (!webAddress(params.src) || params.partition !== PREVIEW_PARTITION) event.preventDefault()
  })
  window.webContents.on("did-attach-webview", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (webAddress(url)) void shell.openExternal(url)
      return { action: "deny" }
    })
    contents.on("will-navigate", (event, url) => {
      if (!webAddress(url)) event.preventDefault()
    })
  })
}

export function registerPreviewIpc(): void {
  ipcMain.handle(IPC.threadPort, (_event, threadId: unknown) => {
    if (typeof threadId !== "string") throw new Error("A port belongs to a thread.")
    return threadPort(threadId)
  })
  ipcMain.handle(IPC.openExternal, async (_event, url: unknown) => {
    if (!webAddress(url)) throw new Error("Only web addresses open in the browser.")
    await shell.openExternal(url)
  })
}
