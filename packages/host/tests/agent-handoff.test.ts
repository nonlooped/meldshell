import assert from "node:assert/strict"
import { test } from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect } from "effect"
import { promptText, type TurnDispatch } from "@meldshell/contracts"
import {
  getSnapshot,
  getTranscript,
  initializeDatabase,
  recordRuntimeEvent,
  rewindThread,
  searchTranscripts,
  setProviderSession,
  setThreadSettings,
  submitTurn,
  undoRewind,
} from "@meldshell/core"

const setup = Effect.gen(function* () {
  yield* initializeDatabase
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES ('workspace', '/tmp/handoff-test', 'test', 'now', 'now')`
  yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at, title_locked) VALUES ('thread', 'workspace', 'test', 'active', 'now', 'now', 1)`
  for (const harness of ["codex", "claude-code"]) {
    const [provider] = yield* sql<{
      id: string
    }>`SELECT id FROM providers WHERE harness = ${harness}`
    yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES (${harness}, ${provider!.id}, ${`${harness}-model`}, 'Fixture')`
  }
  yield* sql`INSERT INTO thread_settings (thread_id, provider_id, model_id) SELECT 'thread', provider_id, id FROM provider_models WHERE id = 'codex'`
})

/** Sends a message on a harness, then plays back a finished turn as its provider would report it. */
const runTurn = (
  harness: "codex" | "claude-code",
  text: string,
  work: { reply: string; file?: string; command?: string },
) =>
  Effect.gen(function* () {
    yield* setThreadSettings({ threadId: "thread", modelId: harness })
    const result = yield* submitTurn({ threadId: "thread", text })
    const dispatch = result.dispatch as TurnDispatch
    const event = (method: string, params: unknown) =>
      recordRuntimeEvent({
        threadId: "thread",
        turnId: dispatch.turnId,
        method,
        params,
        validated: true,
        promoteQueue: false,
      })
    yield* setProviderSession("thread", `${harness}-session-${dispatch.turnId}`, harness)
    if (work.command !== undefined)
      yield* event("item/completed", {
        item: { type: "commandExecution", id: `${dispatch.turnId}:c`, command: work.command },
      })
    if (work.file !== undefined)
      yield* event("turn/diff/updated", {
        diff: `diff --git a/${work.file} b/${work.file}\n--- a/${work.file}\n+++ b/${work.file}\n@@ -1 +1 @@\n-a\n+b\n`,
      })
    yield* event("item/completed", {
      item: { type: "agentMessage", id: `${dispatch.turnId}:m`, text: work.reply },
    })
    yield* event("turn/completed", { turn: { status: "completed" } })
    return dispatch
  })

const userPayload = (turnId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ provider_data: string }>`
      SELECT provider_data FROM events WHERE turn_id = ${turnId} AND kind = 'user'`
    return JSON.parse(row!.provider_data) as { handoff?: { reason: string; from: string[] } }
  })

const transcriptTurns = Effect.gen(function* () {
  const page = yield* getTranscript({ threadId: "thread" })
  return [...new Set(page.events.map((event) => event.turnId))]
})

test("a turn on another harness starts with a summary of the turns it did not see", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setup
      const first = yield* runTurn("codex", "Add a login page", {
        reply: "Added the login form.",
        file: "src/login.tsx",
        command: "npm test",
      })
      assert.equal(first.context, null)
      assert.equal((yield* userPayload(first.turnId)).handoff, undefined)

      const second = yield* runTurn("claude-code", "Now add tests", { reply: "Tests pass." })
      assert.equal(second.nativeThreadId, null)
      assert.match(second.context ?? "", /Codex/)
      assert.match(second.context ?? "", /Add a login page/)
      assert.match(second.context ?? "", /src\/login\.tsx/)
      assert.match(second.context ?? "", /npm test/)
      assert.match(second.context ?? "", /Added the login form\./)
      assert.deepEqual((yield* userPayload(second.turnId)).handoff?.from, ["codex"])
      assert.equal(promptText(second).endsWith("Now add tests"), true)
      assert.equal(promptText({ ...second, text: "/review" }).startsWith("/review"), true)

      // Codex's own session already holds the first turn, so only Claude Code's turn is new to it.
      const third = yield* runTurn("codex", "Ship it", { reply: "Shipped." })
      assert.equal(third.nativeThreadId, `codex-session-${first.turnId}`)
      assert.match(third.context ?? "", /Now add tests/)
      assert.doesNotMatch(third.context ?? "", /Add a login page/)

      const fourth = yield* runTurn("codex", "Thanks", { reply: "Done." })
      assert.equal(fourth.context, null)
      const [thread] = (yield* getSnapshot).threads
      assert.equal(thread?.lastHarness, "codex")
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})

test("a rewind hides later turns, restarts provider sessions from a summary, and can be undone", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setup
      const sql = yield* SqlClient.SqlClient
      const first = yield* runTurn("codex", "Add a login page", { reply: "Added the login form." })
      const second = yield* runTurn("claude-code", "Now add zebra tests", { reply: "Tests pass." })
      const third = yield* runTurn("codex", "Ship it", { reply: "Shipped." })

      const rewound = yield* rewindThread({
        threadId: "thread",
        turnId: second.turnId,
        filesRestored: true,
      })
      assert.equal(rewound.text, "Now add zebra tests")
      assert.equal(rewound.turnCount, 2)
      assert.equal(rewound.snapshot.threads[0]?.rewound, true)
      assert.equal(rewound.snapshot.threads[0]?.lastHarness, "codex")
      assert.deepEqual(yield* transcriptTurns, [first.turnId])
      assert.deepEqual(yield* sql`SELECT * FROM provider_sessions`, [])
      assert.equal((yield* searchTranscripts({ query: "zebra" })).results.length, 0)

      const undone = yield* undoRewind("thread")
      assert.equal(undone.filesRestored, true)
      assert.equal(undone.snapshot.threads[0]?.rewound, undefined)
      assert.deepEqual(yield* transcriptTurns, [first.turnId, second.turnId, third.turnId])
      assert.equal((yield* sql`SELECT * FROM provider_sessions`).length, 2)

      yield* rewindThread({ threadId: "thread", turnId: second.turnId, filesRestored: false })
      const retry = yield* runTurn("codex", "Add tests with Vitest", { reply: "Vitest added." })
      assert.equal(retry.nativeThreadId, null)
      assert.equal((yield* userPayload(retry.turnId)).handoff?.reason, "restart")
      assert.match(retry.context ?? "", /Add a login page/)
      assert.doesNotMatch(retry.context ?? "", /zebra/)
      assert.equal((yield* getSnapshot).threads[0]?.rewound, undefined)
      yield* undoRewind("thread").pipe(
        Effect.flip,
        Effect.map((error) => assert.match(error.message, /can no longer be undone/)),
      )
      assert.deepEqual(yield* transcriptTurns, [first.turnId, retry.turnId])
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})
