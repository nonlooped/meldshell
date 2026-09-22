import assert from "node:assert/strict"
import { test } from "node:test"
import { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"
import { WebSocket } from "ws"
import { createControlServer } from "./server"
import { Devices } from "./devices"

const config = {
  baseURL: "http://localhost:3001",
  siteURL: "http://localhost:4321",
  secret: "test-secret-".repeat(6),
  production: false,
}
const openSocket = (url: string, headers: Record<string, string>) =>
  new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, { headers })
    socket.once("open", () => resolve(socket))
    socket.once("error", reject)
  })
const closeCode = async (url: string, headers: Record<string, string>) => {
  const socket = await openSocket(url, headers)
  return new Promise<number>((resolve) => socket.once("close", resolve))
}
const message = (socket: WebSocket) =>
  new Promise<Record<string, unknown>>((resolve) =>
    socket.once("message", (raw) => resolve(JSON.parse(raw.toString()))),
  )

test("Better Auth email sessions isolate devices; relay rejects other accounts and revocation closes access", async (t) => {
  const db = new DatabaseSync(":memory:")
  const service = await createControlServer(db, config)
  await new Promise<void>((resolve) => service.server.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${(service.server.address() as { port: number }).port}`
  t.after(async () => {
    await service.close()
    db.close()
  })
  const createUser = async (name: string) => {
    const response = await service.auth.handler(
      new Request(`${config.baseURL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: config.siteURL },
        body: JSON.stringify({
          name,
          email: `${name}@example.com`,
          password: "test-password-long-enough",
        }),
      }),
    )
    assert.equal(response.status, 200)
    const value = await response.json()
    const cookie = response.headers
      .getSetCookie()
      .map((item) => item.split(";")[0])
      .join("; ")
    return { token: value.token as string, id: value.user.id as string, cookie }
  }
  const alice = await createUser("alice")
  const bob = await createUser("bob")
  const deviceId = randomUUID()
  const register = await fetch(`${base}/api/remote/v1/devices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${alice.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, name: "Laptop" }),
  })
  assert.equal(register.status, 200)
  const device = await register.json()
  assert.deepEqual(
    service.devices.list(bob.id, () => false),
    [],
  )
  assert.equal(service.devices.authenticate(deviceId, device.credential), alice.id)
  const host = await openSocket(
    `${base.replace("http:", "ws:")}/api/remote/v1/host?device=${deviceId}`,
    { Authorization: `Bearer ${device.credential}` },
  )
  assert.equal(
    await closeCode(`${base.replace("http:", "ws:")}/api/remote/v1/client?device=${deviceId}`, {
      Cookie: bob.cookie,
      Origin: config.siteURL,
    }),
    4003,
  )
  assert.equal(service.devices.list(alice.id, (id) => id === deviceId)[0]?.online, true)
  const client = await openSocket(
    `${base.replace("http:", "ws:")}/api/remote/v1/client?device=${deviceId}`,
    { Cookie: alice.cookie, Origin: config.siteURL },
  )
  const atHost = message(host)
  const id = randomUUID()
  client.send(JSON.stringify({ v: 1, id, method: "meldshell:get-snapshot", args: [] }))
  const forwarded = await atHost
  assert.equal((forwarded.command as { id: string }).id, id)
  const atClient = message(client)
  host.send(
    JSON.stringify({
      type: "result",
      clientId: forwarded.clientId,
      id,
      ok: true,
      value: { marker: "host-local" },
    }),
  )
  assert.deepEqual((await atClient).value, { marker: "host-local" })
  const deniedRevoke = await fetch(`${base}/api/remote/v1/devices/${deviceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${bob.token}` },
  })
  assert.equal(deniedRevoke.status, 404)
  const closed = new Promise<number>((resolve) => client.once("close", resolve))
  const revoked = await fetch(`${base}/api/remote/v1/devices/${deviceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${alice.token}` },
  })
  assert.equal(revoked.status, 200)
  assert.equal(await closed, 4003)
  assert.equal(service.devices.authenticate(deviceId, device.credential), null)
  assert.equal(
    await closeCode(`${base.replace("http:", "ws:")}/api/remote/v1/host?device=${deviceId}`, {
      Authorization: `Bearer ${device.credential}`,
    }),
    4003,
  )
})

test("credentials are hashed and last seen survives disconnects", () => {
  const db = new DatabaseSync(":memory:")
  db.exec("CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('account')")
  const devices = new Devices(db, () => 1000)
  const credential = devices.register("account", "device", "VPS").credential
  assert.ok(!Buffer.from(devices.get("device")!.credential_hash).toString().includes(credential))
  assert.equal(devices.authenticate("device", credential), "account")
  assert.equal(devices.authenticate("device", "wrong"), null)
  devices.seen("device")
  assert.deepEqual(
    devices.list("account", () => false),
    [{ id: "device", name: "VPS", lastSeen: 1000, online: false }],
  )
  assert.throws(() => devices.register("other", "device", "VPS"), /another account/)
  db.close()
})

test("device linking uses a signed-in browser and Google sign-in uses the configured callback", async (t) => {
  const db = new DatabaseSync(":memory:")
  const service = await createControlServer(db, {
    ...config,
    google: { clientId: "test-google-client", clientSecret: "test-google-secret" },
  })
  t.after(async () => {
    await service.close()
    db.close()
  })
  const request = (path: string, body: unknown, cookie?: string) =>
    service.auth.handler(
      new Request(`${config.baseURL}/api/auth${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: config.siteURL,
          "x-meldshell-client-ip": "127.0.0.1",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    )
  const registered = await request("/sign-up/email", {
    name: "Owner",
    email: "owner@example.com",
    password: "long-enough-test-password",
  })
  assert.equal(registered.status, 200)
  const cookie = registered.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ")
  const codeResponse = await request("/device/code", { client_id: "meldshell-host" })
  assert.equal(codeResponse.status, 200)
  const code = await codeResponse.json()
  assert.ok(code.verification_uri.startsWith(config.siteURL))
  assert.equal((await request("/device/approve", { userCode: code.user_code })).status, 401)
  const verified = await service.auth.handler(
    new Request(
      `${config.baseURL}/api/auth/device?user_code=${encodeURIComponent(code.user_code)}`,
      { headers: { Cookie: cookie } },
    ),
  )
  assert.equal(verified.status, 200)
  assert.equal((await request("/device/approve", { userCode: code.user_code }, cookie)).status, 200)
  const tokenResponse = await request("/device/token", {
    client_id: "meldshell-host",
    device_code: code.device_code,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  })
  assert.equal(tokenResponse.status, 200)
  const token = await tokenResponse.json()
  assert.equal(typeof token.access_token, "string")
  const session = await service.auth.api.getSession({
    headers: new Headers({ Authorization: `Bearer ${token.access_token}` }),
  })
  assert.equal(session?.user.email, "owner@example.com")
  const signedOut = await service.auth.handler(
    new Request(`${config.baseURL}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        "x-meldshell-client-ip": "127.0.0.1",
      },
      body: "{}",
    }),
  )
  assert.equal(signedOut.status, 200)
  assert.equal(
    await service.auth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token.access_token}` }),
    }),
    null,
  )

  const social = await request("/sign-in/social", {
    provider: "google",
    callbackURL: `${config.siteURL}/dashboard`,
  })
  assert.equal(social.status, 200)
  const redirect = new URL((await social.json()).url)
  assert.equal(redirect.hostname, "accounts.google.com")
  assert.equal(redirect.searchParams.get("client_id"), "test-google-client")
  assert.equal(
    redirect.searchParams.get("redirect_uri"),
    `${config.baseURL}/api/auth/callback/google`,
  )
})
