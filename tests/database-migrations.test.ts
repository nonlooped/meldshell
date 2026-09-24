import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import { runMigrations } from "../packages/core/src/database/migrations"

test("Effect migrations initialize once and convert legacy history after a disk backup", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-migrations-"))
  const runtime = ManagedRuntime.make(
    SqliteClient.layer({ filename: join(directory, "test.sqlite") }),
  )
  t.after(async () => {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  await runtime.runPromise(runMigrations)
  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`
      yield* sql`INSERT INTO schema_migrations SELECT migration_id, created_at FROM effect_sql_migrations`
      yield* sql`DROP TABLE effect_sql_migrations`
    }),
  )
  await runtime.runPromise(runMigrations)
  assert.equal((await readdir(directory)).filter((name) => name.includes(".backup-")).length, 1)
  await runtime.runPromise(runMigrations)
  assert.equal((await readdir(directory)).filter((name) => name.includes(".backup-")).length, 1)
  const versions = await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql<{
        migration_id: number
      }>`SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id`
    }),
  )
  assert.deepEqual(
    versions.map((row) => row.migration_id),
    [2, 3, 4, 5, 6, 7, 8, 9, 10],
  )
})

test("failed schema migrations roll back their history and schema, then retry", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-migration-retry-"))
  const filename = join(directory, "test.sqlite")
  let runtime = ManagedRuntime.make(SqliteClient.layer({ filename }))
  t.after(async () => {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)`
      yield* sql`INSERT INTO schema_migrations VALUES (1, 'old')`
      // A malformed legacy table makes migration 2 fail after creating workspaces.
      yield* sql`CREATE TABLE threads(id TEXT PRIMARY KEY)`
    }),
  )
  await assert.rejects(runtime.runPromise(runMigrations), /Migration/)
  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      assert.deepEqual(yield* sql`SELECT migration_id FROM effect_sql_migrations`, [
        { migration_id: 1 },
      ])
      assert.equal((yield* sql`SELECT name FROM sqlite_master WHERE name = 'workspaces'`).length, 0)
      yield* sql`DROP TABLE threads`
    }),
  )
  // Migration failures abort startup; retry with a fresh connection on next launch.
  await runtime.dispose()
  runtime = ManagedRuntime.make(SqliteClient.layer({ filename }))
  await runtime.runPromise(runMigrations)
})
