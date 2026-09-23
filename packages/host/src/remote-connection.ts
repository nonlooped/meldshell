import { executeRemoteRpc } from "./remote-rpc"
import { REMOTE_RPC_METHOD } from "@meldshell/contracts"
import ReconnectingWebSocket from "partysocket/ws"
import WS from "ws"
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  HEARTBEAT_TIMEOUT_MS,
  MAX_BUFFER_BYTES,
  MAX_FRAME_BYTES,
  type RemoteResult,
} from "@meldshell/contracts"
import { readCredential, type DeviceCredential } from "./identity"

/** Serializes a frame; results over the frame limit become an error for the same request. */
export function frameText(frame: { type: string; id?: string; clientId?: string }) {
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

const REVOKED = "Authorization revoked; sign in again"

/** Keeps this host connected to the relay while a device credential exists. */
export function connectRelay(
  directory: string,
  execute: (command: unknown) => Promise<RemoteResult>,
) {
  let credential: DeviceCredential | null = null
  let status = "Not linked"
  /** Browsers connected through the relay; events are only worth sending while one watches. */
  let watchers = 0
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
  socket.addEventListener("open", () => {
    status = "Online"
  })
  socket.addEventListener("close", (event) => {
    watchers = 0
    if (event.code === 4003) status = REVOKED
    else if (credential) status = "Offline; reconnecting"
  })
  socket.addEventListener("message", (event) => {
    if (event.data === HEARTBEAT_PONG) return
    let frame: {
      type?: unknown
      clientId?: unknown
      count?: unknown
      command?: { id?: string; method?: string }
    }
    try {
      frame = JSON.parse(String(event.data))
    } catch {
      frame = {}
    }
    if (frame.type === "clients" && typeof frame.count === "number") {
      watchers = frame.count
      return
    }
    const { clientId } = frame
    if (frame.type !== "command" || typeof clientId !== "string") return socket.reconnect(1008)
    const result =
      frame.command?.method === REMOTE_RPC_METHOD
        ? executeRemoteRpc(frame.command, execute)
        : execute(frame.command)
    void result.then((result) => send({ ...result, clientId }))
  })
  /** Connects, reconnects, or disconnects to match the stored credential. */
  const sync = async () => {
    try {
      credential = await readCredential(directory)
    } catch {
      credential = null
      socket.close()
      status = "Could not read device credentials"
      return
    }
    if (credential) {
      status = "Connecting"
      socket.reconnect()
    } else {
      socket.close()
      status = "Not linked"
    }
  }
  void sync()
  return {
    status: () => status,
    sync,
    /** Sends an event to connected browsers; they refetch state when they connect. */
    publish: (frame: { type: string }) => {
      if (watchers > 0) send(frame)
    },
    close: () => socket.close(),
  }
}
