import { createServer } from "node:http"
import { toNodeHandler } from "better-auth/node"
import { Schema } from "effect"
import type { DatabaseSync } from "node:sqlite"
import { createAccounts, type AccountConfig } from "./auth"
import { Devices } from "./devices"
import { attachRelay } from "./relay"

const Register = Schema.Struct({
  deviceId: Schema.String.pipe(Schema.pattern(/^[a-f0-9-]{36}$/)),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
})
export async function createControlServer(database: DatabaseSync, config: AccountConfig) {
  const auth = await createAccounts(database, config)
  const devices = new Devices(database)
  const origins = [config.siteURL, config.baseURL]
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } })
  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/auth/")) return auth.handler(request)
    if (url.pathname === "/api/remote/v1/config") return json({ google: !!config.google })
    const origin = request.headers.get("origin")
    if (
      request.method !== "GET" &&
      !request.headers.has("authorization") &&
      !origins.includes(origin ?? "")
    )
      return json({ error: "Untrusted origin" }, 403)
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    })
    if (!session) return json({ error: "Sign in to continue" }, 401)
    if (url.pathname === "/api/remote/v1/devices" && request.method === "GET")
      return json(devices.list(session.user.id, relay.online))
    if (url.pathname === "/api/remote/v1/devices" && request.method === "POST") {
      const input = Schema.decodeUnknownSync(Register)(await request.json())
      const existing = devices.get(input.deviceId)
      if (existing && existing.account_id !== session.user.id)
        return json({ error: "Device cannot be registered" }, 403)
      relay.revoke(input.deviceId)
      return json(devices.register(session.user.id, input.deviceId, input.name))
    }
    if (url.pathname.startsWith("/api/remote/v1/devices/") && request.method === "DELETE") {
      const id = url.pathname.split("/").at(-1)!
      if (!devices.revoke(session.user.id, id)) return json({ error: "Device not found" }, 404)
      relay.revoke(id)
      return json({ revoked: true })
    }
    return json({ error: "Not found" }, 404)
  }
  const nodeHandler = toNodeHandler(async (request) => {
    try {
      return await handler(request)
    } catch {
      return json({ error: "Request could not be completed" }, 400)
    }
  })
  const server = createServer((request, response) => {
    request.headers["x-meldshell-client-ip"] = config.trustProxy
      ? String(request.headers["x-forwarded-for"] ?? request.socket.remoteAddress ?? "127.0.0.1")
          .split(",")[0]!
          .trim()
      : (request.socket.remoteAddress ?? "127.0.0.1")
    const origin = request.headers.origin
    if (origin && !origins.includes(origin)) {
      response.writeHead(403).end()
      return
    }
    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin)
      response.setHeader("Access-Control-Allow-Credentials", "true")
      response.setHeader("Vary", "Origin")
    }
    response.setHeader("X-Content-Type-Options", "nosniff")
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
      response.writeHead(204).end()
      return
    }
    const size = Number(request.headers["content-length"] ?? 0)
    if (size > 64 * 1024) {
      response.writeHead(413).end()
      return
    }
    let bytes = 0
    request.on("data", (data: Buffer) => {
      bytes += data.length
      if (bytes > 64 * 1024) request.destroy()
    })
    void nodeHandler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  const relay = attachRelay(server, auth, devices, origins)
  return {
    server,
    auth,
    devices,
    close: async () => {
      relay.close()
      server.closeAllConnections()
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
