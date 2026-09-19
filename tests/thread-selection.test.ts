import assert from "node:assert/strict"
import test from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import { initializeDatabase } from "../packages/core/src/database/persistence.ts"
import { createThread } from "../packages/core/src/threads.ts"

test("a new thread inherits the latest submitted model combination", async (t) => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  await runtime.runPromise(initializeDatabase)
  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const providers = yield* sql<{ readonly id: string }>`
        SELECT id FROM providers WHERE key = 'anthropic'
      `
      const providerId = providers[0]!.id
      yield* sql`INSERT INTO provider_models (
        id, provider_id, slug, display_name, reasoning_efforts, supports_fast, sort_order
      ) VALUES
        ('opus', ${providerId}, 'opus-5', 'Opus 5', '["low","medium","high"]', 1, 0),
        ('sonnet', ${providerId}, 'sonnet-5', 'Sonnet 5', '["low","medium"]', 0, 1)`
      yield* sql`INSERT INTO workspaces VALUES ('w', '/fixture', 'Fixture', '2026', '2026')`
      yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at)
        VALUES ('existing', 'w', 'Existing', 'active', '2026', '2026')`
      yield* sql`INSERT INTO thread_settings (
        thread_id, provider_id, model_id, reasoning_effort, speed
      ) VALUES ('existing', ${providerId}, 'sonnet', 'low', 'standard')`
      yield* sql`INSERT INTO turns (
        id, thread_id, provider, harness, model, reasoning_effort, speed, status, started_at
      ) VALUES
      (
        'older', 'existing', 'anthropic', 'claude-code', 'sonnet-5',
        'low', 'standard', 'completed', '2026-09-19T11:00:00.000Z'
      ),
      (
        'latest', 'existing', 'anthropic', 'claude-code', 'opus-5',
        'medium', 'fast', 'completed', '2026-09-19T12:00:00.000Z'
      )`
    }),
  )

  const snapshot = await runtime.runPromise(createThread({ workspaceId: "w" }))
  const created = snapshot.threads.find((thread) => thread.id !== "existing")
  assert.ok(created)
  assert.deepEqual(
    snapshot.threadSettings.find((settings) => settings.threadId === created.id),
    {
      threadId: created.id,
      providerId: snapshot.providers.find((provider) => provider.key === "anthropic")!.id,
      modelId: "opus",
      reasoningEffort: "medium",
      speed: "fast",
      mode: "default",
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
    },
  )
  assert.equal(
    snapshot.threadSettings.find((settings) => settings.threadId === "existing")?.modelId,
    "sonnet",
  )
})
