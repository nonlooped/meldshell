import type { Server, IncomingMessage } from "node:http"
import { randomUUID } from "node:crypto"
import { fromNodeHeaders } from "better-auth/node"
import { WebSocket, WebSocketServer } from "ws"
import { decodeCommand, MAX_FRAME_BYTES, MAX_BUFFER_BYTES } from "@meldshell/contracts"
import type { Accounts } from "./auth"
import type { Devices } from "./devices"

const send = (socket: WebSocket, value: unknown) => {
  if (socket.bufferedAmount > MAX_BUFFER_BYTES) socket.close(1013, "Reconnect to recover state")
  else if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value))
}
type Client = {
  socket: WebSocket
  deviceId: string
  accountId: string
  request: IncomingMessage
  pending: Set<string>
}

/** Forwards commands from signed-in browsers to their account's hosts, and results and events back. */
export function attachRelay(
  server: Server,
  auth: Accounts,
  devices: Devices,
  origins: readonly string[],
) {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_FRAME_BYTES,
    perMessageDeflate: false,
  })
  const hosts = new Map<string, WebSocket>()
  const clients = new Map<string, Client>()
  const alive = new WeakSet<WebSocket>()
  const clientsOf = (deviceId: string) =>
    [...clients.values()].filter((client) => client.deviceId === deviceId)
  const revoke = (deviceId: string) => {
    hosts.get(deviceId)?.close(4003, "Device authorization changed")
    for (const client of clientsOf(deviceId))
      client.socket.close(4003, "Device authorization changed")
  }
  const sessionFor = (request: IncomingMessage) =>
    auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableCookieCache: true },
    })

  function hostConnected(socket: WebSocket, deviceId: string) {
    hosts.get(deviceId)?.close(4001, "Host reconnected")
    hosts.set(deviceId, socket)
    devices.seen(deviceId)
    socket.on("message", (raw) => {
      let message: { type?: unknown; clientId?: unknown; id?: unknown }
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return socket.close(1008, "Invalid host frame")
      }
      if (message.type === "event")
        for (const client of clientsOf(deviceId)) send(client.socket, message)
      else if (message.type === "result") {
        const client = clients.get(String(message.clientId))
        if (client?.deviceId === deviceId && client.pending.delete(String(message.id)))
          send(client.socket, message)
      }
    })
    socket.on("close", () => {
      if (hosts.get(deviceId) !== socket) return
      hosts.delete(deviceId)
      devices.seen(deviceId)
      for (const client of clientsOf(deviceId)) client.socket.close(1012, "Host disconnected")
    })
  }
  function clientConnected(
    socket: WebSocket,
    request: IncomingMessage,
    deviceId: string,
    accountId: string,
  ) {
    const id = randomUUID()
    const client: Client = { socket, request, deviceId, accountId, pending: new Set() }
    clients.set(id, client)
    socket.on("close", () => clients.delete(id))
    socket.on("message", (raw) => {
      if (client.pending.size >= 64) return socket.close(1013, "Too many requests")
      let command: ReturnType<typeof decodeCommand>
      try {
        command = decodeCommand(JSON.parse(raw.toString()))
      } catch {
        return socket.close(1008, "Invalid command")
      }
      const host = hosts.get(deviceId)
      if (!host) return socket.close(1012, "Host offline")
      client.pending.add(command.id)
      send(host, { type: "command", clientId: id, command })
    })
    send(socket, { type: "connected", v: 1 })
  }

  // Upgrades are accepted and then closed with a code, so clients can tell revocation (4003)
  // and an offline host (1012) from network failures.
  server.on("upgrade", (request, socket, head) => {
    socket.on("error", () => socket.destroy())
    void (async () => {
      const url = new URL(request.url ?? "", "http://localhost")
      const deviceId = url.searchParams.get("device") ?? ""
      let accept: ((ws: WebSocket) => void) | undefined
      let refusal: [number, string] = [4003, "Not authorized"]
      if (url.pathname === "/api/remote/v1/host") {
        const credential = request.headers.authorization?.replace(/^Bearer /, "") ?? ""
        if (await devices.authenticate(deviceId, credential))
          accept = (ws) => hostConnected(ws, deviceId)
      } else if (url.pathname === "/api/remote/v1/client") {
        if (!origins.includes(request.headers.origin ?? "")) return socket.destroy()
        const session = await sessionFor(request)
        if (session && devices.authorize(session.user.id, deviceId)) {
          if (hosts.has(deviceId))
            accept = (ws) => clientConnected(ws, request, deviceId, session.user.id)
          else refusal = [1012, "Host offline"]
        }
      } else return socket.destroy()
      sockets.handleUpgrade(request, socket, head, (ws) => {
        ws.on("error", () => ws.terminate())
        alive.add(ws)
        ws.on("pong", () => alive.add(ws))
        if (accept) accept(ws)
        else ws.close(...refusal)
      })
    })().catch(() => socket.destroy())
  })
  // Heartbeats drop dead sockets; browser sessions are rechecked so sign-out ends access.
  const timer = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!alive.has(ws)) {
        ws.terminate()
        continue
      }
      alive.delete(ws)
      ws.ping()
    }
    for (const client of clients.values())
      void sessionFor(client.request)
        .then((session) => {
          if (
            session?.user.id !== client.accountId ||
            !devices.authorize(client.accountId, client.deviceId)
          )
            client.socket.close(4003, "Session ended")
        })
        .catch(() => client.socket.terminate())
  }, 15_000)
  timer.unref()
  return {
    revoke,
    online: (deviceId: string) => hosts.has(deviceId),
    close: () => {
      clearInterval(timer)
      for (const socket of sockets.clients) socket.terminate()
      sockets.close()
    },
  }
}
