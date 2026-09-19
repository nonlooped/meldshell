import * as SqlClient from "@effect/sql/SqlClient"
import { threadActivitySql } from "./thread-activity"
import { type SearchTranscriptsInput } from "@meldshell/contracts"
import { prepareTranscriptEvents } from "@meldshell/projection"
import { Effect } from "effect"
import { type ThreadRow, type EventRow, fromThreadRow, fromEventRow } from "./database/rows"

export const refreshTranscriptSearch = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const dirty = yield* sql<{
    thread_id: string
    turn_key: string
  }>`SELECT d.thread_id, d.turn_key FROM transcript_search_dirty d WHERE NOT EXISTS (SELECT 1 FROM turns t WHERE t.id = d.turn_key AND t.status = 'running') LIMIT 8`
  yield* sql.withTransaction(
    Effect.gen(function* () {
      for (const group of dirty) {
        const turnId = group.turn_key || null
        const events =
          yield* sql<EventRow>`SELECT * FROM events WHERE thread_id = ${group.thread_id} AND turn_id IS ${turnId} ORDER BY sequence`
        yield* sql`DELETE FROM transcript_documents WHERE thread_id = ${group.thread_id} AND turn_id IS ${turnId}`
        for (const event of prepareTranscriptEvents(events.map(fromEventRow))) {
          if (!event.text?.trim()) continue
          yield* sql`INSERT INTO transcript_documents(id, thread_id, event_id, turn_id, text, created_at)
          VALUES (${`${event.threadId}:${event.turnId ?? ""}:${event.id}`}, ${event.threadId}, ${event.id}, ${event.turnId}, ${event.text}, ${event.createdAt})`
        }
        yield* sql`DELETE FROM transcript_search_dirty WHERE thread_id = ${group.thread_id} AND turn_key = ${group.turn_key}`
      }
    }),
  )
})

export const searchTranscripts = (input: SearchTranscriptsInput) =>
  Effect.gen(function* () {
    const terms = input.query.slice(0, 500).match(/[\p{L}\p{N}_]+/gu) ?? []
    if (terms.length === 0) return { results: [], hasMore: false }
    const match = terms.map((term) => `"${term}"*`).join(" AND ")
    const sql = yield* SqlClient.SqlClient
    const offset = Number.isFinite(input.offset) ? Math.max(0, Math.floor(input.offset ?? 0)) : 0
    const rows = yield* sql<
      ThreadRow & { event_id: string; turn_id: string | null; snippet: string }
    >`
      SELECT t.*, e.event_id, e.turn_id,
        snippet(transcript_document_search, 0, '[match]', '[/match]', '…', 32) AS snippet,
        ${sql.unsafe(threadActivitySql)} AS activity,
        (SELECT COUNT(*) FROM queued_inputs q WHERE q.thread_id = t.id) AS queued_count,
        (SELECT COUNT(*) FROM turns r WHERE r.thread_id = t.id) AS turn_count
      FROM transcript_document_search JOIN transcript_documents e ON e.rowid = transcript_document_search.rowid
      JOIN threads t ON t.id = e.thread_id
      WHERE transcript_document_search MATCH ${match}
        AND (${input.workspaceId ?? null} IS NULL OR t.workspace_id = ${input.workspaceId ?? null})
      ORDER BY rank, e.created_at DESC, e.id
      LIMIT 51 OFFSET ${offset}`
    return {
      results: rows.slice(0, 50).map((row) => ({
        thread: fromThreadRow(row),
        eventId: row.event_id,
        turnId: row.turn_id,
        snippet: row.snippet,
      })),
      hasMore: rows.length > 50,
    }
  })
