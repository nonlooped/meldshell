import assert from "node:assert/strict"
import { test } from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect } from "effect"
import { initializeDatabase, listThreads } from "@meldshell/core"

test("a database already at version 15 gains the thread seen column on upgrade", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* initializeDatabase
      const sql = yield* SqlClient.SqlClient
      // Recreate a database migrated before seen_at existed.
      yield* sql`ALTER TABLE threads DROP COLUMN seen_at`
      yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id > 15`
      yield* sql`INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES ('workspace', '/tmp/migration-test', 'test', 'now', 'now')`
      yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at) VALUES ('thread', 'workspace', 'Old', 'settled', 'then', 'later')`

      yield* initializeDatabase
      const [thread] = yield* sql<{ seen_at: string | null }>`SELECT seen_at FROM threads`
      assert.equal(thread!.seen_at, "later")
      yield* listThreads({})
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})
