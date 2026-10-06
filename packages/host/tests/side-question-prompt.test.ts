import assert from "node:assert/strict"
import { test } from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect } from "effect"
import type { TurnDispatch } from "@meldshell/contracts"
import {
  getTranscript,
  initializeDatabase,
  recordRuntimeEvent,
  setProviderSession,
  sideQuestionPrompt,
  submitTurn,
} from "@meldshell/core"

const setup = Effect.gen(function* () {
  yield* initializeDatabase
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES ('workspace', '/tmp/side-question-test', 'test', 'now', 'now')`
  yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at, title_locked) VALUES ('thread', 'workspace', 'test', 'active', 'now', 'now', 1)`
  const [provider] = yield* sql<{
    id: string
  }>`SELECT id FROM providers WHERE harness = 'claude-code'`
  yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES ('claude', ${provider!.id}, 'claude-model', 'Fixture')`
  yield* sql`INSERT INTO thread_settings (thread_id, provider_id, model_id) VALUES ('thread', ${provider!.id}, 'claude')`
})

test("a side question reads the whole conversation and leaves the thread untouched", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setup
      const sql = yield* SqlClient.SqlClient
      const first = (yield* submitTurn({ threadId: "thread", text: "Add a login page" }))
        .dispatch as TurnDispatch
      const event = (turnId: string, method: string, params: unknown) =>
        recordRuntimeEvent({
          threadId: "thread",
          turnId,
          method,
          params,
          validated: true,
          promoteQueue: false,
        })
      yield* setProviderSession("thread", "claude-session", "claude-code")
      yield* event(first.turnId, "item/completed", {
        item: { type: "agentMessage", id: "m1", text: "Added the login form in src/login.tsx." },
      })
      yield* event(first.turnId, "turn/completed", { turn: { status: "completed" } })
      // The second turn is still running when the question is asked.
      const second = (yield* submitTurn({ threadId: "thread", text: "Now add tests" }))
        .dispatch as TurnDispatch
      yield* event(second.turnId, "item/completed", {
        item: { type: "agentMessage", id: "m2", text: "Looking at the test setup." },
      })

      const counts = sql<{ events: number; turns: number }>`
        SELECT (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM turns) AS turns`
      const before = yield* counts
      const transcript = yield* getTranscript({ threadId: "thread" })
      const prompt = yield* sideQuestionPrompt("thread", "Which file has the form?")

      assert.match(prompt, /Claude Code will not see the question or your answer/)
      assert.match(prompt, /Add a login page/)
      assert.match(prompt, /Added the login form in src\/login\.tsx\./)
      assert.match(prompt, /Now add tests/)
      assert.match(prompt, /_This turn is still running\._/)
      assert.match(prompt, /<side_question>\nWhich file has the form\?\n<\/side_question>$/)
      assert.deepEqual(yield* counts, before)
      assert.deepEqual(yield* getTranscript({ threadId: "thread" }), transcript)

      // A finished turn's account is reused only while its events stay the same.
      const late = { type: "agentMessage", id: "m3", text: "Moved the form to src/auth.tsx." }
      yield* sql`INSERT INTO events (
        id, thread_id, turn_id, sequence, kind, method, text, provider_data, created_at
      ) VALUES (
        'late', 'thread', ${first.turnId}, 1000, 'assistant', 'item/completed', ${late.text},
        ${JSON.stringify({ item: late })}, 'now'
      )`
      yield* event(second.turnId, "turn/completed", { turn: { status: "completed" } })
      const later = yield* sideQuestionPrompt("thread", "Where is the form now?")
      assert.match(later, /Moved the form to src\/auth\.tsx\./)
      assert.doesNotMatch(later, /still running/)

      const missing = yield* Effect.flip(sideQuestionPrompt("nowhere", "Hello?"))
      assert.match(String(missing.message), /Thread not found/)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})
