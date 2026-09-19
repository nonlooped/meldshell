import * as SqlClient from "@effect/sql/SqlClient"
import { runMigrations } from "./migrations"
import { randomUUID } from "node:crypto"
import { type CanonicalEventKind } from "@meldshell/contracts"
import { Effect } from "effect"
import { seedCatalog } from "../catalog"

export const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(effect))

export const initializeDatabase = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`PRAGMA foreign_keys = ON`
  yield* sql`PRAGMA journal_mode = WAL`
  yield* sql`PRAGMA synchronous = FULL`
  yield* sql`PRAGMA busy_timeout = 5000`
  yield* runMigrations

  yield* recoverInterruptedWork.pipe(transaction)

  yield* seedCatalog
})

export const appendEvent = (
  threadId: string,
  turnId: string | null,
  kind: CanonicalEventKind,
  method: string,
  text: string | null,
  payload: unknown,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO events (
        id, thread_id, turn_id, sequence, kind, method, text, provider_data, created_at
      )
      SELECT ${randomUUID()}, ${threadId}, ${turnId}, COALESCE(MAX(sequence), 0) + 1,
             ${kind}, ${method}, ${text}, ${JSON.stringify(payload ?? null)},
             ${new Date().toISOString()}
      FROM events WHERE thread_id = ${threadId}
    `
  })

const recoverInterruptedWork = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const recoveredAt = new Date().toISOString()
  yield* sql`
    UPDATE turns
    SET status = 'interrupted', completed_at = ${recoveredAt},
        error = 'MeldShell stopped before this turn completed.'
    WHERE status = 'running'
  `
  yield* sql`DELETE FROM approvals`
  yield* sql`DELETE FROM settings WHERE key = 'shutting_down'`
})
