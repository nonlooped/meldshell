import assert from "node:assert/strict"
import { test } from "node:test"
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import { getTranscript } from "./transcript"

test("windows retain boundary turns; forward catch-up is ordered, bounded and thread scoped", async (t) => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE events (id TEXT, thread_id TEXT, turn_id TEXT, sequence INTEGER,
      kind TEXT, method TEXT, text TEXT, provider_data TEXT, created_at TEXT)`
      for (let sequence = 1; sequence <= 8; sequence++) {
        yield* sql`INSERT INTO events VALUES (${String(sequence)}, 'thread',
        ${sequence < 3 ? "old" : "live"}, ${sequence}, 'user', 'user/message', 'hello', '{}', '2026-09-01')`
      }
      yield* sql`INSERT INTO events VALUES ('other', 'other', 'other', 9, 'user', 'user/message', 'other', '{}', '2026-09-01')`
    }),
  )
  const recent = await runtime.runPromise(getTranscript({ threadId: "thread", limit: 2 }))
  assert.deepEqual(
    recent.events.map((event) => event.sequence),
    [3, 4, 5, 6, 7, 8],
  )
  assert.equal(recent.nextCursor, 3)
  const old = await runtime.runPromise(
    getTranscript({ threadId: "thread", beforeSequence: 3, limit: 2 }),
  )
  assert.deepEqual(
    old.events.map((event) => event.sequence),
    [1, 2],
  )
  assert.equal(old.nextCursor, null)
  const forward = await runtime.runPromise(
    getTranscript({ threadId: "thread", afterSequence: 3, limit: 2 }),
  )
  assert.deepEqual(
    forward.events.map((event) => event.sequence),
    [4, 5],
  )
  assert.equal(forward.nextCursor, 5)
  const tail = await runtime.runPromise(
    getTranscript({ threadId: "thread", afterSequence: 7, limit: 2 }),
  )
  assert.deepEqual(
    tail.events.map((event) => event.sequence),
    [8],
  )
  assert.equal(tail.nextCursor, null)
})
