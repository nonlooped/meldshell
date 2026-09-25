import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { readCodexAccountEmail } from "./account"

const token = (claims: object): string =>
  [{ alg: "none" }, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .concat("signature")
    .join(".")

test("the account email comes from the stored identity token's claims", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "meldshell-codex-"))
  t.after(() => rm(home, { recursive: true, force: true }))
  const store = (idToken: string) =>
    writeFile(join(home, "auth.json"), JSON.stringify({ tokens: { id_token: idToken } }))

  await store(token({ email: "dev@example.com" }))
  assert.equal(await readCodexAccountEmail(home), "dev@example.com")
  await store(token({ sub: "no email" }))
  assert.equal(await readCodexAccountEmail(home), null)
  await store("not-a-token")
  assert.equal(await readCodexAccountEmail(home), null)
  await rm(join(home, "auth.json"))
  assert.equal(await readCodexAccountEmail(home), null)
})
