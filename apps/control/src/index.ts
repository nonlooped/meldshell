import { accounts, providers, type Env } from "./auth"
import { authenticateDevice, getDevice, listDevices } from "./devices"
import { ADMISSION_HEADER, type Admission } from "./relay"

export { Account } from "./account"
export { DeviceRelay } from "./relay"

const MAX_BODY_BYTES = 64 * 1024
const DEVICE_ID = /^[a-f0-9-]{36}$/

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } })

type Session = NonNullable<Awaited<ReturnType<ReturnType<typeof accounts>["api"]["getSession"]>>>

/** Accepts and immediately closes an upgrade, so the client can read why it was refused. */
function refuse(code: number, reason: string) {
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
  server.accept()
  server.close(code, reason)
  return new Response(null, { status: 101, webSocket: client })
}

/** Forwards a verified upgrade to the device's relay, which rechecks it against revocation. */
function toRelay(env: Env, request: Request, admission: Admission) {
  const headers = new Headers(request.headers)
  headers.set(ADMISSION_HEADER, JSON.stringify(admission))
  return env.DEVICES.getByName(admission.deviceId).fetch(new Request(request, { headers }))
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const auth = accounts(env)
  // Device keys are managed only through the device lifecycle endpoints.
  if (url.pathname.startsWith("/api/auth/api-key/")) return json({ error: "Not found" }, 404)
  if (url.pathname === "/api/auth/sign-out" && request.method === "POST") {
    const session = await auth.api.getSession({ headers: request.headers })
    const response = await auth.handler(request)
    if (session && response.ok)
      await env.ACCOUNTS.getByName(session.user.id).endSession(session.user.id, session.session.id)
    return response
  }
  if (url.pathname.startsWith("/api/auth/")) return auth.handler(request)
  if (url.pathname === "/api/remote/v1/config")
    return json({ providers: Object.keys(providers(env)) })

  const deviceId = url.searchParams.get("device") ?? ""
  if (url.pathname === "/api/remote/v1/host") {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Upgrade" }, 426)
    const credential = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? ""
    const row = await authenticateDevice(env, deviceId, credential)
    if (!row) return refuse(4003, "Not authorized")
    return toRelay(env, request, { role: "host", deviceId, keyId: row.keyId })
  }

  const origin = request.headers.get("Origin")
  const trusted = origin === env.BETTER_AUTH_URL
  if (request.method !== "GET" && !request.headers.has("Authorization") && !trusted)
    return json({ error: "Untrusted origin" }, 403)
  const session: Session | null = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  })

  if (url.pathname === "/api/remote/v1/client") {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Upgrade" }, 426)
    if (!trusted) return json({ error: "Untrusted origin" }, 403)
    const row = session && (await getDevice(env.DB, deviceId))
    if (!session || row?.accountId !== session.user.id || row.revokedAt !== null)
      return refuse(4003, "Not authorized")
    if (!row.online) return refuse(1012, "Host offline")
    return toRelay(env, request, {
      role: "client",
      deviceId,
      accountId: session.user.id,
      sessionId: session.session.id,
    })
  }
  if (!session) return json({ error: "Sign in to continue" }, 401)
  const account = env.ACCOUNTS.getByName(session.user.id)
  if (url.pathname === "/api/remote/v1/devices" && request.method === "GET")
    return json(await listDevices(env.DB, session.user.id))
  if (url.pathname === "/api/remote/v1/devices" && request.method === "POST") {
    const input = (await request.json()) as { deviceId?: unknown; name?: unknown }
    if (
      typeof input.deviceId !== "string" ||
      !DEVICE_ID.test(input.deviceId) ||
      typeof input.name !== "string" ||
      input.name.length < 1 ||
      input.name.length > 100
    )
      return json({ error: "Invalid device" }, 400)
    const existing = await getDevice(env.DB, input.deviceId)
    if (existing && existing.accountId !== session.user.id)
      return json({ error: "Device cannot be registered" }, 403)
    return json(await account.register(session.user.id, input.deviceId, input.name))
  }
  if (url.pathname.startsWith("/api/remote/v1/devices/") && request.method === "DELETE") {
    const id = decodeURIComponent(url.pathname.split("/").at(-1)!)
    if (!(await account.revoke(session.user.id, id)))
      return json({ error: "Device not found" }, 404)
    return json({ revoked: true })
  }
  return json({ error: "Not found" }, 404)
}

export default {
  async fetch(request, env) {
    if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES)
      return json({ error: "Request too large" }, 413)
    let response: Response
    try {
      response = await route(request, env)
    } catch (cause) {
      console.error("Request failed", cause)
      return json({ error: "Request could not be completed" }, 400)
    }
    if (response.status === 101) return response
    // Better Auth may return immutable responses.
    response = new Response(response.body, response)
    response.headers.set("X-Content-Type-Options", "nosniff")
    return response
  },
} satisfies ExportedHandler<Env>
