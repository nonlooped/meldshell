import assert from "node:assert/strict"
import { test } from "node:test"
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, Either, ManagedRuntime } from "effect"
import { runMigrations } from "./database/migrations"
import { firstRun, followingRun } from "@meldshell/contracts"
import {
  claimDueSchedules,
  deleteSchedule,
  listSchedules,
  recordScheduleRun,
  saveSchedule,
} from "./schedules"

const local = (year: number, month: number, day: number, hours: number, minutes: number) =>
  new Date(year, month - 1, day, hours, minutes)

test("daily schedules run at the next local time on an allowed weekday", () => {
  // Thursday 24 September 2026, 10:00.
  const now = local(2026, 9, 24, 10, 0)
  const every = { kind: "daily", time: "09:30", weekdays: [] } as const
  assert.deepEqual(firstRun(every, now), local(2026, 9, 25, 9, 30))
  assert.deepEqual(firstRun({ ...every, time: "10:30" }, now), local(2026, 9, 24, 10, 30))
  // Mondays only: the following Monday.
  const mondays = { kind: "daily", time: "09:30", weekdays: [1] } as const
  assert.deepEqual(firstRun(mondays, now), local(2026, 9, 28, 9, 30))
  assert.deepEqual(followingRun(mondays, local(2026, 9, 28, 9, 30)), local(2026, 10, 5, 9, 30))
})

test("intervals count from the run, and one-time prompts run once", () => {
  const now = new Date("2026-09-24T10:00:00Z")
  const hourly = { kind: "interval", minutes: 60 } as const
  assert.equal(firstRun(hourly, now)?.toISOString(), "2026-09-24T11:00:00.000Z")
  assert.equal(followingRun(hourly, now)?.toISOString(), "2026-09-24T11:00:00.000Z")
  const once = { kind: "once", at: "2026-09-24T12:00:00Z" } as const
  assert.equal(firstRun(once, now)?.toISOString(), "2026-09-24T12:00:00.000Z")
  assert.equal(followingRun(once, now), null)
  // A moment that has just passed still runs; one long gone does not.
  assert.notEqual(firstRun({ kind: "once", at: "2026-09-24T09:59:30Z" }, now), null)
  assert.equal(firstRun({ kind: "once", at: "2026-09-24T09:00:00Z" }, now), null)
})

const database = async (t: { after: (run: () => Promise<void>) => void }) => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`PRAGMA foreign_keys = ON`
      yield* runMigrations
      yield* sql`INSERT INTO workspaces VALUES ('w', '/w', 'w', '2026-09-01', '2026-09-01')`
      yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at)
        VALUES ('t', 'w', 'Thread', 'active', '2026-09-01', '2026-09-01')`
    }),
  )
  return runtime
}

test("due schedules are handed out once and move on to their next run", async (t) => {
  const runtime = await database(t)
  const now = new Date("2026-09-24T10:00:00Z")
  const hourly = await runtime.runPromise(
    saveSchedule(
      {
        threadId: "t",
        prompt: "  Check CI  ",
        cadence: { kind: "interval", minutes: 60 },
        enabled: true,
      },
      now,
    ),
  )
  assert.equal(hourly.prompt, "Check CI")
  assert.equal(hourly.nextRunAt, "2026-09-24T11:00:00.000Z")
  const once = await runtime.runPromise(
    saveSchedule(
      {
        threadId: "t",
        prompt: "Summarize",
        cadence: { kind: "once", at: "2026-09-24T10:30:00.000Z" },
        enabled: true,
      },
      now,
    ),
  )

  assert.deepEqual(await runtime.runPromise(claimDueSchedules(now)), [])
  const late = new Date("2026-09-24T13:05:00Z")
  const due = await runtime.runPromise(claimDueSchedules(late))
  assert.deepEqual(
    due.map((schedule) => schedule.id),
    [once.id, hourly.id],
  )
  // Claimed schedules are not handed out again; missed hours are not repeated.
  assert.deepEqual(await runtime.runPromise(claimDueSchedules(late)), [])
  await runtime.runPromise(recordScheduleRun(hourly.id, "Thread is busy"))
  const listed = await runtime.runPromise(listSchedules("t"))
  const hourlyAfter = listed.find((schedule) => schedule.id === hourly.id)
  const onceAfter = listed.find((schedule) => schedule.id === once.id)
  assert.equal(hourlyAfter?.nextRunAt, "2026-09-24T14:05:00.000Z")
  assert.equal(hourlyAfter?.lastRunAt, late.toISOString())
  assert.equal(hourlyAfter?.lastError, "Thread is busy")
  assert.equal(onceAfter?.enabled, false)
  assert.equal(onceAfter?.nextRunAt, null)

  await runtime.runPromise(deleteSchedule(hourly.id))
  assert.deepEqual(
    (await runtime.runPromise(listSchedules(undefined))).map((schedule) => schedule.id),
    [once.id],
  )
})

test("schedules refuse empty prompts and past moments, and go with their thread", async (t) => {
  const runtime = await database(t)
  const now = new Date("2026-09-24T10:00:00Z")
  const attempt = (prompt: string, at: string) =>
    runtime.runPromise(
      saveSchedule(
        { threadId: "t", prompt, cadence: { kind: "once", at }, enabled: true },
        now,
      ).pipe(Effect.either),
    )
  assert.ok(Either.isLeft(await attempt(" ", "2026-09-25T00:00:00Z")))
  assert.ok(Either.isLeft(await attempt("Later", "2026-09-23T00:00:00Z")))
  // A paused schedule keeps any moment, since it will not run.
  await runtime.runPromise(
    saveSchedule(
      {
        threadId: "t",
        prompt: "Paused",
        cadence: { kind: "once", at: "2026-09-23T00:00:00Z" },
        enabled: false,
      },
      now,
    ),
  )
  await runtime.runPromise(
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql`DELETE FROM threads WHERE id = 't'`),
  )
  assert.deepEqual(await runtime.runPromise(listSchedules(undefined)), [])
})
