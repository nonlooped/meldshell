import * as SqlClient from "@effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import {
  type CreateThreadInput,
  type Thread,
  CoreProtocolError,
  defaultReasoningEffort,
} from "@meldshell/contracts"
import { Effect } from "effect"
import { transaction } from "./database/persistence"
import { DEFAULT_THREAD_TITLE, resolveThreadTitle } from "./titles"
import { defaultSelection } from "./catalog"
import { getSnapshot } from "./snapshots"

export const setThreadPinned = (threadId: string, pinned: boolean) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE threads SET pinned = ${pinned ? 1 : 0},
      status = CASE WHEN ${pinned ? 1 : 0} = 1 THEN 'active' ELSE status END,
      updated_at = ${new Date().toISOString()} WHERE id = ${threadId}`
    return yield* getSnapshot
  })

export const createThread = (input: CreateThreadInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const timestamp = new Date().toISOString()
    const title = resolveThreadTitle(input.title)
    // A caller-supplied title is a decision, not a placeholder, so title generation leaves it alone.
    const titleLocked = title === DEFAULT_THREAD_TITLE ? 0 : 1
    const threadId = randomUUID()
    const selection = yield* defaultSelection

    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`
          INSERT INTO threads (
            id, workspace_id, title, status, created_at, updated_at, title_locked
          )
          VALUES (
            ${threadId}, ${input.workspaceId}, ${title}, 'active',
            ${timestamp}, ${timestamp}, ${titleLocked}
          )
        `
        yield* sql`
          UPDATE workspaces SET last_opened_at = ${timestamp} WHERE id = ${input.workspaceId}
        `
        if (selection !== null) {
          yield* sql`
            INSERT INTO thread_settings (
              thread_id, provider_id, model_id, reasoning_effort, speed,
              mode, sandbox, approval_policy
            )
            VALUES (
              ${threadId}, ${selection.providerId}, ${selection.id},
              ${defaultReasoningEffort(
                selection.reasoningEfforts,
                selection.defaultReasoningEffort,
              )}, 'standard',
              'default', 'workspace-write', 'on-request'
            )
          `
        }
      }),
    )

    return yield* getSnapshot
  })

export const setThreadStatus = (threadId: string, status: Thread["status"]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE threads
      SET status = ${status}, pinned = CASE WHEN ${status} = 'settled' THEN 0 ELSE pinned END, updated_at = ${new Date().toISOString()}
      WHERE id = ${threadId}
    `
    return yield* getSnapshot
  })

export const deleteThread = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const running =
      yield* sql`SELECT id FROM turns WHERE thread_id = ${threadId} AND status = 'running'`
    if (running.length > 0)
      return yield* Effect.fail(
        new CoreProtocolError({
          message: "Interrupt the running turn before deleting this thread.",
        }),
      )
    yield* sql`DELETE FROM threads WHERE id = ${threadId}`
    return yield* getSnapshot
  }).pipe(transaction)

export const setProviderSession = (threadId: string, nativeThreadId: string, harness = "codex") =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO provider_sessions (
        thread_id, provider, harness, native_thread_id, created_at
      ) VALUES (${threadId}, ${harness === "cursor" ? "cursor" : harness === "claude-code" ? "anthropic" : "openai"}, ${harness}, ${nativeThreadId}, ${new Date().toISOString()})
      ON CONFLICT(thread_id, harness) DO UPDATE SET native_thread_id = excluded.native_thread_id
    `
    return yield* getSnapshot
  })
