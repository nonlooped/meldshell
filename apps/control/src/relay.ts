import { DurableObject } from "cloudflare:workers"
import {
  decodeCommand,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  HEARTBEAT_TIMEOUT_MS,
  MAX_FRAME_BYTES,
} from "@meldshell/contracts"
import type { Env } from "./auth"
import { getDevice, setPresence } from "./devices"

type Attachment =
  | { role: "host"; connectedAt: number }
  | { role: "client"; id: string; sessionId: string; connectedAt: number }

/** Identity the Worker verified before forwarding an upgrade; the relay has no public route. */
export type Admission =
  | { role: "host"; deviceId: string; keyId: string }
  | { role: "client"; deviceId: string; accountId: string; sessionId: string }
export const ADMISSION_HEADER = "x-meldshell-admission"

const SESSION_CHECK_MS = 60_000
const MAX_PENDING = 64

/**
 * @public Bound as a Durable Object in wrangler.jsonc.
 *
 * One per device. Holds the host's socket and its browsers' sockets with the hibernation API, so an
 * idle connection costs nothing: heartbeats are answered by the runtime without waking the object.
 * Commands go from browsers to the host; results return to the requesting browser and events fan
 * out to all of them. Nothing is persisted except presence in D1.
 */
export class DeviceRelay extends DurableObject<Env> {
  /** In-flight command ids per browser, for backpressure. Lost on eviction, which only loosens it. */
  private readonly pending = new Map<string, Set<string>>()
  /** Bumped by `disconnect`, so an admission that raced a revocation is refused. */
  private epoch = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG))
  }

  /** The runtime retains closing sockets until their close handshake finishes. */
  private openSockets(tag?: string) {
    return this.ctx.getWebSockets(tag).filter((socket) => socket.readyState === WebSocket.OPEN)
  }

  override async fetch(request: Request): Promise<Response> {
    const admission = JSON.parse(request.headers.get(ADMISSION_HEADER) ?? "null") as Admission
    const epoch = this.epoch
    const row = await getDevice(this.env.DB, admission.deviceId)
    const allowed =
      epoch === this.epoch &&
      row !== null &&
      row.revokedAt === null &&
      (admission.role === "host"
        ? row.keyId === admission.keyId
        : row.accountId === admission.accountId)
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    // Upgrades are accepted and then closed with a code, so clients can tell revocation (4003)
    // and an offline host (1012) from network failures.
    if (!allowed) {
      server.accept()
      server.close(4003, "Not authorized")
    } else if (admission.role === "host") await this.admitHost(server, admission.deviceId)
    else if (!this.host()) {
      server.accept()
      server.close(1012, "Host offline")
    } else this.admitClient(server, admission.sessionId)
    return new Response(null, { status: 101, webSocket: client })
  }

  private async admitHost(socket: WebSocket, deviceId: string) {
    for (const previous of this.openSockets("host")) previous.close(4001, "Host reconnected")
    this.ctx.acceptWebSocket(socket, ["host"])
    socket.serializeAttachment({ role: "host", connectedAt: Date.now() } satisfies Attachment)
    socket.send(JSON.stringify({ type: "clients", count: this.clients().length }))
    await this.ctx.storage.put("deviceId", deviceId)
    await setPresence(this.env.DB, deviceId, true)
  }

  private admitClient(socket: WebSocket, sessionId: string) {
    const id = crypto.randomUUID()
    this.ctx.acceptWebSocket(socket, ["client", `client:${id}`, `session:${sessionId}`])
    socket.serializeAttachment({
      role: "client",
      id,
      sessionId,
      connectedAt: Date.now(),
    } satisfies Attachment)
    socket.send(JSON.stringify({ type: "connected", v: 1 }))
    this.announceClients()
    void this.ctx.storage.getAlarm().then((alarm) => {
      if (alarm === null) return this.ctx.storage.setAlarm(Date.now() + SESSION_CHECK_MS)
    })
  }

  /** The current host socket, closing it first when its heartbeat has stopped. */
  private host(): WebSocket | undefined {
    const [host] = this.openSockets("host")
    if (!host) return undefined
    const attachment = host.deserializeAttachment() as Attachment
    const heard =
      this.ctx.getWebSocketAutoResponseTimestamp(host)?.getTime() ?? attachment.connectedAt
    if (Date.now() - heard <= HEARTBEAT_TIMEOUT_MS) return host
    host.close(1011, "Heartbeat timed out")
    void this.hostGone()
    return undefined
  }

  private clients(except?: WebSocket) {
    return this.openSockets("client").filter((socket) => socket !== except)
  }

  /** Lets the host skip streaming events while nobody is watching. */
  private announceClients(except?: WebSocket) {
    const count = this.clients(except).length
    for (const host of this.openSockets("host"))
      host.send(JSON.stringify({ type: "clients", count }))
  }

  private async hostGone() {
    for (const client of this.clients()) client.close(1012, "Host disconnected")
    const deviceId = await this.ctx.storage.get<string>("deviceId")
    if (deviceId && this.openSockets("host").length === 0)
      await setPresence(this.env.DB, deviceId, false)
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (socket.readyState !== WebSocket.OPEN) return
    if (typeof message !== "string" || message.length > MAX_FRAME_BYTES)
      return socket.close(1009, "Frame too large")
    const attachment = socket.deserializeAttachment() as Attachment
    if (attachment.role === "host") return this.fromHost(socket, message)
    const pending = this.pending.get(attachment.id) ?? new Set()
    this.pending.set(attachment.id, pending)
    if (pending.size >= MAX_PENDING) return socket.close(1013, "Too many requests")
    let command: ReturnType<typeof decodeCommand>
    try {
      command = decodeCommand(JSON.parse(message))
    } catch {
      return socket.close(1008, "Invalid command")
    }
    const host = this.host()
    if (!host) return socket.close(1012, "Host offline")
    pending.add(command.id)
    host.send(JSON.stringify({ type: "command", clientId: attachment.id, command }))
  }

  private fromHost(socket: WebSocket, message: string) {
    let frame: { type?: unknown; clientId?: unknown; id?: unknown }
    try {
      frame = JSON.parse(message)
    } catch {
      return socket.close(1008, "Invalid host frame")
    }
    if (frame.type === "event") for (const client of this.clients()) client.send(message)
    else if (frame.type === "result" && typeof frame.clientId === "string") {
      this.pending.get(frame.clientId)?.delete(String(frame.id))
      for (const client of this.openSockets(`client:${frame.clientId}`)) client.send(message)
    }
  }

  override async webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as Attachment | null
    if (attachment?.role === "client") {
      this.pending.delete(attachment.id)
      this.announceClients(socket)
    } else if (attachment?.role === "host" && this.openSockets("host").every((s) => s === socket))
      await this.hostGone()
  }

  override async webSocketError(socket: WebSocket) {
    await this.webSocketClose(socket)
  }

  /** Rechecks browser sessions and the device while browsers are connected. */
  override async alarm() {
    const clients = this.clients()
    if (clients.length === 0) return
    const deviceId = await this.ctx.storage.get<string>("deviceId")
    const row = deviceId ? await getDevice(this.env.DB, deviceId) : null
    const sessions = [
      ...new Set(
        clients.map((c) => (c.deserializeAttachment() as { sessionId: string }).sessionId),
      ),
    ]
    const { results } = await this.env.DB.prepare(
      `SELECT id, userId, expiresAt FROM "session" WHERE id IN (${sessions.map(() => "?").join(",")})`,
    )
      .bind(...sessions)
      .all<{ id: string; userId: string; expiresAt: string | number }>()
    const valid = new Set(
      results
        .filter(
          (session) =>
            row?.revokedAt === null &&
            session.userId === row.accountId &&
            new Date(session.expiresAt).getTime() > Date.now(),
        )
        .map((session) => session.id),
    )
    for (const client of clients)
      if (!valid.has((client.deserializeAttachment() as { sessionId: string }).sessionId))
        client.close(4003, "Session ended")
    this.host()
    await this.ctx.storage.setAlarm(Date.now() + SESSION_CHECK_MS)
  }

  /** Closes every connection after the device's credential changed or it was removed. */
  disconnect() {
    this.epoch++
    for (const socket of this.openSockets()) socket.close(4003, "Device authorization changed")
  }

  /** Closes browsers that used a session which has just signed out. */
  endSession(sessionId: string) {
    for (const socket of this.openSockets(`session:${sessionId}`))
      socket.close(4003, "Session ended")
  }
}
