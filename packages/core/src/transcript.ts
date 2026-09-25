import { readRows } from "./database/rows"
import * as SqlClient from "@effect/sql/SqlClient"
import type { TranscriptPage, TranscriptQuery } from "@meldshell/contracts"
import { Effect } from "effect"
import { EventFromRow } from "./database/rows"

// Backward windows include the whole boundary turn: projecting a partial turn can
// lose its user message, item starts, and provider-native grouping context.
export const getTranscript = (input: TranscriptQuery) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const limit = Math.max(1, Math.min(200, Math.floor(input.limit ?? 80)))
    if (input.afterSequence !== undefined) {
      const rows = yield* readRows(
        EventFromRow,
        sql`
        SELECT * FROM events WHERE thread_id = ${input.threadId}
        AND sequence > ${input.afterSequence} ORDER BY sequence ASC LIMIT ${limit + 1}
      `,
      )
      const page = rows.slice(0, limit)
      return {
        events: page,
        nextCursor: rows.length > limit ? (page.at(-1)?.sequence ?? null) : null,
      } satisfies TranscriptPage
    }
    const before = input.beforeSequence ?? Number.MAX_SAFE_INTEGER
    const rows = yield* readRows(
      EventFromRow,
      sql`
      SELECT * FROM events WHERE thread_id = ${input.threadId}
      AND sequence < ${before} ORDER BY sequence DESC LIMIT ${limit + 1}
    `,
    )
    const page = rows.slice(0, limit).reverse()
    const boundary = page[0]
    if (boundary?.turnId) {
      const earlier = yield* readRows(
        EventFromRow,
        sql`
        SELECT * FROM events WHERE thread_id = ${input.threadId}
        AND sequence < ${boundary.sequence}
        AND sequence >= (SELECT MIN(sequence) FROM events
          WHERE thread_id = ${input.threadId} AND turn_id = ${boundary.turnId})
        ORDER BY sequence ASC
      `,
      )
      page.unshift(...earlier)
    }
    const first = page[0]?.sequence
    const older =
      first === undefined
        ? []
        : yield* sql<{ sequence: number }>`
      SELECT sequence FROM events WHERE thread_id = ${input.threadId}
      AND sequence < ${first} LIMIT 1
    `
    return {
      events: page,
      nextCursor: older.length > 0 ? (first ?? null) : null,
    } satisfies TranscriptPage
  })
