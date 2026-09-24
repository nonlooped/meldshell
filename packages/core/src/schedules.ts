import * as SqlClient from "@effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import {
  CoreProtocolError,
  firstRun,
  followingRun,
  type SaveScheduleInput,
  ScheduleCadence,
  type ScheduledPrompt,
} from "@meldshell/contracts"
import { Effect, Option, Schema } from "effect"
import { transaction } from "./database/persistence"

interface ScheduleRow {
  readonly id: string
  readonly thread_id: string
  readonly prompt: string
  readonly cadence: string
  readonly enabled: number
  readonly next_run_at: string | null
  readonly last_run_at: string | null
  readonly last_error: string | null
  readonly created_at: string
}

const decodeCadence = Schema.decodeUnknownOption(Schema.parseJson(ScheduleCadence))

/** A row whose cadence no longer decodes is left out rather than failing every listing. */
const fromScheduleRow = (row: ScheduleRow): ScheduledPrompt[] =>
  Option.match(decodeCadence(row.cadence), {
    onNone: () => [],
    onSome: (cadence) => [
      {
        id: row.id,
        threadId: row.thread_id,
        prompt: row.prompt,
        cadence,
        enabled: row.enabled === 1,
        nextRunAt: row.next_run_at,
        lastRunAt: row.last_run_at,
        lastError: row.last_error,
        createdAt: row.created_at,
      },
    ],
  })

const COLUMNS =
  "id, thread_id, prompt, cadence, enabled, next_run_at, last_run_at, last_error, created_at"

/** Every schedule, or one thread's, soonest first; paused and finished schedules come last. */
export const listSchedules = (threadId: string | undefined) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ScheduleRow>`SELECT ${sql.unsafe(COLUMNS)} FROM scheduled_prompts
      WHERE ${threadId === undefined ? 1 : 0} = 1 OR thread_id = ${threadId ?? ""}
      ORDER BY next_run_at IS NULL, next_run_at, created_at`
    return rows.flatMap(fromScheduleRow)
  })

const getSchedule = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows =
      yield* sql<ScheduleRow>`SELECT ${sql.unsafe(COLUMNS)} FROM scheduled_prompts WHERE id = ${id}`
    const schedule = rows.flatMap(fromScheduleRow)[0]
    if (schedule === undefined)
      return yield* Effect.fail(
        new CoreProtocolError({ message: "This schedule no longer exists." }),
      )
    return schedule
  })

export const saveSchedule = (input: SaveScheduleInput, now = new Date()) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const prompt = input.prompt.trim()
    if (prompt === "")
      return yield* Effect.fail(new CoreProtocolError({ message: "Write the prompt to send." }))
    const threads = yield* sql<{ id: string }>`SELECT id FROM threads WHERE id = ${input.threadId}`
    if (threads.length === 0)
      return yield* Effect.fail(new CoreProtocolError({ message: "Thread not found." }))
    const next = input.enabled ? firstRun(input.cadence, now) : null
    if (input.enabled && next === null)
      return yield* Effect.fail(
        new CoreProtocolError({ message: "Choose a time in the future for this prompt." }),
      )
    const cadence = JSON.stringify(input.cadence)
    const nextRunAt = next?.toISOString() ?? null
    const enabled = input.enabled ? 1 : 0
    const id = input.id ?? randomUUID()
    if (input.id === undefined) {
      yield* sql`INSERT INTO scheduled_prompts (
          id, thread_id, prompt, cadence, enabled, next_run_at, created_at
        ) VALUES (
          ${id}, ${input.threadId}, ${prompt}, ${cadence}, ${enabled}, ${nextRunAt},
          ${now.toISOString()}
        )`
    } else {
      yield* getSchedule(id)
      // Editing clears the last error, which described the schedule as it was.
      yield* sql`UPDATE scheduled_prompts
        SET thread_id = ${input.threadId}, prompt = ${prompt}, cadence = ${cadence},
          enabled = ${enabled}, next_run_at = ${nextRunAt}, last_error = NULL
        WHERE id = ${id}`
    }
    return yield* getSchedule(id)
  }).pipe(transaction)

export const deleteSchedule = (id: string) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`DELETE FROM scheduled_prompts WHERE id = ${id}`.pipe(Effect.asVoid),
  )

/**
 * The enabled schedules due at `now`, each moved on to its following run in the same transaction,
 * so a schedule is handed out once however often this is called. A one-time prompt is disabled.
 */
export const claimDueSchedules = (now: Date) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ScheduleRow>`SELECT ${sql.unsafe(COLUMNS)} FROM scheduled_prompts
      WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ${now.toISOString()}
      ORDER BY next_run_at`
    const due = rows.flatMap(fromScheduleRow)
    for (const schedule of due) {
      const next = followingRun(schedule.cadence, now)
      yield* sql`UPDATE scheduled_prompts
        SET next_run_at = ${next?.toISOString() ?? null}, enabled = ${next === null ? 0 : 1},
          last_run_at = ${now.toISOString()}
        WHERE id = ${schedule.id}`
    }
    return due
  }).pipe(transaction)

/** Records whether a claimed run could send its prompt. */
export const recordScheduleRun = (id: string, error: string | null) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`UPDATE scheduled_prompts SET last_error = ${error} WHERE id = ${id}`.pipe(Effect.asVoid),
  )
