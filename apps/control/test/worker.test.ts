import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { DatabaseSync } from "node:sqlite"
import { getMigrations } from "better-auth/db/migration"
import { unstable_startWorker } from "wrangler"
import { WebSocket } from "ws"
import { authOptions, type Env } from "../src/auth"

const root = join(import.meta.dirname, "..")
const origin = "http://localhost:4321"
const vars = {
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: "test-secret-".repeat(6),
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  DISCORD_CLIENT_ID: "test-discord-client",
  DISCORD_CLIENT_SECRET: "test-discord-secret",
}
const migrations = () =>
  readdirSync(join(root, "migrations"))
    .sort()
    .map((name) => readFileSync(join(root, "migrations", name), "utf8"))

let worker: Awaited<ReturnType<typeof unstable_startWorker>>
let base: string
let persist: string

/** An account as OAuth sign-in creates it, with two bearer sessions, seeded before startup. */
const account = () => ({
  id: randomUUID(),
  sessions: [randomUUID(), randomUUID()].map((token) => ({
    id: randomUUID(),
    token,
    headers: { Authorization: `Bearer ${token}`, Origin: origin },
  })),
})
const users = { alice: account(), bob: account(), owner: account() }

const wrangler = (...args: string[]) =>
  execFileSync("npx", ["wrangler", ...args, "--local", "--persist-to", persist], {
    cwd: root,
    stdio: "ignore",
    shell: process.platform === "win32",
  })

before(async () => {
  // Run the worker as `wrangler dev` does, with local D1 and both Durable Objects.
  persist = mkdtempSync(join(tmpdir(), "meldshell-control-"))
  wrangler("d1", "migrations", "apply", "meldshell")
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 86_400_000).toISOString()
  const seed = join(persist, "seed.sql")
  writeFileSync(
    seed,
    Object.entries(users)
      .flatMap(([name, user]) => [
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('${user.id}', '${name}', '${name}@example.com', 1, '${now}', '${now}');`,
        ...user.sessions.map(
          (session) =>
            `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('${session.id}', '${expires}', '${session.token}', '${now}', '${now}', '${user.id}');`,
        ),
      ])
      .join("\n"),
  )
  wrangler("d1", "execute", "meldshell", "--file", seed)
  worker = await unstable_startWorker({
    config: join(root, "wrangler.jsonc"),
    bindings: Object.fromEntries(
      Object.entries(vars).map(([name, value]) => [name, { type: "plain_text", value }]),
    ),
    dev: { persist, server: { port: 0 }, inspector: false, logLevel: "none" },
  })
  base = (await worker.url).href.replace(/\/$/, "")
})
after(async () => {
  await worker?.dispose()
  if (persist) rmSync(persist, { recursive: true, force: true })
})

const api = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  })
const socket = (path: string, headers: Record<string, string>) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`${base.replace("http:", "ws:")}${path}`, { headers })
    ws.once("open", () => resolve(ws))
    ws.once("error", reject)
  })
const closed = (ws: WebSocket) =>
  new Promise<number>((resolve) => ws.once("close", (code) => resolve(code)))
const closeCode = async (path: string, headers: Record<string, string>) =>
  closed(await socket(path, headers))
/** Resolves with the next frame matching `accept`, skipping heartbeats and presence frames. */
const next = (ws: WebSocket, accept = (_: Record<string, unknown>) => true) =>
  new Promise<Record<string, unknown>>((resolve) => {
    const listener = (raw: Buffer) => {
      if (raw.toString() === "pong") return
      const frame = JSON.parse(raw.toString())
      if (!accept(frame)) return
      ws.off("message", listener)
      resolve(frame)
    }
    ws.on("message", listener)
  })

test("committed migrations contain every table and column Better Auth expects", async () => {
  const sqlite = new DatabaseSync(":memory:")
  for (const sql of migrations()) sqlite.exec(sql)
  const planned = await getMigrations({ ...authOptions(vars as unknown as Env), database: sqlite })
  assert.deepEqual(planned.toBeCreated, [])
  assert.deepEqual(planned.toBeAdded, [])
  sqlite.close()
})

test("sign-in offers Google and Discord only, with callbacks on the site origin", async () => {
  assert.deepEqual(await (await api("/api/remote/v1/config")).json(), {
    providers: ["google", "discord"],
  })
  for (const [provider, host] of [
    ["google", "accounts.google.com"],
    ["discord", "discord.com"],
  ] as const) {
    const response = await api("/api/auth/sign-in/social", {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({ provider, callbackURL: `${origin}/dashboard` }),
    })
    assert.equal(response.status, 200)
    const redirect = new URL(((await response.json()) as { url: string }).url)
    assert.equal(redirect.hostname, host)
    assert.equal(
      redirect.searchParams.get("redirect_uri"),
      `${origin}/api/auth/callback/${provider}`,
    )
  }
  const password = await api("/api/auth/sign-up/email", {
    method: "POST",
    headers: { Origin: origin },
    body: JSON.stringify({ name: "x", email: "x@example.com", password: "long-enough-password" }),
  })
  assert.notEqual(password.status, 200)
})

test("device flow links a host whose relay isolates accounts and ends access on sign-out and removal", async () => {
  const alice = { id: users.alice.id, headers: users.alice.sessions[0]!.headers }
  const bob = { id: users.bob.id, headers: users.bob.sessions[0]!.headers }

  // The host obtains a short-lived session through the device flow and exchanges it for a key.
  const code = (await (
    await api("/api/auth/device/code", {
      method: "POST",
      body: JSON.stringify({ client_id: "meldshell-host" }),
    })
  ).json()) as { user_code: string; device_code: string; verification_uri: string }
  assert.equal(code.verification_uri, `${origin}/device`)
  const verified = await api(`/api/auth/device?user_code=${encodeURIComponent(code.user_code)}`, {
    headers: alice.headers,
  })
  assert.equal(verified.status, 200)
  const approved = await api("/api/auth/device/approve", {
    method: "POST",
    headers: alice.headers,
    body: JSON.stringify({ userCode: code.user_code }),
  })
  assert.equal(approved.status, 200)
  const token = (await (
    await api("/api/auth/device/token", {
      method: "POST",
      body: JSON.stringify({
        client_id: "meldshell-host",
        device_code: code.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    })
  ).json()) as { access_token: string }
  const hostSession = { Authorization: `Bearer ${token.access_token}` }
  const session = (await (await api("/api/auth/get-session", { headers: hostSession })).json()) as {
    user: { id: string }
  }
  assert.equal(session.user.id, alice.id)

  const deviceId = crypto.randomUUID()
  const register = await api("/api/remote/v1/devices", {
    method: "POST",
    headers: hostSession,
    body: JSON.stringify({ deviceId, name: "Laptop" }),
  })
  assert.equal(register.status, 200)
  const { credential } = (await register.json()) as { credential: string }
  const stolen = await api("/api/remote/v1/devices", {
    method: "POST",
    headers: bob.headers,
    body: JSON.stringify({ deviceId, name: "Laptop" }),
  })
  assert.equal(stolen.status, 403)
  const genericKey = await api("/api/auth/api-key/create", {
    method: "POST",
    headers: alice.headers,
    body: JSON.stringify({ configId: "device", name: "Laptop" }),
  })
  assert.equal(genericKey.status, 404)

  const hostPath = `/api/remote/v1/host?device=${deviceId}`
  const clientPath = `/api/remote/v1/client?device=${deviceId}`
  assert.equal(await closeCode(hostPath, { Authorization: "Bearer wrong" }), 4003)
  assert.equal(await closeCode(clientPath, alice.headers), 1012)
  const host = await socket(hostPath, { Authorization: `Bearer ${credential}` })
  const idle = await next(host)
  assert.deepEqual(idle, { type: "clients", count: 0, ids: [] })
  const listed = (await (
    await api("/api/remote/v1/devices", { headers: alice.headers })
  ).json()) as {
    online: boolean
  }[]
  assert.equal(listed[0]?.online, true)
  assert.deepEqual(await (await api("/api/remote/v1/devices", { headers: bob.headers })).json(), [])
  assert.equal(await closeCode(clientPath, bob.headers), 4003)
  await assert.rejects(socket(clientPath, { ...alice.headers, Origin: "https://evil.example" }))

  // Heartbeats are answered by the relay itself.
  const pong = new Promise<string>((resolve) =>
    host.once("message", (raw) => resolve(raw.toString())),
  )
  host.send("ping")
  assert.equal(await pong, "pong")

  const watching = next(host, (frame) => frame.type === "clients")
  const client = await socket(clientPath, alice.headers)
  const presence = await watching
  assert.equal(presence.count, 1)
  assert.equal((presence.ids as string[]).length, 1)

  const forwarded = next(host, (frame) => frame.type === "command")
  const id = crypto.randomUUID()
  client.send(JSON.stringify({ v: 1, id, method: "meldshell:get-snapshot", args: [] }))
  const command = await forwarded
  assert.equal((command.command as { id: string }).id, id)
  const result = next(client, (frame) => frame.type === "result")
  host.send(
    JSON.stringify({
      type: "result",
      clientId: command.clientId,
      id,
      ok: true,
      value: "host-local",
    }),
  )
  assert.equal((await result).value, "host-local")
  const event = next(client, (frame) => frame.type === "event")
  host.send(JSON.stringify({ type: "event", channel: "meldshell:runtime-changed", args: ["*"] }))
  assert.deepEqual((await event).args, ["*"])

  // Private terminal output reaches only its owning browser, while state changes still fan out.
  const second = await socket(clientPath, alice.headers)
  const privateEvent = next(client, (frame) => frame.type === "event")
  const publicEvent = next(second, (frame) => frame.type === "event")
  host.send(
    JSON.stringify({
      type: "event",
      clientId: command.clientId,
      channel: "meldshell:terminal-data",
      args: ["terminal", "private"],
    }),
  )
  host.send(JSON.stringify({ type: "event", channel: "public-marker", args: [] }))
  assert.equal((await privateEvent).channel, "meldshell:terminal-data")
  assert.equal((await publicEvent).channel, "public-marker")
  second.close()

  // Signing out closes that browser's relay connections immediately.
  const signedOut = closed(client)
  const signOut = await api("/api/auth/sign-out", {
    method: "POST",
    headers: alice.headers,
    body: "{}",
  })
  assert.equal(signOut.status, 200)
  assert.equal(await signedOut, 4003)

  // Removing the device closes the host and rejects its credential.
  const laptop = users.alice.sessions[1]!.headers
  const deniedRevoke = await api(`/api/remote/v1/devices/${deviceId}`, {
    method: "DELETE",
    headers: bob.headers,
  })
  assert.equal(deniedRevoke.status, 404)
  const hostClosed = closed(host)
  const revoked = await api(`/api/remote/v1/devices/${deviceId}`, {
    method: "DELETE",
    headers: laptop,
  })
  assert.equal(revoked.status, 200)
  assert.equal(await hostClosed, 4003)
  assert.equal(await closeCode(hostPath, { Authorization: `Bearer ${credential}` }), 4003)
})

test("relinking rotates the device credential and closes the old connection", async () => {
  const owner = { headers: users.owner.sessions[0]!.headers }
  const deviceId = crypto.randomUUID()
  const link = async () =>
    (
      (await (
        await api("/api/remote/v1/devices", {
          method: "POST",
          headers: owner.headers,
          body: JSON.stringify({ deviceId, name: "Server" }),
        })
      ).json()) as { credential: string }
    ).credential
  const first = await link()
  const hostPath = `/api/remote/v1/host?device=${deviceId}`
  const host = await socket(hostPath, { Authorization: `Bearer ${first}` })
  const rotated = closed(host)
  const second = await link()
  assert.equal(await rotated, 4003)
  assert.equal(await closeCode(hostPath, { Authorization: `Bearer ${first}` }), 4003)
  const current = await socket(hostPath, { Authorization: `Bearer ${second}` })
  assert.deepEqual(await next(current), { type: "clients", count: 0, ids: [] })
  current.close()
})
