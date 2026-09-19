import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join, parse, sep } from "node:path"
import test from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import { initializeDatabase } from "../packages/core/src/database/persistence.ts"
import { addWorkspace } from "../packages/core/src/workspaces.ts"
import { getGitSnapshot } from "../apps/desktop/src/main/git.ts"

test("workspace paths retain native separators, roots, and POSIX backslashes", async (t) => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  await runtime.runPromise(initializeDatabase)
  const folder = join(tmpdir(), "workspace")
  await runtime.runPromise(addWorkspace(`${folder}${sep}`))
  await runtime.runPromise(addWorkspace(folder))
  const root = parse(folder).root
  await runtime.runPromise(addWorkspace(root))
  if (process.platform !== "win32") await runtime.runPromise(addWorkspace(`${folder}\\`))
  const rows = await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql<{ path: string; name: string }>`SELECT path, name FROM workspaces`
    }),
  )
  assert.equal(rows.filter((row) => row.path === folder).length, 1)
  assert.equal(rows.find((row) => row.path === folder)?.name, "workspace")
  assert.ok(rows.some((row) => row.path === root))
  if (process.platform !== "win32") assert.ok(rows.some((row) => row.path === `${folder}\\`))
})

test("missing Git working directories are not reported as missing Git", async () => {
  await assert.rejects(
    getGitSnapshot(join(tmpdir(), "meldshell-missing", "workspace"), 10),
    /Git working directory is unavailable/,
  )
})
