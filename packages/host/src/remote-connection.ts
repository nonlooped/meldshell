import ReconnectingWebSocket from "partysocket/ws"
import WS from "ws"
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  HEARTBEAT_TIMEOUT_MS,
  MAX_BUFFER_BYTES,
  MAX_FRAME_BYTES,
  type RemoteConnection,
  type RemoteResult,
} from "@meldshell/contracts"
import { readCredential, type DeviceCredential } from "./identity"

/** Serializes a frame; results over the frame limit become an error for the same request. */
function frameText(frame: { type: string; id?: string; clientId?: string }) {
  const text = JSON.stringify(frame)
  if (Buffer.byteLength(text) <= MAX_FRAME_BYTES) return text
  return JSON.stringify({
    type: "result",
    id: frame.id,
    clientId: frame.clientId,
    ok: false,
    error:
      "This result exceeds the remote response limit. Open a smaller transcript window or view it on the host.",
  })
}

export interface RelayState {
  readonly connection: RemoteConnection
  /** A sentence for the state, such as why the relay is unreachable. */
  readonly status: string
  /** Browsers connected through the relay right now. */
  readonly viewers: number
  readonly credential: DeviceCredential | null
}

const sentence: Record<RemoteConnection, string> = {
  unlinked: "Not linked",
  connecting: "Connecting",
  online: "Online",
  offline: "Offline; reconnecting",
  revoked: "Authorization revoked; sign in again",
  error: "Could not read device credentials",
}

/** Keeps this host connected to the relay while a device credential exists. */
export function connectRelay(
  directory: string,
  execute: (command: unknown, clientId: string) => Promise<RemoteResult>,
  clients: (ids: readonly string[]) => void = () => undefined,
  onChange: (state: RelayState) => void = () => undefined,
) {
  let credential: DeviceCredential | null = null
  let connection: RemoteConnection = "unlinked"
  /** Browsers connected through the relay; events are only worth sending while one watches. */
  let watchers = 0
  const state = (): RelayState => ({
    connection,
    status: sentence[connection],
    viewers: watchers,
    credential,
  })
  const changed = () => onChange(state())
  const become = (next: RemoteConnection) => {
    if (next === connection) return
    connection = next
    changed()
  }
  class HostSocket extends WS {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, {
        headers: { Authorization: `Bearer ${credential?.credential}` },
        maxPayload: MAX_FRAME_BYTES,
      })
      // The relay answers each ping without waking; a socket that hears nothing is half-open.
      let silence: ReturnType<typeof setTimeout> | undefined
      let beat: ReturnType<typeof setInterval> | undefined
      const heard = () => {
        clearTimeout(silence)
        silence = setTimeout(() => this.terminate(), HEARTBEAT_TIMEOUT_MS)
      }
      this.on("open", () => {
        heard()
        beat = setInterval(() => this.send(HEARTBEAT_PING), HEARTBEAT_INTERVAL_MS)
      })
      this.on("message", heard)
      this.on("close", () => {
        clearTimeout(silence)
        clearInterval(beat)
      })
    }
  }
  const socket = new ReconnectingWebSocket(
    () => {
      const url = new URL("/api/remote/v1/host", credential!.controlURL)
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
      url.searchParams.set("device", credential!.deviceId)
      return url.href
    },
    [],
    {
      WebSocket: HostSocket,
      startClosed: true,
      maxEnqueuedMessages: 0,
      maxReconnectionDelay: 30_000,
      shouldReconnectOnClose: (event) => event.code !== 4003,
    },
  )
  const send = (frame: { type: string; id?: string; clientId?: string }) => {
    if (socket.readyState !== socket.OPEN) return
    if (socket.bufferedAmount > MAX_BUFFER_BYTES)
      socket.reconnect(1013, "Reconnect to recover state")
    else socket.send(frameText(frame))
  }
  socket.addEventListener("open", () => become("online"))
  socket.addEventListener("close", (event) => {
    watchers = 0
    clients([])
    if (event.code === 4003) connection = "revoked"
    else if (credential) connection = "offline"
    changed()
  })
  socket.addEventListener("message", (event) => {
    if (event.data === HEARTBEAT_PONG) return
    let frame: {
      type?: unknown
      clientId?: unknown
      count?: unknown
      ids?: unknown
      command?: unknown
    }
    try {
      frame = JSON.parse(String(event.data))
    } catch {
      frame = {}
    }
    if (frame.type === "clients" && typeof frame.count === "number") {
      const before = watchers
      watchers = frame.count
      if (Array.isArray(frame.ids) && frame.ids.every((id) => typeof id === "string"))
        clients(frame.ids)
      if (before !== watchers) changed()
      return
    }
    const { clientId } = frame
    if (frame.type !== "command" || typeof clientId !== "string") return socket.reconnect(1008)
    void execute(frame.command, clientId).then((result) => send({ ...result, clientId }))
  })
  /** Connects, reconnects, or disconnects to match the stored credential. */
  const sync = async () => {
    try {
      credential = await readCredential(directory)
    } catch {
      credential = null
      socket.close()
      connection = "error"
      changed()
      return
    }
    if (credential) {
      connection = "connecting"
      changed()
      socket.reconnect()
    } else {
      socket.close()
      connection = "unlinked"
      changed()
    }
  }
  void sync()
  return {
    state,
    sync,
    /** Sends an event to connected browsers; they refetch state when they connect. */
    publish: (frame: { type: string }) => {
      if (watchers > 0) send(frame)
    },
    close: () => socket.close(),
  }
}
