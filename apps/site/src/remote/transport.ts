import ReconnectingWebSocket from "partysocket/ws"
import { browserTerminals } from "./terminals"
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
type HostStatus = Awaited<ReturnType<MeldShellApi["getRemoteStatus"]>>
// Hosts from before remote administration reject these; the site is deployed ahead of them.
const unsupported = () =>
  Promise.reject(new Error("Update MeldShell on the host computer to use this remotely."))

/**
 * `api` works with any host. After connecting, `forHost` adds what that host reports it supports:
 * nothing for older hosts, and the workstation's browser and lifecycle only for desktop hosts.
 */
export function remoteApi(
  deviceId: string,
  status: (message: string, state: RemoteState) => void,
): { api: MeldShellApi; forHost: (host: HostStatus | null) => MeldShellApi } {
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
      if (terminalsEnabled) terminals.connected()
      status("Connected", "connected")
      emit(IPC.runtimeChanged, ["*", true])
    } else if (frame.type === "event") emit(frame.channel, frame.args)
    else if (frame.type === "result") {
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
    terminals.disconnected()
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
  const terminals = browserTerminals(invoke, subscribe, emit)
  let terminalsEnabled = false
  const api = createInvoker((channel, ...args) => invoke(channel, args))
  const base: MeldShellApi = {
    ...api,
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
    onProviderUpdate: (listener) => subscribe(IPC.providerUpdateChanged, listener as Listener),
    onRuntimeChanged: (listener) => subscribe(IPC.runtimeChanged, listener as Listener),
    onOpenAttention: (listener) => subscribe(IPC.attentionRequested, listener as Listener),
    onUpdateStatus: () => () => undefined,
  }
  const hostApi = (): MeldShellApi => ({
    ...base,
    addWorkspace: async () => {
      const { selectHostFolder } = await import("@meldshell/ui/host-folder-picker")
      const path = await selectHostFolder(api)
      return path === null ? api.getSnapshot() : api.addWorkspacePath(path)
    },
    getUpdateStatus: api.getUpdateStatus,
    checkForUpdates: api.checkForUpdates,
    setUpdateChannel: api.setUpdateChannel,
    installUpdate: async () =>
      confirm("Restart and update the host? Running agents and terminals will be interrupted.") &&
      (await api.installUpdate()),
    getRemoteStatus: api.getRemoteStatus,
    linkRemote: async () => {
      const state = await api.getRemoteStatus()
      if (!state.linking) throw new Error("This computer is already linked.")
      return state.linking
    },
    openRemotePage: async () => {
      window.open("/dashboard", "_blank", "noopener,noreferrer")
    },
    unlinkRemote: api.unlinkRemote,
    retryRemote: api.retryRemote,
    terminal: terminals.api,
    onUpdateStatus: (listener) => {
      let active = true
      const timer = setInterval(() => {
        void api
          .getUpdateStatus()
          .then((status) => {
            if (active) listener(status)
          })
          .catch(() => undefined)
      }, 2000)
      return () => {
        active = false
        clearInterval(timer)
      }
    },
  })
  const desktopApi = (): MeldShellApi => ({
    ...hostApi(),
    getWebPageTitle: api.getWebPageTitle,
    remotePreview: (input) =>
      invoke("meldshell:remote-preview", [input]) as ReturnType<
        NonNullable<MeldShellApi["remotePreview"]>
      >,
    desktop: {
      threadPort: (id) => invoke(IPC.threadPort, [id]) as Promise<number>,
      openExternal: async (url) => {
        window.open(url, "_blank", "noopener,noreferrer")
      },
      environment: {
        get: () =>
          invoke(IPC.getDesktopEnvironment, []) as ReturnType<
            NonNullable<NonNullable<MeldShellApi["desktop"]>["environment"]>["get"]
          >,
        switch: async (mode) =>
          confirm(
            "Restart the host and switch environments? Active work will be interrupted. The other environment must already be linked for remote access.",
          ) && ((await invoke(IPC.switchDesktopEnvironment, [mode])) as boolean),
      },
    },
    hostControl: {
      restart: async () => {
        if (confirm("Restart MeldShell on the host? Active work will be interrupted."))
          await invoke("meldshell:restart-host", [])
      },
      shutdown: async () => {
        if (
          confirm(
            "Shut down MeldShell on the host? Remote access will stop until MeldShell is started there again.",
          )
        )
          await invoke("meldshell:shutdown-host", [])
      },
    },
  })
  return {
    api: { ...base, getRemoteStatus: api.getRemoteStatus },
    forHost: (host) => {
      // Older hosts omit `desktop` and handle none of the remote terminal or host operations.
      if (typeof host?.desktop !== "boolean") return base
      terminalsEnabled = true
      terminals.connected()
      return host.desktop ? desktopApi() : hostApi()
    },
  }
}
