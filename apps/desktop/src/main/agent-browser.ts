import { randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { BrowserWindow, ipcMain, shell, type WebContents } from "electron"
import { IPC } from "@meldshell/contracts/ipc"
import { asRecord, asText, type UnknownRecord } from "@meldshell/contracts"
import {
  callTool,
  settle,
  toolDefinitions,
  type BrowserActivity,
  type ToolPage,
} from "./agent-browser-tools"
import { PREVIEW_PARTITION, previewGuest } from "./preview"
import { getMainWindow } from "./window"

/*
 * Agents drive each thread's browser preview through a loopback MCP server. Provider workers get
 * its address with an unguessable token; each thread's tools live under the thread's id.
 *
 * Tools act on the `<webview>` the thread's preview panel shows, so the user watches the agent
 * work. When the thread is not on screen, a hidden window with the same session stands in, and the
 * preview takes over its page as soon as the thread is shown again.
 */

/** How long a newly shown preview may take to attach its page before a hidden one stands in. */
const ATTACH_TIMEOUT_MS = 2_500
const LOAD_TIMEOUT_MS = 20_000
const BODY_LIMIT = 1024 * 1024

const visible = new Map<string, WebContents>()
const hidden = new Map<string, BrowserWindow>()
/** The address each thread's page last showed, to reopen it after the preview was closed. */
const lastUrls = new Map<string, string>()
const attachWaiters = new Map<string, Set<(page: WebContents) => void>>()

const sendToWindow = (channel: string, ...args: unknown[]): boolean => {
  const window = getMainWindow()
  if (window === null || window.isDestroyed()) return false
  window.webContents.send(channel, ...args)
  return true
}

const live = (page: WebContents | undefined): page is WebContents =>
  page !== undefined && !page.isDestroyed()

/** Follows a page's address; a hidden page also moves the thread's preview along with it. */
const follow = (threadId: string, page: WebContents, shown: boolean): void => {
  const onNavigate = (url: string) => {
    lastUrls.set(threadId, url)
    if (!shown) sendToWindow(IPC.agentBrowserShow, threadId, url)
  }
  page.on("did-navigate", (_event, url) => onNavigate(url))
  page.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) onNavigate(url)
  })
}

/** Registers the page a thread's preview attached, retiring any hidden stand-in. */
const attach = (threadId: string, page: WebContents): void => {
  if (visible.get(threadId) === page) return
  visible.set(threadId, page)
  follow(threadId, page, true)
  page.once("destroyed", () => {
    if (visible.get(threadId) === page) visible.delete(threadId)
  })
  const standIn = hidden.get(threadId)
  hidden.delete(threadId)
  if (standIn !== undefined && !standIn.isDestroyed()) standIn.destroy()
  const waiters = attachWaiters.get(threadId)
  attachWaiters.delete(threadId)
  for (const resolve of waiters ?? []) resolve(page)
}

const waitForAttach = (threadId: string): Promise<WebContents | null> =>
  new Promise((resolve) => {
    const waiters = attachWaiters.get(threadId) ?? new Set()
    attachWaiters.set(threadId, waiters)
    const done = (page: WebContents | null) => {
      clearTimeout(timer)
      waiters.delete(done)
      resolve(page)
    }
    const timer = setTimeout(() => done(null), ATTACH_TIMEOUT_MS)
    waiters.add(done)
  })

const webAddress = (url: string): boolean => /^https?:\/\//i.test(url)

/** A hidden page for a thread that is not on screen, sandboxed like the preview itself. */
const standIn = (threadId: string): WebContents => {
  const existing = hidden.get(threadId)
  if (existing !== undefined && !existing.isDestroyed()) return existing.webContents
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    useContentSize: true,
    webPreferences: {
      partition: PREVIEW_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      offscreen: true,
    },
  })
  const page = window.webContents
  page.setWindowOpenHandler(({ url }) => {
    if (webAddress(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  page.on("will-navigate", (event, url) => {
    if (!webAddress(url)) event.preventDefault()
  })
  follow(threadId, page, false)
  window.on("closed", () => {
    if (hidden.get(threadId) === window) hidden.delete(threadId)
  })
  hidden.set(threadId, window)
  return page
}

/** Loads an address, resolving with Chromium's error once it fails or null once it loads. */
const load = async (page: WebContents, url: string): Promise<string | null> => {
  const loaded = page.loadURL(url).then(
    () => null,
    (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
  )
  const error = await Promise.race([
    loaded,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
  ])
  // A navigation replaced by a redirect or a newer one reports itself as aborted.
  return error !== null && !/ERR_ABORTED/.test(error) ? error : null
}

const shownPage = (threadId: string): WebContents | null => {
  const page = visible.get(threadId)
  return live(page) ? page : null
}

/** Shows a thread's preview at an address and returns its page, or a hidden one when unseen. */
const open = async (threadId: string, url: string) => {
  const current = shownPage(threadId)
  if (current !== null) return { page: current, error: await load(current, url) }
  const attached = sendToWindow(IPC.agentBrowserShow, threadId, url)
    ? await waitForAttach(threadId)
    : null
  if (attached !== null) {
    // The preview opens on the address itself; load it here only if it has not started yet.
    if (attached.getURL() === url || attached.isLoading()) {
      await settle(attached, LOAD_TIMEOUT_MS)
      return { page: attached, error: null }
    }
    return { page: attached, error: await load(attached, url) }
  }
  const page = standIn(threadId)
  return { page, error: await load(page, url) }
}

const toolPage = (threadId: string): ToolPage => ({
  page: async () => {
    const shown = shownPage(threadId)
    if (shown !== null) return shown
    const standing = hidden.get(threadId)
    if (standing !== undefined && !standing.isDestroyed()) return standing.webContents
    const last = lastUrls.get(threadId)
    if (last === undefined) throw new Error("No page is open. Open one with browser_open first.")
    return (await open(threadId, last)).page
  },
  open: (url) => open(threadId, url),
  report: (activity: BrowserActivity) =>
    void sendToWindow(IPC.agentBrowserActivity, threadId, activity),
})

let server: Server | null = null
let endpoint: string | null = null
const token = randomBytes(24).toString("hex")

/** The address provider workers receive in `MELDSHELL_BROWSER_MCP`, once the server listens. */
export const agentBrowserEndpoint = (): string | null => endpoint

/** Starts the loopback MCP server; the app works on without agent browsing if it cannot. */
export const startAgentBrowser = async (): Promise<void> => {
  if (server !== null) return
  const next = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })
  server = next
  try {
    const port = await new Promise<number>((resolve, reject) => {
      next.once("error", reject)
      next.listen(0, "127.0.0.1", () => {
        const address = next.address()
        if (address === null || typeof address === "string")
          reject(new Error("The browser server has no port."))
        else resolve(address.port)
      })
    })
    endpoint = `http://127.0.0.1:${port}/mcp/${token}`
  } catch (cause) {
    server = null
    console.error("Agents cannot use the browser preview.", cause)
  }
}

export const stopAgentBrowser = (): void => {
  server?.closeAllConnections()
  server?.close()
  server = null
  endpoint = null
  for (const window of hidden.values()) if (!window.isDestroyed()) window.destroy()
  hidden.clear()
}

/** Lets the renderer name the page each thread's preview attached. */
export const registerAgentBrowserIpc = (): void => {
  ipcMain.on(IPC.agentBrowserAttach, (event, threadId: unknown, id: unknown) => {
    if (typeof threadId !== "string") return
    // Only a preview guest of this window may stand for a thread's browser.
    const page = previewGuest(event.sender, id)
    if (page !== null) attach(threadId, page)
  })
}

const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const match = /^\/mcp\/([a-f0-9]+)\/([^/?]+)$/.exec(request.url ?? "")
  // Browsers attach an Origin; agents do not, so a web page cannot reach the tools.
  if (match?.[1] !== token || request.headers.origin !== undefined) {
    response.writeHead(404).end()
    return
  }
  const threadId = decodeURIComponent(match[2]!)
  if (request.method === "DELETE") {
    response.writeHead(200).end()
    return
  }
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST, DELETE" }).end()
    return
  }
  let message: UnknownRecord
  try {
    message = asRecord(JSON.parse(await readBody(request)))
  } catch {
    reply(response, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
    return
  }
  if (message.id === undefined || message.id === null) {
    response.writeHead(202).end()
    return
  }
  reply(response, { jsonrpc: "2.0", id: message.id, ...(await respond(threadId, message)) })
}

const respond = async (
  threadId: string,
  message: UnknownRecord,
): Promise<{ result: unknown } | { error: { code: number; message: string } }> => {
  const params = asRecord(message.params)
  switch (message.method) {
    case "initialize":
      return {
        result: {
          protocolVersion: asText(params.protocolVersion) || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "meldshell-browser", version: "1.0.0" },
          instructions:
            "These tools drive the browser preview beside this MeldShell thread, which the user " +
            "can see. Open pages with browser_open, read them with browser_snapshot, and act on " +
            "the numbered elements it lists.",
        },
      }
    case "ping":
      return { result: {} }
    case "tools/list":
      return { result: { tools: toolDefinitions } }
    case "tools/call":
      return {
        result: await callTool(asText(params.name), asRecord(params.arguments), toolPage(threadId)),
      }
    default:
      return { error: { code: -32601, message: "Method not found" } }
  }
}

const reply = (response: ServerResponse, message: UnknownRecord): void => {
  if (response.destroyed) return
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(message))
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error("Request too large.")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}
