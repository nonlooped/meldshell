import * as SqlClient from "@effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import {
  ProviderModelCatalogEntry,
  InputAttachment,
  CursorPayload,
  type ApprovalPolicy,
  type CollaborationMode,
  type SandboxMode,
  type SubmitTurnInput,
  type SubmitTurnResult,
  type RuntimeEventInput,
  type RuntimeEventResult,
  type TurnDispatch,
  CoreProtocolError,
  isHarness,
  ProviderConfigurationError,
  supportsMode,
  TurnSubmissionError,
} from "@meldshell/contracts"
import { Effect, Schema } from "effect"
import { appendEvent } from "./database/persistence"
import { transaction } from "./database/transaction"
import {
  DEFAULT_THREAD_TITLE,
  THREAD_TITLE_LIMIT,
  derivedThreadTitle,
  buildTitleRequest,
} from "./titles"
import { getSnapshot } from "./snapshots"
import { isShuttingDown, markShuttingDown, readAppSettings } from "./settings"
import {
  CLAUDE_EXIT_PLAN_MODE,
  CLAUDE_PERMISSION_MODE,
  eventKind,
  eventText,
  approvalCopy,
} from "@meldshell/projection"

interface DispatchRow {
  readonly workspace_path: string
  readonly provider_key: string
  readonly harness: string
  readonly model_slug: string
  readonly model_metadata: string
  readonly model_supports_fast: number
  readonly reasoning_effort: string | null
  readonly speed: "standard" | "fast"
  readonly mode: CollaborationMode
  readonly sandbox: SandboxMode
  readonly approval_policy: ApprovalPolicy
  readonly native_thread_id: string | null
}

const createDispatch = (
  threadId: string,
  text: string,
  attachments: SubmitTurnInput["attachments"] = [],
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<DispatchRow>`
      SELECT COALESCE(t.worktree_path, w.path) AS workspace_path, p.key AS provider_key, p.harness,
             m.slug AS model_slug, m.metadata AS model_metadata,
             m.supports_fast AS model_supports_fast, s.reasoning_effort, s.speed,
             s.mode, s.sandbox, s.approval_policy,
             ps.native_thread_id
      FROM threads t
      JOIN workspaces w ON w.id = t.workspace_id
      JOIN thread_settings s ON s.thread_id = t.id
      JOIN providers p ON p.id = s.provider_id
      JOIN provider_models m ON m.id = s.model_id
      LEFT JOIN provider_sessions ps ON ps.thread_id = t.id AND ps.harness = p.harness
      WHERE t.id = ${threadId} AND p.enabled = 1 AND m.enabled = 1
    `
    const row = rows[0]
    if (row === undefined) {
      return yield* Effect.fail(
        new ProviderConfigurationError({
          threadId,
          message: "This thread has no enabled provider and model.",
        }),
      )
    }
    if (!isHarness(row.harness))
      return yield* Effect.fail(new CoreProtocolError({ message: "Unsupported provider harness." }))
    if (!supportsMode(row.harness, row.mode))
      return yield* Effect.fail(
        new CoreProtocolError({
          message: "This mode is not supported by this provider integration.",
        }),
      )
    const metadata = yield* Schema.decodeUnknown(
      Schema.parseJson(Schema.partial(ProviderModelCatalogEntry)),
    )(row.model_metadata)
    const fastServiceTier = metadata.fastServiceTier
    const serviceTier =
      row.speed === "fast" && row.model_supports_fast === 1
        ? typeof fastServiceTier === "string"
          ? fastServiceTier
          : "fast"
        : "default"

    const { alwaysFullPermissions } = yield* readAppSettings
    const turnId = randomUUID()
    const timestamp = new Date().toISOString()
    yield* sql`
      INSERT INTO turns (
        id, thread_id, provider, harness, model, reasoning_effort, speed,
        status, native_turn_id, started_at, completed_at, error
      ) VALUES (
        ${turnId}, ${threadId}, ${row.provider_key}, ${row.harness}, ${row.model_slug},
        ${row.reasoning_effort}, ${row.speed}, 'running', NULL, ${timestamp}, NULL, NULL
      )
    `
    yield* sql`UPDATE threads SET updated_at = ${timestamp} WHERE id = ${threadId}`
    yield* appendEvent(threadId, turnId, "user", "user/message", text, {
      text,
      attachments,
    })

    return {
      threadId,
      turnId,
      harness: row.harness,
      nativeThreadId: row.native_thread_id,
      workspacePath: row.workspace_path,
      model: row.model_slug,
      reasoningEffort: row.reasoning_effort,
      speed: row.speed,
      serviceTier,
      mode: row.mode,
      sandbox: alwaysFullPermissions ? "danger-full-access" : row.sandbox,
      approvalPolicy: alwaysFullPermissions ? "never" : row.approval_policy,
      text,
      attachments,
    } satisfies TurnDispatch
  })

const queueInput = (
  input: SubmitTurnInput,
  text: string,
  titleRequest: SubmitTurnResult["titleRequest"],
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
        INSERT INTO queued_inputs (thread_id, text, attachments, created_at)
        VALUES (
          ${input.threadId}, ${text}, ${JSON.stringify(input.attachments ?? [])},
          ${new Date().toISOString()}
        )
      `
    return {
      snapshot: yield* getSnapshot,
      disposition: "queued",
      dispatch: null,
      titleRequest,
    } satisfies SubmitTurnResult
  })

/**
 * A thread with its own worktree never falls back to the workspace folder, and does not start work
 * while its setup script is still preparing that folder.
 */
const requireWorktree = (state: string | null, setup: string | null) => {
  if (state !== null && state !== "ready")
    return Effect.fail(
      new CoreProtocolError({
        message:
          state === "removed"
            ? "This thread's worktree was removed. Start a new thread to keep working."
            : "This thread's worktree folder is missing. Restore it or remove the worktree.",
      }),
    )
  if (setup === "running")
    return Effect.fail(
      new CoreProtocolError({
        message: "This thread's setup script is still running. Send again when it finishes.",
      }),
    )
  return Effect.void
}

export const submitTurn = (input: SubmitTurnInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (yield* isShuttingDown)
      return yield* Effect.fail(new CoreProtocolError({ message: "MeldShell is shutting down." }))
    const text = input.text.trim()
    if (text === "" && (input.attachments?.length ?? 0) === 0) {
      return yield* Effect.fail(
        new TurnSubmissionError({
          reason: "empty",
          message: "A turn needs text or an attachment.",
        }),
      )
    }

    const threads = yield* sql<{
      readonly title_locked: number
      readonly worktree_state: string | null
      readonly worktree_setup: string | null
    }>`
      SELECT title_locked, worktree_state, worktree_setup FROM threads WHERE id = ${input.threadId}
    `
    yield* requireWorktree(threads[0]?.worktree_state ?? null, threads[0]?.worktree_setup ?? null)
    // New work returns an archived thread to the inbox, so its result is not filed away unseen.
    yield* sql`UPDATE threads SET status = 'active' WHERE id = ${input.threadId} AND status = 'settled'`
    const unnamed = threads[0]?.title_locked === 0 && text !== ""
    if (unnamed) {
      const derivedTitle = derivedThreadTitle(text)
      if (derivedTitle !== "") {
        yield* sql`
          UPDATE threads SET title = ${derivedTitle}
          WHERE id = ${input.threadId} AND title = ${DEFAULT_THREAD_TITLE}
        `
      }
    }
    const titleRequest = unnamed ? yield* buildTitleRequest(input.threadId, text) : null
    if (titleRequest !== null) {
      // The lock is taken when the attempt starts, not when it lands: a title model that is down
      // would otherwise cost an extra turn on every message the thread ever sends.
      yield* sql`UPDATE threads SET title_locked = 1 WHERE id = ${input.threadId}`
    }
    const running = yield* sql<{ readonly id: string; readonly harness: string }>`
      SELECT id, harness FROM turns WHERE thread_id = ${input.threadId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) {
      return yield* queueInput(input, text, titleRequest)
    }

    const dispatch = yield* createDispatch(input.threadId, text, input.attachments)
    return {
      snapshot: yield* getSnapshot,
      disposition: "started",
      dispatch,
      titleRequest,
    } satisfies SubmitTurnResult
  }).pipe(transaction)

const promoteQueue = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (yield* isShuttingDown) return null
    const queued = yield* sql<{
      readonly id: number
      readonly text: string
      readonly attachments: string
    }>`
      SELECT id, text, attachments FROM queued_inputs
      WHERE thread_id = ${threadId} ORDER BY id
    `
    if (queued.length === 0) return null
    const text = queued
      .map((entry) => entry.text)
      .filter(Boolean)
      .join("\n\n")
    const decodedAttachments = yield* Effect.forEach(queued, (entry) =>
      Schema.decodeUnknown(Schema.parseJson(Schema.Array(InputAttachment)))(entry.attachments),
    )
    const attachments = decodedAttachments.flat()
    const dispatch = yield* createDispatch(threadId, text, attachments)
    yield* sql`DELETE FROM queued_inputs WHERE thread_id = ${threadId}`
    return dispatch
  })

export const recordRuntimeEvent = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const active = yield* sql<{
      native_turn_id: string | null
      worker_generation: string | null
    }>`SELECT native_turn_id, worker_generation FROM turns WHERE id = ${input.turnId} AND thread_id = ${input.threadId} AND status = 'running'`
    if (
      active.length === 0 ||
      (input.generation !== undefined && active[0]!.worker_generation !== input.generation) ||
      (active[0]!.native_turn_id !== null &&
        input.nativeTurnId !== undefined &&
        active[0]!.native_turn_id !== input.nativeTurnId)
    )
      return { changed: false, nextDispatch: null } satisfies RuntimeEventResult
    if (input.validated !== true) {
      yield* appendEvent(input.threadId, input.turnId, "unknown", input.method, null, input.params)
      return { changed: true, nextDispatch: null } satisfies RuntimeEventResult
    }
    if (input.nativeTurnId !== undefined) {
      yield* sql`
        UPDATE turns SET native_turn_id = ${input.nativeTurnId}
        WHERE id = ${input.turnId}
      `
    }

    const kind = eventKind(input.method, input.params)
    yield* appendEvent(
      input.threadId,
      input.turnId,
      kind,
      input.method,
      eventText(input.method, input.params),
      input.params,
    )

    yield* updateThreadName(input)

    yield* updateClaudeMode(input)

    yield* updateCursorMode(input)

    yield* persistApproval(input)

    yield* clearApproval(input)

    const nextDispatch = input.method === "turn/completed" ? yield* finishTurn(input) : null

    return { changed: true, nextDispatch } satisfies RuntimeEventResult
  }).pipe(transaction)

export const resolveApproval = (approvalId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM approvals WHERE id = ${approvalId}`
    return yield* getSnapshot
  })

/** The harness of the turn that raised an approval, independent of later model selection. */
export const getApprovalHarness = (approvalId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ readonly harness: string }>`
      SELECT t.harness FROM approvals a JOIN turns t ON t.id = a.turn_id WHERE a.id = ${approvalId}
    `
    return rows[0]?.harness ?? null
  })

export const interruptTurn = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{
      readonly id: string
      readonly harness: string
      readonly worker_generation: string | null
      readonly native_turn_id: string | null
      readonly native_thread_id: string | null
    }>`
      SELECT t.id, t.harness, t.worker_generation, t.native_turn_id,
             COALESCE(ps.native_thread_id, CASE WHEN t.harness IN ('claude-code', 'cursor') THEN t.id END) AS native_thread_id
      FROM turns t
      LEFT JOIN provider_sessions ps ON ps.thread_id = t.thread_id AND ps.harness = t.harness
      WHERE t.thread_id = ${threadId} AND t.status = 'running' LIMIT 1
    `
    return rows[0] ?? null
  })

export const getActiveTurnCount = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ readonly count: number }>`
    SELECT COUNT(*) AS count FROM turns WHERE status = 'running'
  `
  return Number(rows[0]?.count ?? 0)
})

export const beginShutdown = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* markShuttingDown
  return yield* sql<{
    threadId: string
    turnId: string
    harness: string
    nativeThreadId: string | null
    nativeTurnId: string | null
  }>`
    SELECT t.thread_id AS threadId, t.id AS turnId, t.harness, COALESCE(ps.native_thread_id, CASE WHEN t.harness IN ('claude-code', 'cursor') THEN t.id END) AS nativeThreadId, t.native_turn_id AS nativeTurnId
    FROM turns t LEFT JOIN provider_sessions ps ON ps.thread_id = t.thread_id AND ps.harness = t.harness WHERE t.status = 'running'`
}).pipe(transaction)

export const bindTurnWorker = (turnId: string, generation: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows =
      yield* sql`UPDATE turns SET worker_generation = ${generation} WHERE id = ${turnId} AND status = 'running' AND worker_generation IS NULL RETURNING id`
    if (rows.length !== 1)
      return yield* Effect.fail(
        new CoreProtocolError({
          message: "This turn has already been delivered or settled. Retry with a new turn.",
        }),
      )
  })

export const reconcileWorker = (generation: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{
      thread_id: string
      id: string
    }>`SELECT thread_id, id FROM turns WHERE worker_generation = ${generation} AND status = 'running'`
    for (const row of rows)
      yield* recordRuntimeEvent({
        threadId: row.thread_id,
        turnId: row.id,
        validated: true,
        method: "turn/completed",
        params: {
          turn: { status: "failed", error: "Provider worker disconnected. Retry explicitly." },
        },
        promoteQueue: false,
      })
  }).pipe(transaction)

export const finishShutdown = Effect.gen(function* () {
  const turns = yield* beginShutdown
  for (const turn of turns)
    yield* recordRuntimeEvent({
      threadId: turn.threadId,
      turnId: turn.turnId,
      validated: true,
      method: "turn/completed",
      params: { turn: { status: "interrupted", error: "MeldShell shut down." } },
      promoteQueue: false,
    })
}).pipe(transaction)

const updateThreadName = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.method === "thread/name/updated") {
      const params = yield* Schema.decodeUnknown(
        Schema.Struct({ threadName: Schema.optional(Schema.String) }),
      )(input.params)
      if (typeof params.threadName === "string" && params.threadName.trim() !== "") {
        yield* sql`
          UPDATE threads SET title = ${params.threadName.trim().slice(0, THREAD_TITLE_LIMIT)}
          WHERE id = ${input.threadId} AND title_locked = 0
        `
      }
    }
  })

/** An approved plan takes Claude out of plan mode, so the thread's next turn starts working. */
const updateClaudeMode = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.method !== CLAUDE_PERMISSION_MODE) return
    const { permissionMode: mode } = yield* Schema.decodeUnknown(
      Schema.Struct({ permissionMode: Schema.optional(Schema.String) }),
    )(input.params)
    if (typeof mode === "string" && mode !== "plan")
      yield* sql`UPDATE thread_settings SET mode = 'default'
        WHERE thread_id = ${input.threadId} AND provider_id IN (SELECT id FROM providers WHERE harness = 'claude-code')`
  })

const updateCursorMode = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.method === "cursor/acp/session/update") {
      const { update } = yield* Schema.decodeUnknown(CursorPayload)(input.params)
      const nativeMode =
        update?.sessionUpdate === "current_mode_update"
          ? update.currentModeId
          : update?.sessionUpdate === "config_option_update"
            ? update.configOptions?.find(
                (option) => option && (option.category === "mode" || option.id === "mode"),
              )?.currentValue
            : undefined
      if (nativeMode === "agent" || nativeMode === "plan" || nativeMode === "ask") {
        yield* sql`UPDATE thread_settings SET mode = ${nativeMode === "agent" ? "default" : nativeMode}
          WHERE thread_id = ${input.threadId} AND provider_id IN (SELECT id FROM providers WHERE harness = 'cursor')`
      }
    }
  })

const persistApproval = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (
      input.requestId !== undefined &&
      [
        "item/commandExecution/requestApproval",
        "item/fileChange/requestApproval",
        "item/tool/requestUserInput",
        "item/permissions/requestApproval",
        "cursor/acp/session/request_permission",
        "cursor/ask_question",
        "cursor/ask_user_question",
        "cursor/create_plan",
        CLAUDE_EXIT_PLAN_MODE,
      ].includes(input.method)
    ) {
      const copy = approvalCopy(input.method, input.params)
      yield* sql`
        INSERT INTO approvals (
          id, thread_id, turn_id, request_id, method, title, detail, request_data, created_at
        ) VALUES (
          ${randomUUID()}, ${input.threadId}, ${input.turnId}, ${String(input.requestId)},
          ${input.method}, ${copy.title}, ${copy.detail}, ${JSON.stringify(input.params)}, ${new Date().toISOString()}
        ) ON CONFLICT(request_id) DO NOTHING
      `
    }
  })

const clearApproval = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.method === "serverRequest/resolved") {
      const params = yield* Schema.decodeUnknown(
        Schema.Struct({ requestId: Schema.optional(Schema.Union(Schema.String, Schema.Number)) }),
      )(input.params)
      if (typeof params.requestId === "string" || typeof params.requestId === "number")
        yield* sql`DELETE FROM approvals WHERE turn_id = ${input.turnId} AND request_id = ${String(params.requestId)}`
    }
  })

const finishTurn = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    let nextDispatch: TurnDispatch | null = null

    const params = yield* Schema.decodeUnknown(
      Schema.Struct({
        turn: Schema.optional(
          Schema.Struct({
            status: Schema.optional(Schema.String),
            error: Schema.optional(Schema.Unknown),
          }),
        ),
      }),
    )(input.params)
    const nativeStatus = String(params.turn?.status)
    if (!["completed", "interrupted", "failed"].includes(nativeStatus)) return null
    const status = nativeStatus
    const error =
      params.turn?.error === undefined || params.turn.error === null
        ? null
        : JSON.stringify(params.turn.error)
    const timestamp = new Date().toISOString()
    yield* sql`
        UPDATE turns SET status = ${status}, completed_at = ${timestamp}, error = ${error}
        WHERE id = ${input.turnId} AND status = 'running'
      `
    yield* sql`DELETE FROM approvals WHERE turn_id = ${input.turnId}`
    yield* sql`UPDATE threads SET updated_at = ${timestamp} WHERE id = ${input.threadId}`
    if (input.promoteQueue !== false && status === "completed")
      nextDispatch = yield* promoteQueue(input.threadId).pipe(
        transaction,
        Effect.catchAll((cause) =>
          appendEvent(input.threadId, input.turnId, "error", "queue/error", cause.message, {
            error: { message: `Queued messages could not start: ${cause.message}` },
          }).pipe(Effect.as(null)),
        ),
      )

    return nextDispatch
  })
