import { readRows } from "./database/rows"
import * as SqlClient from "@effect/sql/SqlClient"
import type { AppSnapshot, Thread } from "@meldshell/contracts"
import { Effect } from "effect"
import { transaction } from "./database/transaction"
import {
  ModelFromRow,
  ProviderFromRow,
  ThreadFromRow,
  ThreadSettingsFromRow,
  WorkspaceFromRow,
  ApprovalFromRow,
  modelColumns,
  providerColumns,
  threadColumns,
  threadSettingsColumns,
} from "./database/rows"
import { readAppSettings } from "./settings"
import { THREAD_ORDER, THREAD_SUMMARY, threadRank } from "./thread-listing"

/** The snapshot carries this many threads; the inbox pages through the rest. */
const SNAPSHOT_THREADS = 250

/** Up to `limit` threads matching `where`, in listing order, with their derived fields. */
const threadPage = (
  sql: SqlClient.SqlClient,
  where: ReturnType<SqlClient.SqlClient["and"]>,
  limit: number,
) =>
  readRows(
    ThreadFromRow,
    sql`
  WITH page AS MATERIALIZED (
    SELECT t.* FROM threads t WHERE ${where}
    ORDER BY ${sql.unsafe(THREAD_ORDER)}
    LIMIT ${limit}
  )
  SELECT ${sql.unsafe(threadColumns("t"))}, ${sql.unsafe(THREAD_SUMMARY)}
  FROM page t
  ORDER BY ${sql.unsafe(THREAD_ORDER)}
`,
  )

export const getSnapshot = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const workspaces = yield* readRows(
    WorkspaceFromRow,
    sql`
    SELECT id, path, name, created_at, last_opened_at
    FROM workspaces
    ORDER BY last_opened_at DESC
  `,
  )
  const threads = yield* threadPage(sql, sql.and([]), SNAPSHOT_THREADS)
  const providers = yield* readRows(
    ProviderFromRow,
    sql`
    SELECT ${sql.unsafe(providerColumns())} FROM providers ORDER BY sort_order, display_name
  `,
  )
  const models = yield* readRows(
    ModelFromRow,
    sql`
    SELECT ${sql.unsafe(modelColumns())} FROM provider_models ORDER BY sort_order, display_name
  `,
  )
  const threadSettings = yield* readRows(
    ThreadSettingsFromRow,
    sql`
    SELECT ${sql.unsafe(threadSettingsColumns())} FROM thread_settings
  `,
  )
  const approvals = yield* readRows(
    ApprovalFromRow,
    sql`
    SELECT id, thread_id, turn_id, request_id, method, title, detail, request_data, created_at
    FROM approvals ORDER BY created_at
  `,
  )
  const settings = yield* readAppSettings

  return {
    workspaces: workspaces,
    threads: threads,
    providers: providers,
    models: models,
    threadSettings: threadSettings,
    approvals: approvals,
    settings,
  } satisfies AppSnapshot
}).pipe(transaction)

/** A page cursor: the last thread's rank, update time, and id, which the next page starts after. */
const pageCursor = (row: Thread): string =>
  `${row.pinned === true ? 0 : row.status === "active" ? 1 : 2}|${row.updatedAt}|${row.id}`

export const listThreads = (input: { readonly cursor?: string; readonly limit?: number }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const limit = Math.max(1, Math.min(SNAPSHOT_THREADS, Math.floor(input.limit ?? 100)))
    const [rank = "0", updatedAt = "9999-12-31T23:59:59.999Z", id = "~"] =
      input.cursor?.split("|") ?? []
    const cursorRank = Number(rank)
    const rankSql = sql.unsafe(threadRank("t"))
    const after =
      input.cursor === undefined
        ? sql.and([])
        : sql.or([
            sql`${rankSql} > ${cursorRank}`,
            sql.and([
              sql`${rankSql} = ${cursorRank}`,
              sql.or([
                sql`t.updated_at < ${updatedAt}`,
                sql.and([sql`t.updated_at = ${updatedAt}`, sql`t.id < ${id}`]),
              ]),
            ]),
          ])
    const rows = yield* threadPage(sql, after, limit + 1)
    const pageRows = rows.slice(0, limit)
    const last = pageRows.at(-1)
    return {
      threads: pageRows,
      nextCursor: rows.length > limit && last !== undefined ? pageCursor(last) : null,
    }
  })
