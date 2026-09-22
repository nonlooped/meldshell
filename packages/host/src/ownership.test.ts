import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { acquireOwnership } from "./ownership"

test("only one core writer can own a data directory, including path aliases", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-owner-"))
  const alias = `${directory}-alias`
  let release: (() => Promise<void>) | undefined
  try {
    const path = join(directory, "meldshell.sqlite")
    release = await acquireOwnership(path)
    await assert.rejects(acquireOwnership(path), /Another MeldShell host/)
    if (process.platform !== "win32") {
      await symlink(directory, alias)
      await assert.rejects(
        acquireOwnership(join(alias, "meldshell.sqlite")),
        /Another MeldShell host/,
      )
    }
    await release()
    release = undefined
    const next = await acquireOwnership(path)
    await next()
  } finally {
    await release?.()
    await rm(alias, { force: true })
    await rm(directory, { recursive: true, force: true })
  }
})
