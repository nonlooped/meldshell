import assert from "node:assert/strict"
import { test } from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect } from "effect"
import { promptText, type TurnDispatch } from "@meldshell/contracts"
import {
  createThread,
  getSnapshot,
  initializeDatabase,
  recordRuntimeEvent,
  rewindThread,
  submitTurn,
} from "@meldshell/core"
import { issueBrief } from "../src/issues"

const issue = { number: 42, title: "Login redirect loops", url: "https://github.com/o/r/issues/42" }

test("a thread started from an issue sends the issue with its first turn only", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* initializeDatabase
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES ('workspace', '/tmp/issue-test', 'test', 'now', 'now')`
      const [provider] = yield* sql<{
        id: string
      }>`SELECT id FROM providers WHERE harness = 'codex'`
      yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES ('model', ${provider!.id}, 'model', 'Fixture')`
      const context = issueBrief({ ...issue, body: "Signing in sends you back to /login." })
      const snapshot = yield* createThread({
        workspaceId: "workspace",
        title: issue.title,
        issue: { ...issue, context },
      })
      const thread = snapshot.threads[0]!
      assert.deepEqual(thread.issue, issue)
      assert.equal(thread.title, issue.title)
      yield* sql`INSERT OR REPLACE INTO thread_settings (thread_id, provider_id, model_id) VALUES (${thread.id}, ${provider!.id}, 'model')`

      const run = (text: string) =>
        Effect.gen(function* () {
          const dispatch = (yield* submitTurn({ threadId: thread.id, text }))
            .dispatch as TurnDispatch
          yield* recordRuntimeEvent({
            threadId: thread.id,
            turnId: dispatch.turnId,
            method: "turn/completed",
            params: { turn: { status: "completed" } },
            validated: true,
            promoteQueue: false,
          })
          return dispatch
        })
      const first = yield* run("Fix it")
      assert.equal(first.context, context)
      assert.equal(promptText(first), `${context}\n\nFix it`)
      const second = yield* run("Add a test")
      assert.equal(second.context, null)

      // Rewinding to the start makes the next turn the first again, so it gets the issue back.
      yield* rewindThread({ threadId: thread.id, turnId: first.turnId, filesRestored: false })
      const again = yield* run("Try another way")
      assert.equal(again.context, context)
      assert.deepEqual((yield* getSnapshot).threads[0]?.issue, issue)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})
