import * as SqlClient from "effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import {
  CoreProtocolError,
  defaultReasoningEffort,
  HARNESSES,
  isCliHarness,
  type CliHarness,
  type ImportedCliSession,
  type RecordCliSessionInput,
  type ResumableSession,
} from "@meldshell/contracts"
import { eventKind, eventText } from "@meldshell/projection"
import { Effect, Schema } from "effect"
import { appendEvent } from "./database/persistence"
import { fromProviderModelRow, modelColumns, ProviderModelRow, readRows } from "./database/rows"
import { transaction } from "./database/transaction"
import { getSnapshot } from "./snapshots"
import { setProviderSession } from "./threads"

/*
 * A session started in a harness's own CLI becomes a thread whose turns replay what the CLI stored,
 * bound to that session so the thread's next turn continues it rather than starting over.
 */

const TITLE_LIMIT = 100

const SelectedModelRow = Schema.Struct({
  ...ProviderModelRow.fields,
  provider_key: Schema.String,
})

/** The thread already holding a session, so it is opened instead of imported twice. */
const sessionThread = (harness: CliHarness, nativeThreadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly thread_id: string }>`
      SELECT thread_id FROM provider_sessions
      WHERE harness = ${harness} AND native_thread_id = ${nativeThreadId}
      LIMIT 1
    `
    return row?.thread_id ?? null
  })

/** The threads holding any of these sessions, keyed by session. */
export const findSessionThreads = (harness: CliHarness, nativeThreadIds: readonly string[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (nativeThreadIds.length === 0) return []
    const rows = yield* sql<{ readonly native_thread_id: string; readonly thread_id: string }>`
      SELECT native_thread_id, thread_id FROM provider_sessions
      WHERE harness = ${harness} AND native_thread_id IN ${sql.in([...nativeThreadIds])}
    `
    return rows.map((row) => ({ nativeThreadId: row.native_thread_id, threadId: row.thread_id }))
  })

/** The session's own model when MeldShell offers it, else the harness's default model. */
const importModel = (harness: CliHarness, slug: string | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* readRows(
      SelectedModelRow,
      sql`
      SELECT ${sql.unsafe(modelColumns("m"))}, p.key AS provider_key
      FROM provider_models m
      JOIN providers p ON p.id = m.provider_id
      WHERE p.harness = ${harness} AND p.enabled = 1 AND m.enabled = 1
      ORDER BY p.sort_order, m.hidden, m.sort_order
    `,
    )
    const row =
      rows.find((candidate) => slug !== null && candidate.slug === slug) ??
      rows.find((candidate) => fromProviderModelRow(candidate).isDefault) ??
      rows[0]
    if (row === undefined)
      return yield* Effect.fail(
        new CoreProtocolError({
          message: `Turn on ${HARNESSES[harness].label} in Settings to bring in its sessions.`,
        }),
      )
    return { model: fromProviderModelRow(row), providerKey: row.provider_key }
  })

const clipTitle = (title: string): string => {
  const line = title.replace(/\s+/g, " ").trim()
  return line.length <= TITLE_LIMIT ? line : `${line.slice(0, TITLE_LIMIT - 1).trimEnd()}…`
}

export const importCliSession = (input: RecordCliSessionInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const existing = yield* sessionThread(input.harness, input.nativeThreadId)
    if (existing !== null)
      return { snapshot: yield* getSnapshot, threadId: existing } satisfies ImportedCliSession
    const { turns } = input.history
    const latestModel = turns.findLast((turn) => turn.model !== null)?.model ?? null
    const { model, providerKey } = yield* importModel(input.harness, latestModel)
    const threadId = randomUUID()
    const timestamp = new Date().toISOString()
    const createdAt = turns[0]?.startedAt ?? timestamp
    yield* sql`
      INSERT INTO threads (
        id, workspace_id, title, status, created_at, updated_at, title_locked, title_manual
      ) VALUES (
        ${threadId}, ${input.workspaceId}, ${clipTitle(input.history.title) || HARNESSES[input.harness].label},
        'active', ${createdAt}, ${timestamp}, 1, 0
      )
    `
    yield* sql`
      INSERT INTO thread_settings (
        thread_id, provider_id, model_id, reasoning_effort, speed, mode, sandbox, approval_policy
      ) VALUES (
        ${threadId}, ${model.providerId}, ${model.id},
        ${defaultReasoningEffort(model.reasoningEfforts, model.defaultReasoningEffort)},
        'standard', 'default', 'workspace-write', 'on-request'
      )
    `
    yield* sql`UPDATE workspaces SET last_opened_at = ${timestamp} WHERE id = ${input.workspaceId}`
    for (const turn of turns) {
      const turnId = randomUUID()
      yield* sql`
        INSERT INTO turns (
          id, thread_id, provider, harness, model, reasoning_effort, speed,
          status, native_turn_id, started_at, completed_at, error
        ) VALUES (
          ${turnId}, ${threadId}, ${providerKey}, ${input.harness}, ${turn.model ?? model.slug},
          NULL, 'standard', ${turn.status}, NULL, ${turn.startedAt}, ${turn.completedAt}, NULL
        )
      `
      if (turn.text !== "")
        yield* appendEvent(
          threadId,
          turnId,
          "user",
          "user/message",
          turn.text,
          { text: turn.text, attachments: [], imported: input.harness },
          turn.startedAt,
        )
      for (const event of turn.events)
        yield* appendEvent(
          threadId,
          turnId,
          eventKind(event.method, event.params),
          event.method,
          eventText(event.method, event.params),
          event.params,
          event.createdAt,
        )
    }
    yield* setProviderSession(threadId, input.nativeThreadId, input.harness)
    return { snapshot: yield* getSnapshot, threadId } satisfies ImportedCliSession
  }).pipe(transaction)

/**
 * The session a thread's CLI would continue: the one its latest turn ran in. Null when that turn
 * ran on a harness without a CLI to hand over to, or its session was set aside by a rewind.
 */
export const resumableSession = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly harness: string; readonly native_thread_id: string }>`
      SELECT s.harness, s.native_thread_id FROM provider_sessions s
      WHERE s.thread_id = ${threadId} AND s.harness = (
        SELECT r.harness FROM turns r WHERE r.thread_id = ${threadId} AND r.rewound_at IS NULL
        ORDER BY r.started_at DESC, r.rowid DESC LIMIT 1
      )
    `
    if (row === undefined || !isCliHarness(row.harness)) return null
    return { harness: row.harness, nativeThreadId: row.native_thread_id } satisfies ResumableSession
  })
