import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, parse, sep } from "node:path"
import test from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import { initializeDatabase } from "../packages/core/src/database/persistence.ts"
import { runMigrations } from "../packages/core/src/database/migrations.ts"
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

test("migration repairs saved Linux paths while preserving threads and custom names", {
  skip: process.platform === "win32",
}, async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "meldshell-path-"))
  t.after(() => rm(folder, { recursive: true, force: true }))
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  await runtime.runPromise(initializeDatabase)
  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const broken = folder.replaceAll("/", "\\")
      yield* sql`DELETE FROM schema_migrations WHERE version = 7`
      yield* sql`INSERT INTO workspaces VALUES ('w', ${broken}, ${broken}, '2026', '2026')`
      yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at)
      VALUES ('t', 'w', 'Saved thread', 'active', '2026', '2026')`
      yield* runMigrations
      assert.deepEqual(yield* sql`SELECT id, path, name FROM workspaces`, [
        { id: "w", path: folder, name: basename(folder) },
      ])
      assert.equal((yield* sql`SELECT * FROM threads WHERE workspace_id = 'w'`).length, 1)
      yield* sql`UPDATE workspaces SET path = ${broken}, name = 'Custom' WHERE id = 'w'`
      yield* sql`DELETE FROM schema_migrations WHERE version = 7`
      yield* runMigrations
      assert.equal((yield* sql<{ name: string }>`SELECT name FROM workspaces`)[0]?.name, "Custom")
      yield* runMigrations
      yield* sql`INSERT INTO workspaces VALUES ('duplicate', ${broken}, 'Duplicate', '2026', '2026')`
      const missing = `${broken}\\missing`
      yield* sql`INSERT INTO workspaces VALUES ('missing', ${missing}, 'Missing', '2026', '2026')`
      yield* sql`DELETE FROM schema_migrations WHERE version = 7`
      yield* runMigrations
      assert.equal(
        (yield* sql<{ path: string }>`SELECT path FROM workspaces WHERE id = 'duplicate'`)[0]?.path,
        broken,
      )
      assert.equal(
        (yield* sql<{ path: string }>`SELECT path FROM workspaces WHERE id = 'missing'`)[0]?.path,
        missing,
      )
      assert.deepEqual(yield* sql`PRAGMA foreign_key_check`, [])
    }),
  )
})

test("missing Git working directories are not reported as missing Git", async () => {
  await assert.rejects(
    getGitSnapshot(join(tmpdir(), "meldshell-missing", "workspace"), 10),
    /Git working directory is unavailable/,
  )
})
