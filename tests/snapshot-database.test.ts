import assert from "node:assert/strict"
import test from "node:test"
import { performance } from "node:perf_hooks"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import { initializeDatabase } from "../packages/core/src/database/persistence.ts"
import { getSnapshot, listThreads } from "../packages/core/src/snapshots.ts"

test("200-thread snapshots retain counts, activity, and stable pagination", async () => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  try {
    await runtime.runPromise(initializeDatabase)
    await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO workspaces VALUES ('w', '/fixture', 'Fixture', '2026', '2026')`
        yield* sql.withTransaction(
          Effect.gen(function* () {
            for (let index = 0; index < 200; index++) {
              const id = String(index).padStart(3, "0")
              yield* sql`INSERT INTO threads(id, workspace_id, title, status, created_at, updated_at, pinned)
            VALUES (${id}, 'w', ${id}, 'active', '2026', '2026', ${index === 0 ? 1 : 0})`
              for (let turn = 0; turn < 20; turn++) {
                yield* sql`INSERT INTO turns(id, thread_id, provider, harness, model, speed, status, started_at)
              VALUES (${`${id}-${turn}`}, ${id}, 'openai', 'codex', 'test', 'standard', 'completed', ${String(turn).padStart(2, "0")})`
              }
            }
            yield* sql`INSERT INTO queued_inputs(thread_id, text, created_at) VALUES ('000', 'queued', '2026')`
            yield* sql`INSERT INTO approvals(id, thread_id, turn_id, request_id, method, title, detail, created_at)
          VALUES ('a', '000', '000-19', 'r', 'approval', 'Approve', '', '2026')`
          }),
        )
      }),
    )
    const started = performance.now()
    for (let index = 0; index < 25; index++) await runtime.runPromise(getSnapshot)
    console.log(
      `200 threads / 4,000 turns: snapshot mean ${((performance.now() - started) / 25).toFixed(2)} ms (25 warm runs)`,
    )
    const snapshot = await runtime.runPromise(getSnapshot)
    assert.equal(snapshot.threads.length, 200)
    assert.equal(snapshot.threads[0]?.id, "000")
    assert.equal(snapshot.threads[0]?.activity, "approval")
    assert.equal(snapshot.threads[0]?.queuedCount, 1)
    assert.ok(snapshot.threads.every((thread) => thread.turnCount === 20))
    const ids: string[] = []
    let cursor: string | undefined
    do {
      const page = await runtime.runPromise(listThreads({ limit: 17, cursor }))
      ids.push(...page.threads.map((thread) => thread.id))
      assert.ok(page.threads.every((thread) => thread.turnCount === 20))
      cursor = page.nextCursor ?? undefined
    } while (cursor !== undefined)
    assert.deepEqual(
      ids,
      snapshot.threads.map((thread) => thread.id),
    )
    // A read RPC must not observe a transaction that subsequently rolls back.
    const [, concurrentSnapshot] = await runtime.runPromise(
      Effect.all(
        [
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient
            yield* sql.withTransaction(
              Effect.gen(function* () {
                yield* sql`UPDATE threads SET title = 'uncommitted' WHERE id = '000'`
                yield* Effect.yieldNow()
                return yield* Effect.fail("rollback fixture")
              }),
            )
          }).pipe(Effect.exit),
          getSnapshot,
        ],
        { concurrency: 2 },
      ),
    )
    assert.equal(concurrentSnapshot.threads[0]?.title, "000")
    const indexes = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        return yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'index'`
      }),
    )
    assert.ok(indexes.some((index) => index.name === "threads_page_idx"))
    assert.ok(indexes.some((index) => index.name === "approvals_thread_idx"))
  } finally {
    await runtime.dispose()
  }
})
