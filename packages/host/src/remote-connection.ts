import { executeRemoteRpc } from "./remote-rpc"
import { REMOTE_RPC_METHOD } from "@meldshell/contracts"
import ReconnectingWebSocket from "partysocket/ws"
import WS from "ws"
import { MAX_FRAME_BYTES, MAX_BUFFER_BYTES, type RemoteResult } from "@meldshell/contracts"
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
  class HostSocket extends WS {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, {
        headers: { Authorization: `Bearer ${credential?.credential}` },
        maxPayload: MAX_FRAME_BYTES,
      })
      // The relay pings every 15 seconds; a silent socket is half-open.
      let timer: ReturnType<typeof setTimeout> | undefined
      const arm = () => {
        clearTimeout(timer)
        timer = setTimeout(() => this.terminate(), 45_000)
      }
      this.on("open", arm)
      this.on("ping", arm)
      this.on("close", () => clearTimeout(timer))
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
    if (event.code === 4003) status = REVOKED
    else if (credential) status = "Offline; reconnecting"
  })
  socket.addEventListener("message", (event) => {
    let frame: { type?: unknown; clientId?: unknown; command?: { id?: string; method?: string } }
    try {
      frame = JSON.parse(String(event.data))
    } catch {
      frame = {}
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
    publish: send,
    close: () => socket.close(),
  }
}
