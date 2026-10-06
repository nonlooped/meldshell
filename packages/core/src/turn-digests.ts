import * as SqlClient from "effect/sql/SqlClient"
import type { CanonicalEvent } from "@meldshell/contracts"
import { Effect } from "effect"
import { EventFromRow, readRows } from "./database/rows"
import { digestTurn, type TurnDigest } from "./handoff"

interface Turn {
  readonly id: string
  readonly harness: string
  readonly status: string
}

/** Enough digests for every turn a long thread hands over, without growing with the database. */
const CACHE_LIMIT = 5_000

/**
 * Digests of finished turns, per database. Events are only ever appended, so a turn whose status,
 * event count, and latest event are unchanged digests the same; anything else reads it again.
 */
const caches = new WeakMap<
  object,
  Map<string, { readonly key: string; readonly digest: TurnDigest | null }>
>()

/** The turns' digests, oldest first, leaving out turns that did nothing to hand over. */
export const turnDigests = (threadId: string, turns: ReadonlyArray<Turn>) =>
  Effect.gen(function* () {
    if (turns.length === 0) return []
    const sql = yield* SqlClient.SqlClient
    let cache = caches.get(sql)
    if (cache === undefined) {
      cache = new Map()
      caches.set(sql, cache)
    }
    const ids = sql.in(turns.map((turn) => turn.id))
    const counts = yield* sql<{
      readonly turn_id: string
      readonly count: number
      readonly latest: number
    }>`
      SELECT turn_id, COUNT(*) AS count, MAX(sequence) AS latest FROM events
      WHERE thread_id = ${threadId} AND turn_id IN ${ids} GROUP BY turn_id
    `
    const versions = new Map(counts.map((row) => [row.turn_id, `${row.count}:${row.latest}`]))
    const keyOf = (turn: Turn) => `${turn.status}:${versions.get(turn.id) ?? "0"}`
    const missing = turns.filter((turn) => cache.get(turn.id)?.key !== keyOf(turn))
    const events = new Map<string, CanonicalEvent[]>()
    if (missing.length > 0) {
      const rows = yield* readRows(
        EventFromRow,
        sql`SELECT * FROM events WHERE thread_id = ${threadId}
          AND turn_id IN ${sql.in(missing.map((turn) => turn.id))} ORDER BY sequence`,
      )
      for (const event of rows) {
        const group = events.get(event.turnId!) ?? []
        group.push(event)
        events.set(event.turnId!, group)
      }
    }
    return turns.flatMap((turn) => {
      const key = keyOf(turn)
      const cached = cache.get(turn.id)
      if (cached?.key === key) {
        // Refreshed, so the oldest unused digests are the ones dropped.
        cache.delete(turn.id)
        cache.set(turn.id, cached)
        return cached.digest ?? []
      }
      const digest = digestTurn({ ...turn, events: events.get(turn.id) ?? [] })
      // A running turn changes with every event, so only finished ones are kept.
      if (turn.status !== "running") {
        cache.set(turn.id, { key, digest })
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
      }
      return digest ?? []
    })
  })
