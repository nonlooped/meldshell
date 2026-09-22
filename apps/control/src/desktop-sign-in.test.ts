import assert from "node:assert/strict"
import { test } from "node:test"
import { createServer } from "node:net"
import { DatabaseSync } from "node:sqlite"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createControlServer } from "./server"
import { beginLink, readCredential, unlinkDevice } from "../../../packages/host/src/identity"
import { connectRelay } from "../../../packages/host/src/remote-connection"

test("a browser-approved device link registers the host and presence follows its connection", {
  timeout: 30_000,
}, async (t) => {
  const reservation = createServer()
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve))
  const port = (reservation.address() as { port: number }).port
  await new Promise<void>((resolve) => reservation.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  const db = new DatabaseSync(":memory:")
  const siteURL = "http://localhost:4321"
  const service = await createControlServer(db, {
    baseURL: base,
    siteURL,
    secret: "desktop-sign-in-test-secret".repeat(3),
    production: false,
  })
  await new Promise<void>((resolve) => service.server.listen(port, "127.0.0.1", resolve))
  const directory = await mkdtemp(join(tmpdir(), "meldshell-sign-in-"))
  let relay: ReturnType<typeof connectRelay> | undefined
  t.after(async () => {
    relay?.close()
    await service.close()
    db.close()
    await rm(directory, { recursive: true, force: true })
  })
  const browser = (path: string, body?: unknown, cookie = "") =>
    fetch(`${base}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Origin: siteURL, Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const signUp = await browser("/sign-up/email", {
    name: "Alice",
    email: "alice@example.com",
    password: "desktop-password-long-enough",
  })
  assert.equal(signUp.status, 200)
  const { token } = await signUp.json()
  const cookie = signUp.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ")
  const list = async () =>
    (
      await fetch(`${base}/api/remote/v1/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json() as Promise<Array<{ id: string; online: boolean }>>

  const link = await beginLink(directory, base)
  assert.ok(link.verificationURL.startsWith(`${siteURL}/device`))
  assert.equal((await browser(`/device?user_code=${link.userCode}`, undefined, cookie)).status, 200)
  assert.equal((await browser("/device/approve", { userCode: link.userCode }, cookie)).status, 200)
  await link.complete

  const credential = (await readCredential(directory))!
  assert.equal(credential.account.email, "alice@example.com")
  assert.equal(credential.siteURL, siteURL)
  const saved = await readFile(join(directory, "remote-credential.json"), "utf8")
  assert.ok(!saved.includes(token))
  if (process.platform !== "win32")
    assert.equal((await stat(join(directory, "remote-credential.json"))).mode & 0o777, 0o600)
  // The temporary account session used for linking is signed out.
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM session").get()?.count, 1)

  relay = connectRelay(directory, async () => {
    throw new Error("No commands expected")
  })
  await waitFor(async () => (await list()).some((device) => device.online))
  assert.equal(relay.status(), "Online")
  await unlinkDevice(directory)
  await relay.sync()
  await waitFor(async () => !(await list())[0]!.online)
  assert.equal(relay.status(), "Not linked")
})

async function waitFor(condition: () => Promise<boolean>) {
  const deadline = Date.now() + 5000
  while (!(await condition())) {
    assert.ok(Date.now() < deadline, "Device presence did not update")
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
