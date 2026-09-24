import * as SqlClient from "@effect/sql/SqlClient"
import { threadActivitySql } from "./thread-activity"
import type { AppSnapshot } from "@meldshell/contracts"
import { Effect } from "effect"
import {
  type WorkspaceRow,
  type ThreadRow,
  type ApprovalRow,
  type ProviderRow,
  type ProviderModelRow,
  type ThreadSettingsRow,
  fromWorkspaceRow,
  fromThreadRow,
  fromApprovalRow,
  fromProviderRow,
  fromProviderModelRow,
  fromThreadSettingsRow,
} from "./database/rows"

import { readAppSettings } from "./settings"

export const getSnapshot = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const workspaces = yield* sql<WorkspaceRow>`
      SELECT id, path, name, created_at, last_opened_at
      FROM workspaces
      ORDER BY last_opened_at DESC
    `
  const threads = yield* sql<ThreadRow>`
      WITH page AS MATERIALIZED (
        SELECT * FROM threads
        ORDER BY CASE WHEN pinned = 1 THEN 0 WHEN status = 'active' THEN 1 ELSE 2 END, updated_at DESC, id DESC
        LIMIT 250
      )
      SELECT t.id, t.workspace_id, t.title, t.status, t.pinned, t.created_at, t.updated_at,
        t.worktree_path, t.worktree_branch, t.worktree_base, t.worktree_state,
        ${sql.unsafe(threadActivitySql)} AS activity,
        (SELECT COUNT(*) FROM queued_inputs q WHERE q.thread_id = t.id) AS queued_count,
        (SELECT COUNT(*) FROM turns r WHERE r.thread_id = t.id) AS turn_count
      FROM page t
      ORDER BY CASE WHEN t.pinned = 1 THEN 0 WHEN t.status = 'active' THEN 1 ELSE 2 END, t.updated_at DESC, t.id DESC
    `
  const providers = yield* sql<ProviderRow>`
      SELECT id, key, harness, display_name, enabled, sort_order, built_in
      FROM providers
      ORDER BY sort_order, display_name
    `
  const models = yield* sql<ProviderModelRow>`
      SELECT id, provider_id, slug, display_name, reasoning_efforts, metadata,
             supports_fast, enabled, hidden, sort_order, built_in
      FROM provider_models
      ORDER BY sort_order, display_name
    `
  const threadSettings = yield* sql<ThreadSettingsRow>`
      SELECT thread_id, provider_id, model_id, reasoning_effort, speed,
             mode, sandbox, approval_policy
      FROM thread_settings
    `
  const approvals = yield* sql<ApprovalRow>`
      SELECT id, thread_id, turn_id, request_id, method, title, detail, request_data, created_at
      FROM approvals ORDER BY created_at
    `
  const settings = yield* readAppSettings

  return {
    workspaces: workspaces.map(fromWorkspaceRow),
    threads: threads.map(fromThreadRow),
    providers: providers.map(fromProviderRow),
    models: models.map(fromProviderModelRow),
    threadSettings: threadSettings.map(fromThreadSettingsRow),
    approvals: approvals.map(fromApprovalRow),
    settings,
  } satisfies AppSnapshot
}).pipe((effect) => Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(effect)))

export const listThreads = (input: { readonly cursor?: string; readonly limit?: number }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const limit = Math.max(1, Math.min(250, Math.floor(input.limit ?? 100)))
    const parts = input.cursor?.split("|") ?? []
    const cursorRank = Number(parts[0] ?? 0)
    const cursorUpdatedAt = parts[1] ?? "9999-12-31T23:59:59.999Z"
    const cursorId = parts[2] ?? "~"
    const hasCursor = input.cursor !== undefined
    const rows = yield* sql<ThreadRow>`
      WITH page AS MATERIALIZED (
      SELECT t.* FROM threads t
      WHERE ${hasCursor ? 1 : 0} = 0
        OR CASE WHEN t.pinned = 1 THEN 0 WHEN t.status = 'active' THEN 1 ELSE 2 END > ${cursorRank}
        OR (
          CASE WHEN t.pinned = 1 THEN 0 WHEN t.status = 'active' THEN 1 ELSE 2 END = ${cursorRank}
          AND (t.updated_at < ${cursorUpdatedAt}
            OR (t.updated_at = ${cursorUpdatedAt} AND t.id < ${cursorId}))
        )
      ORDER BY CASE WHEN t.pinned = 1 THEN 0 WHEN t.status = 'active' THEN 1 ELSE 2 END, t.updated_at DESC, t.id DESC
      LIMIT ${limit + 1}
      )
      SELECT t.id, t.workspace_id, t.title, t.status, t.pinned, t.created_at, t.updated_at,
        t.worktree_path, t.worktree_branch, t.worktree_base, t.worktree_state,
        ${sql.unsafe(threadActivitySql)} AS activity,
        (SELECT COUNT(*) FROM queued_inputs q WHERE q.thread_id = t.id) AS queued_count,
        (SELECT COUNT(*) FROM turns r WHERE r.thread_id = t.id) AS turn_count
      FROM page t
      ORDER BY CASE WHEN t.pinned = 1 THEN 0 WHEN t.status = 'active' THEN 1 ELSE 2 END, t.updated_at DESC, t.id DESC
    `
    const pageRows = rows.slice(0, limit)
    const last = pageRows.at(-1)
    return {
      threads: pageRows.map(fromThreadRow),
      nextCursor:
        rows.length > limit && last !== undefined
          ? `${last.pinned === 1 ? 0 : last.status === "active" ? 1 : 2}|${last.updated_at}|${last.id}`
          : null,
    }
  })
