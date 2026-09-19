import assert from "node:assert/strict"
import test from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import { initializeDatabase } from "../packages/core/src/database/persistence.ts"
import { seedCatalog } from "../packages/core/src/catalog.ts"

test("catalog startup retires unsupported built-ins without deleting conversation history", async (t) => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  await runtime.runPromise(initializeDatabase)
  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO providers (id, key, harness, display_name, built_in)
        VALUES ('retired', 'retired', 'retired', 'Retired', 1),
               ('custom', 'custom', 'custom', 'Custom', 0)`
      yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name)
        VALUES ('old-model', 'retired', 'old', 'Old')`
      yield* sql`INSERT INTO workspaces VALUES ('w', '/fixture', 'Fixture', '2026', '2026')`
      yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at)
        VALUES ('thread', 'w', 'History', 'active', '2026', '2026')`
      yield* sql`INSERT INTO thread_settings (thread_id, provider_id, model_id)
        VALUES ('thread', 'retired', 'old-model')`
      yield* sql`INSERT INTO turns (id, thread_id, provider, harness, model, speed, status, started_at)
        VALUES ('turn', 'thread', 'retired', 'retired', 'old', 'standard', 'completed', '2026')`
      yield* sql`INSERT INTO events (id, thread_id, turn_id, sequence, kind, method, text, provider_data, created_at)
        VALUES ('event', 'thread', 'turn', 1, 'assistant', 'message', 'Saved answer', '{}', '2026')`
      yield* sql`UPDATE providers SET enabled = 0 WHERE key = 'openai'`
      yield* seedCatalog
      yield* seedCatalog
      assert.deepEqual(
        (yield* sql<{ key: string }>`SELECT key FROM providers ORDER BY key`).map((row) => row.key),
        ["anthropic", "cursor", "custom", "openai"],
      )
      assert.equal((yield* sql`SELECT * FROM provider_models WHERE id = 'old-model'`).length, 0)
      assert.equal((yield* sql`SELECT * FROM thread_settings WHERE thread_id = 'thread'`).length, 0)
      assert.equal((yield* sql`SELECT * FROM threads WHERE id = 'thread'`).length, 1)
      assert.equal((yield* sql`SELECT * FROM turns WHERE id = 'turn'`).length, 1)
      assert.equal(
        (yield* sql<{ text: string }>`SELECT text FROM events WHERE id = 'event'`)[0]?.text,
        "Saved answer",
      )
      assert.equal(
        (yield* sql<{ enabled: number }>`SELECT enabled FROM providers WHERE key = 'openai'`)[0]
          ?.enabled,
        0,
      )
      assert.deepEqual(yield* sql`PRAGMA foreign_key_check`, [])
    }),
  )
})
