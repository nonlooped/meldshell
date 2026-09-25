import { snapshotRpc } from "./rpc"
import ReconnectingWebSocket from "partysocket/ws"
import { selectBrowserImages } from "./attachments"
import {
  IPC,
  createInvoker,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  HEARTBEAT_TIMEOUT_MS,
  MAX_FRAME_BYTES,
  type MeldShellApi,
} from "@meldshell/contracts"
import { accountURL } from "./accounts"

type Listener = (...args: unknown[]) => void
/** Connection phases the workspace chrome renders; the message explains the current phase. */
export type RemoteState = "connecting" | "connected" | "reconnecting" | "offline" | "ended"
const unsupported = () =>
  Promise.reject(new Error("Use MeldShell on the host computer for this operation."))

export function remoteApi(
  deviceId: string,
  status: (message: string, state: RemoteState) => void,
): MeldShellApi {
  const listeners = new Map<string, Set<Listener>>()
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  const emit = (channel: string, args: readonly unknown[]) => {
    for (const listener of listeners.get(channel) ?? []) listener(...args)
  }
  const subscribe = (channel: string, listener: Listener) => {
    const set = listeners.get(channel) ?? new Set()
    set.add(listener)
    listeners.set(channel, set)
    return () => {
      set.delete(listener)
    }
  }
  const url = new URL("/api/remote/v1/client", accountURL)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set("device", deviceId)
  const socket = new ReconnectingWebSocket(url.href, [], {
    maxEnqueuedMessages: 0,
    maxReconnectionDelay: 15_000,
    shouldReconnectOnClose: (event) => event.code !== 4003,
  })
  const rpc = snapshotRpc((text) => socket.send(text))
  // Browsers cannot see protocol pings, so a silent half-open socket is detected here instead.
  let heard = Date.now()
  const heartbeat = setInterval(() => {
    if (socket.readyState !== socket.OPEN) return
    if (Date.now() - heard > HEARTBEAT_TIMEOUT_MS) socket.reconnect(4000, "Heartbeat timed out")
    else socket.send(HEARTBEAT_PING)
  }, HEARTBEAT_INTERVAL_MS)
  socket.addEventListener("open", () => {
    heard = Date.now()
  })
  socket.addEventListener("message", ({ data }) => {
    heard = Date.now()
    if (data === HEARTBEAT_PONG) return
    const frame = JSON.parse(data)
    if (frame.type === "connected") {
      status("Connected", "connected")
      emit(IPC.runtimeChanged, ["*", true])
    } else if (frame.type === "event") emit(frame.channel, frame.args)
    else if (frame.type === "result") {
      if (frame.id.startsWith("rpc_")) return rpc.receive(frame)
      const entry = pending.get(frame.id)
      pending.delete(frame.id)
      if (frame.ok) entry?.resolve(frame.value)
      else entry?.reject(new Error(frame.error))
    }
  })
  socket.addEventListener("close", (event) => {
    // Sent work may or may not have reached the host; never resend it automatically.
    for (const entry of pending.values())
      entry.reject(
        new Error("The connection dropped before this was confirmed. Check the conversation."),
      )
    pending.clear()
    rpc.disconnect()
    if (event.code === 4003)
      status("Access to this computer ended. Return to your devices to reconnect.", "ended")
    else if (event.code === 1012)
      status("This computer went offline. Agents keep running there; waiting for it…", "offline")
    else status("Connection lost. Agents keep running on the host; reconnecting…", "reconnecting")
  })
  window.addEventListener(
    "pagehide",
    () => {
      clearInterval(heartbeat)
      socket.close()
      void rpc.dispose()
    },
    { once: true },
  )

  const invoke = (method: string, args: readonly unknown[]) =>
    new Promise<unknown>((resolve, reject) => {
      const id = crypto.randomUUID()
      const text = JSON.stringify({ v: 1, id, method, args })
      if (new TextEncoder().encode(text).length > MAX_FRAME_BYTES)
        return reject(new Error("This is too large to send remotely. Remove some attachments."))
      if (!socket.send(text))
        return reject(new Error("Not connected to this computer. Nothing was sent."))
      pending.set(id, { resolve, reject })
    })
  const api = createInvoker((channel, ...args) => invoke(channel, args))
  return {
    ...api,
    getSnapshot: rpc.getSnapshot,
    platform: "web",
    addWorkspace: unsupported,
    selectAttachments: selectBrowserImages,
    getWebPageTitle: async () => null,
    getUpdateStatus: async () => ({
      state: "unavailable",
      currentVersion: "",
      channel: "stable",
      availableVersion: null,
      progressPercent: null,
      message: "Updates are managed on the host.",
    }),
    checkForUpdates: unsupported,
    installUpdate: unsupported,
    setUpdateChannel: unsupported,
    closeApp: async () => {
      location.assign("/dashboard")
      return true
    },
    getRemoteStatus: unsupported,
    linkRemote: unsupported,
    openRemotePage: unsupported,
    unlinkRemote: unsupported,
    retryRemote: unsupported,
    gitFileAction: (input) =>
      input.action === "restore" &&
      !confirm(`Discard unstaged changes to ${input.path} on the host?`)
        ? Promise.resolve()
        : api.gitFileAction(input),
    onProviderStatus: (listener) => subscribe(IPC.providerStatusChanged, listener as Listener),
    onRuntimeChanged: (listener) => subscribe(IPC.runtimeChanged, listener as Listener),
    onOpenAttention: (listener) => subscribe(IPC.attentionRequested, listener as Listener),
    onUpdateStatus: () => () => undefined,
  }
}
