import * as SqlClient from "@effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import {
  type CreateThreadInput,
  type ProviderModel,
  type ReasoningEffort,
  type Thread,
  CoreProtocolError,
  defaultReasoningEffort,
} from "@meldshell/contracts"
import { Effect } from "effect"
import { transaction } from "./database/persistence"
import { type ProviderModelRow, fromProviderModelRow } from "./database/rows"
import { DEFAULT_THREAD_TITLE, resolveThreadTitle } from "./titles"
import { defaultSelection } from "./catalog"
import { getSnapshot } from "./snapshots"

interface RecentSelectionRow extends ProviderModelRow {
  readonly last_reasoning_effort: string | null
  readonly last_speed: "standard" | "fast"
}

interface NewThreadSelection {
  readonly model: ProviderModel
  readonly reasoningEffort: ReasoningEffort | null
  readonly speed: "standard" | "fast"
}

const selectionForNewThread = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const recent = yield* sql<RecentSelectionRow>`
    SELECT m.id, m.provider_id, m.slug, m.display_name, m.reasoning_efforts, m.metadata,
           m.supports_fast, m.enabled, m.hidden, m.sort_order, m.built_in,
           t.reasoning_effort AS last_reasoning_effort, t.speed AS last_speed
    FROM turns t
    JOIN providers p ON p.key = t.provider AND p.harness = t.harness
    JOIN provider_models m ON m.provider_id = p.id AND m.slug = t.model
    WHERE p.enabled = 1 AND m.enabled = 1
    ORDER BY t.started_at DESC, t.rowid DESC
    LIMIT 1
  `
  const row = recent[0]
  if (row !== undefined) {
    const model = fromProviderModelRow(row)
    return {
      model,
      reasoningEffort:
        row.last_reasoning_effort !== null &&
        model.reasoningEfforts.includes(row.last_reasoning_effort)
          ? row.last_reasoning_effort
          : defaultReasoningEffort(model.reasoningEfforts, model.defaultReasoningEffort),
      speed: row.last_speed === "fast" && !model.supportsFast ? "standard" : row.last_speed,
    } satisfies NewThreadSelection
  }

  const model = yield* defaultSelection
  return model === null
    ? null
    : ({
        model,
        reasoningEffort: defaultReasoningEffort(
          model.reasoningEfforts,
          model.defaultReasoningEffort,
        ),
        speed: "standard",
      } satisfies NewThreadSelection)
})

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
    const selection = yield* selectionForNewThread

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
              ${threadId}, ${selection.model.providerId}, ${selection.model.id},
              ${selection.reasoningEffort}, ${selection.speed},
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
