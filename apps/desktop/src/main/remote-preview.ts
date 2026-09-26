import { BrowserWindow } from "electron"
import { Schema } from "effect"
import { RemotePreviewInput, type RemotePreviewFrame } from "@meldshell/contracts/remote-preview"

interface View {
  window: BrowserWindow
  timer: NodeJS.Timeout
  error: string | null
}
const views = new Map<string, View>()
const guardedSessions = new WeakSet<Electron.Session>()
const destroy = (id: string) => {
  const view = views.get(id)
  if (!view) return
  views.delete(id)
  clearTimeout(view.timer)
  view.window.destroy()
}
const address = (input: string): string => {
  const url = new URL(input)
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Enter an HTTP or HTTPS address.")
  return url.href
}

function create(id: string): View {
  if (views.size >= 8) throw new Error("Close a remote preview before opening another.")
  const window = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    useContentSize: true,
    webPreferences: {
      partition: "meldshell-remote-preview",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      offscreen: true,
      disableDialogs: true,
    },
  })
  const contents = window.webContents
  contents.setFrameRate(5)
  contents.setWindowOpenHandler(() => ({ action: "deny" }))
  if (!guardedSessions.has(contents.session)) {
    guardedSessions.add(contents.session)
    contents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    )
    contents.session.setPermissionCheckHandler(() => false)
    contents.session.on("will-download", (event) => event.preventDefault())
  }
  const guard = (event: Electron.Event, url: string) => {
    try {
      address(url)
    } catch {
      event.preventDefault()
    }
  }
  contents.on("will-navigate", guard)
  contents.on("will-redirect", guard)
  const view: View = { window, timer: setTimeout(() => destroy(id), 60_000), error: null }
  views.set(id, view)
  contents.on("did-fail-load", (_event, code, description, _url, main) => {
    if (main && code !== -3) view.error = description
  })
  contents.on("did-start-loading", () => {
    view.error = null
  })
  window.on("closed", () => {
    clearTimeout(view.timer)
    views.delete(id)
  })
  return view
}

// Browsers report DOM key names; Electron accepts accelerator names, which differ only for arrows.
const ACCELERATOR_KEYS: Readonly<Record<string, string>> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
}

function pointer(contents: Electron.WebContents, input: typeof RemotePreviewInput.Type) {
  if (input.action === "mouseWheel")
    contents.sendInputEvent({
      type: "mouseWheel",
      x: input.x ?? 0,
      y: input.y ?? 0,
      deltaX: -(input.deltaX ?? 0),
      deltaY: -(input.deltaY ?? 0),
    })
  else if (
    input.action === "mouseDown" ||
    input.action === "mouseUp" ||
    input.action === "mouseMove"
  )
    contents.sendInputEvent({
      type: input.action,
      x: input.x ?? 0,
      y: input.y ?? 0,
      button: input.button ?? "left",
      clickCount: 1,
      modifiers: [...(input.modifiers ?? [])],
    })
}

async function interact(view: View, input: typeof RemotePreviewInput.Type): Promise<void> {
  const contents = view.window.webContents
  if (input.action === "navigate") {
    void contents.loadURL(address(input.url ?? "")).catch((cause: unknown) => {
      view.error = cause instanceof Error ? cause.message : String(cause)
    })
  } else if (input.action === "reload") contents.reload()
  else if (input.action === "back" && contents.navigationHistory.canGoBack())
    contents.navigationHistory.goBack()
  else if (input.action === "forward" && contents.navigationHistory.canGoForward())
    contents.navigationHistory.goForward()
  else if (input.action === "text") await contents.insertText(input.text ?? "")
  else if (input.action === "keyDown" || input.action === "keyUp") {
    const key = input.key ?? ""
    const modifiers = [...(input.modifiers ?? [])]
    contents.sendInputEvent({
      type: input.action,
      keyCode: ACCELERATOR_KEYS[key] ?? key,
      modifiers,
    })
    // Chromium submits forms and inserts line breaks from the character event, not the key press.
    if (input.action === "keyDown" && key === "Enter")
      contents.sendInputEvent({ type: "char", keyCode: "\r", modifiers })
  } else pointer(contents, input)
}

/** Pages execute only in an isolated host browser. The account UI receives pixels, never page code. */
export async function remotePreview(raw: unknown): Promise<RemotePreviewFrame | null> {
  const input = Schema.decodeUnknownSync(RemotePreviewInput)(raw)
  if (input.action === "close") {
    destroy(input.id)
    return null
  }
  if (input.action === "navigate") address(input.url ?? "")
  const view = views.get(input.id) ?? (input.action === "navigate" ? create(input.id) : undefined)
  if (!view) throw new Error("This preview ended. Reload the address to reconnect it.")
  view.timer.refresh()
  const contents = view.window.webContents
  await interact(view, input)
  if (input.action !== "capture") return null
  if (input.width && input.height) {
    const [width, height] = view.window.getContentSize()
    if (width !== input.width || height !== input.height)
      view.window.setContentSize(input.width, input.height)
  }
  const image = await contents.capturePage()
  const [width, height] = view.window.getContentSize()
  return {
    image: `data:image/jpeg;base64,${image.toJPEG(70).toString("base64")}`,
    url: contents.getURL(),
    title: contents.getTitle(),
    width,
    height,
    back: contents.navigationHistory.canGoBack(),
    forward: contents.navigationHistory.canGoForward(),
    error: view.error,
  }
}
