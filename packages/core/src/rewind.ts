import * as SqlClient from "effect/sql/SqlClient"
import { CoreProtocolError, type RewindResult, type UndoRewindResult } from "@meldshell/contracts"
import { Effect, Schema } from "effect"
import { transaction } from "./database/transaction"
import { getSnapshot } from "./snapshots"

/**
 * A rewind takes a turn and every later one out of the conversation. Their events stay on disk,
 * but the transcript, search, and handoff summaries leave them out. No harness can drop turns
 * from a session it already holds, so the thread's provider sessions are set aside and the next
 * turn starts a new one from a summary of the turns that remain.
 */

const SetAsideSessions = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      provider: Schema.String,
      harness: Schema.String,
      native_thread_id: Schema.String,
      created_at: Schema.String,
    }),
  ),
)

const requireIdle = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const busy = yield* sql`
      SELECT 1 FROM turns WHERE thread_id = ${threadId} AND status = 'running'
      UNION ALL SELECT 1 FROM queued_inputs WHERE thread_id = ${threadId}
      LIMIT 1
    `
    if (busy.length > 0)
      return yield* Effect.fail(
        new CoreProtocolError({ message: "Stop this thread's work before rewinding it." }),
      )
  })

export const rewindThread = (input: {
  readonly threadId: string
  readonly turnId: string
  readonly filesRestored: boolean
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireIdle(input.threadId)
    const turns = yield* sql<{ readonly id: string }>`
      SELECT id FROM turns WHERE thread_id = ${input.threadId} AND rewound_at IS NULL
      ORDER BY started_at, rowid
    `
    const index = turns.findIndex((turn) => turn.id === input.turnId)
    if (index < 0)
      return yield* Effect.fail(
        new CoreProtocolError({ message: "This turn is no longer part of the conversation." }),
      )
    const removed = turns.slice(index).map((turn) => turn.id)
    const [message] = yield* sql<{ readonly text: string | null }>`
      SELECT text FROM events WHERE turn_id = ${input.turnId} AND kind = 'user'
      ORDER BY sequence LIMIT 1
    `
    const sessions = yield* sql`
      SELECT provider, harness, native_thread_id, created_at
      FROM provider_sessions WHERE thread_id = ${input.threadId}
    `
    const timestamp = new Date().toISOString()
    // Only the latest rewind can be undone; an earlier one that was not undone stays.
    yield* sql`DELETE FROM thread_rewinds WHERE thread_id = ${input.threadId}`
    yield* sql`
      INSERT INTO thread_rewinds (thread_id, rewound_at, turn_count, files_restored, sessions)
      VALUES (
        ${input.threadId}, ${timestamp}, ${removed.length}, ${input.filesRestored ? 1 : 0},
        ${JSON.stringify(sessions)}
      )
    `
    yield* sql`UPDATE turns SET rewound_at = ${timestamp} WHERE id IN ${sql.in(removed)}`
    yield* sql`DELETE FROM provider_sessions WHERE thread_id = ${input.threadId}`
    yield* sql`UPDATE threads SET history_revision = ${timestamp}, updated_at = ${timestamp}
      WHERE id = ${input.threadId}`
    return {
      snapshot: yield* getSnapshot,
      text: message?.text ?? "",
      turnCount: removed.length,
      filesRestored: input.filesRestored,
    } satisfies RewindResult
  }).pipe(transaction)

/** Returns the latest rewind's turns and sessions. A turn started since then made it permanent. */
export const undoRewind = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireIdle(threadId)
    const [rewind] = yield* sql<{
      readonly rewound_at: string
      readonly files_restored: number
      readonly sessions: string
    }>`SELECT rewound_at, files_restored, sessions FROM thread_rewinds WHERE thread_id = ${threadId}`
    if (rewind === undefined)
      return yield* Effect.fail(
        new CoreProtocolError({ message: "This rewind can no longer be undone." }),
      )
    const sessions = yield* Schema.decodeUnknownEffect(SetAsideSessions)(rewind.sessions)
    yield* sql`UPDATE turns SET rewound_at = NULL
      WHERE thread_id = ${threadId} AND rewound_at = ${rewind.rewound_at}`
    yield* sql`DELETE FROM provider_sessions WHERE thread_id = ${threadId}`
    for (const session of sessions)
      yield* sql`
        INSERT INTO provider_sessions (thread_id, provider, harness, native_thread_id, created_at)
        VALUES (
          ${threadId}, ${session.provider}, ${session.harness}, ${session.native_thread_id},
          ${session.created_at}
        )
      `
    yield* sql`DELETE FROM thread_rewinds WHERE thread_id = ${threadId}`
    yield* sql`UPDATE threads SET history_revision = ${new Date().toISOString()}
      WHERE id = ${threadId}`
    return {
      snapshot: yield* getSnapshot,
      filesRestored: rewind.files_restored === 1,
    } satisfies UndoRewindResult
  }).pipe(transaction)
