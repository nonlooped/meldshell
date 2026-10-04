import * as SqlClient from "effect/sql/SqlClient"
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
  type QueuedInputContent,
  type RuntimeEventInput,
  type RuntimeEventResult,
  type TurnDispatch,
  type OpenProviderTurnInput,
  CoreProtocolError,
  HARNESSES,
  isHarness,
  ProviderConfigurationError,
  supportsMode,
  TurnSubmissionError,
} from "@meldshell/contracts"
import { Effect, Schema, Struct } from "effect"
import { appendEvent } from "./database/persistence"
import { transaction } from "./database/transaction"
import { EventFromRow, readRows } from "./database/rows"
import { buildHandoff, buildSideQuestionPrompt } from "./handoff"
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
  PI_EXTENSION_UI_REQUEST,
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
    const metadata = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ProviderModelCatalogEntry.mapFields(Struct.map(Schema.optional))),
    )(row.model_metadata)
    const fastServiceTier = metadata.fastServiceTier
    const serviceTier =
      row.speed === "fast" && row.model_supports_fast === 1
        ? typeof fastServiceTier === "string"
          ? fastServiceTier
          : "fast"
        : "default"

    const { alwaysFullPermissions } = yield* readAppSettings
    const handoff = yield* missedWork(threadId, row.harness, row.native_thread_id !== null)
    const issue = yield* issueContext(threadId)
    // New work makes the latest rewind permanent: its turns stay out of the conversation.
    yield* sql`DELETE FROM thread_rewinds WHERE thread_id = ${threadId}`
    // So does a fork's first turn: the summary of the turns it copied has been sent.
    yield* sql`UPDATE threads SET fork_fresh = 0 WHERE id = ${threadId} AND fork_fresh = 1`
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
      ...(handoff === null ? {} : { handoff }),
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
      context: [issue, handoff?.brief].filter(Boolean).join("\n\n") || null,
    } satisfies TurnDispatch
  })

/**
 * A thread started from an issue opens its conversation with the issue's text. Only the first turn
 * still in the conversation carries it, so a rewind to the start sends it again.
 */
const issueContext = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly issue_context: string | null }>`
      SELECT issue_context FROM threads t
      WHERE t.id = ${threadId} AND NOT EXISTS (
        SELECT 1 FROM turns r WHERE r.thread_id = t.id AND r.rewound_at IS NULL
      )
    `
    return row?.issue_context ?? null
  })

/** The summary the thread's next turn would carry on its selected harness, if any. */
export const previewHandoff = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly harness: string
      readonly native_thread_id: string | null
    }>`
      SELECT p.harness, ps.native_thread_id
      FROM thread_settings s
      JOIN providers p ON p.id = s.provider_id
      LEFT JOIN provider_sessions ps ON ps.thread_id = s.thread_id AND ps.harness = p.harness
      WHERE s.thread_id = ${threadId}
    `
    if (row === undefined) return null
    return yield* missedWork(threadId, row.harness, row.native_thread_id !== null)
  })

/**
 * The turns a harness's provider session has not seen, summarized. A session has seen everything
 * up to its own latest turn; without a session, which a rewind also clears and a fork never has,
 * it has seen nothing.
 */
const missedWork = (threadId: string, harness: string, hasSession: boolean) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const turns = yield* sql<{
      readonly id: string
      readonly harness: string
      readonly status: string
    }>`
      SELECT id, harness, status FROM turns
      WHERE thread_id = ${threadId} AND rewound_at IS NULL
      ORDER BY started_at, rowid
    `
    const missed = hasSession
      ? turns.slice(turns.findLastIndex((turn) => turn.harness === harness) + 1)
      : turns
    if (missed.length === 0) return null
    // A fork's first session reads the copied turns as the conversation it branched from.
    const [fork] = hasSession
      ? []
      : yield* sql<{ readonly fork_title: string }>`
          SELECT fork_title FROM threads WHERE id = ${threadId} AND fork_fresh = 1
        `
    const events = yield* readRows(
      EventFromRow,
      sql`SELECT * FROM events WHERE thread_id = ${threadId}
        AND turn_id IN ${sql.in(missed.map((turn) => turn.id))} ORDER BY sequence`,
    )
    return buildHandoff(
      harness,
      missed.map((turn) => ({
        ...turn,
        events: events.filter((event) => event.turnId === turn.id),
      })),
      fork?.fork_title ?? null,
    )
  })

/**
 * The prompt that answers a side question about a thread: every turn still in its conversation,
 * including one that is running, written out for a separate request the agent never sees.
 */
export const sideQuestionPrompt = (threadId: string, question: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [thread] = yield* sql<{ readonly harness: string | null }>`
      SELECT p.harness FROM threads t
      LEFT JOIN thread_settings s ON s.thread_id = t.id
      LEFT JOIN providers p ON p.id = s.provider_id
      WHERE t.id = ${threadId}
    `
    if (thread === undefined)
      return yield* Effect.fail(new CoreProtocolError({ message: "Thread not found." }))
    const turns = yield* sql<{
      readonly id: string
      readonly harness: string
      readonly status: string
    }>`
      SELECT id, harness, status FROM turns
      WHERE thread_id = ${threadId} AND rewound_at IS NULL
      ORDER BY started_at, rowid
    `
    const events =
      turns.length === 0
        ? []
        : yield* readRows(
            EventFromRow,
            sql`SELECT * FROM events WHERE thread_id = ${threadId}
              AND turn_id IN ${sql.in(turns.map((turn) => turn.id))} ORDER BY sequence`,
          )
    return buildSideQuestionPrompt(
      thread.harness ?? turns.at(-1)?.harness ?? "",
      turns.map((turn) => ({
        ...turn,
        events: events.filter((event) => event.turnId === turn.id),
      })),
      question,
    )
  })

const queueInput = (
  input: SubmitTurnInput,
  text: string,
  titleRequest: SubmitTurnResult["titleRequest"],
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly id: number }>`
        INSERT INTO queued_inputs (thread_id, text, attachments, steer, created_at)
        VALUES (
          ${input.threadId}, ${text}, ${JSON.stringify(input.attachments ?? [])},
          ${input.delivery === "steer" ? 1 : 0}, ${new Date().toISOString()}
        )
        RETURNING id
      `
    return {
      snapshot: yield* getSnapshot,
      disposition: "queued",
      dispatch: null,
      titleRequest,
      queuedInputId: row!.id,
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

/** Starts the next queued follow-up on its own turn; steering ones go first, then oldest first. */
const promoteQueue = (threadId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (yield* isShuttingDown) return null
    const [next] = yield* sql<{
      readonly id: number
      readonly text: string
      readonly attachments: string
    }>`
      SELECT id, text, attachments FROM queued_inputs
      WHERE thread_id = ${threadId} ORDER BY steer DESC, id LIMIT 1
    `
    if (next === undefined) return null
    const attachments = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Array(InputAttachment)),
    )(next.attachments)
    const dispatch = yield* createDispatch(threadId, next.text, attachments)
    yield* sql`DELETE FROM queued_inputs WHERE id = ${next.id}`
    return dispatch
  })

export const getQueuedInput = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly thread_id: string
      readonly text: string
      readonly attachments: string
    }>`SELECT thread_id, text, attachments FROM queued_inputs WHERE id = ${id}`
    if (row === undefined) return null
    return {
      threadId: row.thread_id,
      text: row.text,
      attachments: yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Array(InputAttachment)),
      )(row.attachments),
    } satisfies QueuedInputContent
  })

export const removeQueuedInput = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{
      readonly thread_id: string
    }>`DELETE FROM queued_inputs WHERE id = ${id} RETURNING thread_id`
    return row?.thread_id ?? null
  })

/** Moves a follow-up ahead of the queue and lets it start as soon as the running turn ends. */
export const prioritizeQueuedInput = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE queued_inputs SET steer = 1 WHERE id = ${id}`
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
      return {
        changed: false,
        snapshotChanged: false,
        nextDispatch: null,
      } satisfies RuntimeEventResult
    if (input.validated !== true) {
      yield* appendEvent(input.threadId, input.turnId, "unknown", input.method, null, input.params)
      return {
        changed: true,
        snapshotChanged: false,
        nextDispatch: null,
      } satisfies RuntimeEventResult
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

    // Most mid-turn events only extend the transcript; these writes also change the app snapshot.
    const renamed = yield* updateThreadName(input)
    const claudeMode = yield* updateClaudeMode(input)
    const cursorMode = yield* updateCursorMode(input)
    const approvalAdded = yield* persistApproval(input)
    const approvalCleared = yield* clearApproval(input)
    const finished = input.method === "turn/completed"
    const nextDispatch = finished ? yield* finishTurn(input) : null

    return {
      changed: true,
      snapshotChanged:
        renamed || claudeMode || cursorMode || approvalAdded || approvalCleared || finished,
      nextDispatch,
    } satisfies RuntimeEventResult
  }).pipe(transaction)

export const resolveApproval = (approvalId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM approvals WHERE id = ${approvalId}`
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
             COALESCE(ps.native_thread_id, CASE WHEN t.harness IN ('claude-code', 'cursor', 'pi') THEN t.id END) AS native_thread_id
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
    SELECT t.thread_id AS threadId, t.id AS turnId, t.harness, COALESCE(ps.native_thread_id, CASE WHEN t.harness IN ('claude-code', 'cursor', 'pi') THEN t.id END) AS nativeThreadId, t.native_turn_id AS nativeTurnId
    FROM turns t LEFT JOIN provider_sessions ps ON ps.thread_id = t.thread_id AND ps.harness = t.harness WHERE t.status = 'running'`
}).pipe(transaction)

/**
 * Records a turn the harness started on its own, such as a run a Pi extension began. It is bound
 * to the reporting worker from the start, so that worker's events land in it and its exit
 * settles it. A thread that is already running keeps its turn; the harness's work is not recorded.
 */
export const openProviderTurn = (input: OpenProviderTurnInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (yield* isShuttingDown) return false
    const threads = yield* sql`
      SELECT t.id FROM threads t
      JOIN thread_settings s ON s.thread_id = t.id
      JOIN providers p ON p.id = s.provider_id
      WHERE t.id = ${input.threadId} AND p.harness = ${input.harness} AND p.enabled = 1
    `
    const running = yield* sql`
      SELECT id FROM turns WHERE thread_id = ${input.threadId} AND status = 'running' LIMIT 1
    `
    if (threads.length === 0 || running.length > 0) return false
    yield* sql`DELETE FROM thread_rewinds WHERE thread_id = ${input.threadId}`
    const timestamp = new Date().toISOString()
    yield* sql`
      INSERT INTO turns (
        id, thread_id, provider, harness, model, reasoning_effort, speed,
        status, native_turn_id, worker_generation, started_at, completed_at, error
      ) VALUES (
        ${input.turnId}, ${input.threadId}, ${HARNESSES[input.harness].provider}, ${input.harness},
        ${input.model}, NULL, 'standard', 'running', ${input.turnId}, ${input.generation},
        ${timestamp}, NULL, NULL
      )
    `
    // New work returns an archived thread to the inbox, as a submitted turn does.
    yield* sql`
      UPDATE threads SET updated_at = ${timestamp},
        status = CASE WHEN status = 'settled' THEN 'active' ELSE status END
      WHERE id = ${input.threadId}
    `
    return true
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
      const params = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ threadName: Schema.optional(Schema.String) }),
      )(input.params)
      if (typeof params.threadName === "string" && params.threadName.trim() !== "") {
        const rows = yield* sql`
          UPDATE threads SET title = ${params.threadName.trim().slice(0, THREAD_TITLE_LIMIT)}
          WHERE id = ${input.threadId} AND title_locked = 0
          RETURNING id
        `
        return rows.length > 0
      }
    }
    return false
  })

/** An approved plan takes Claude out of plan mode, so the thread's next turn starts working. */
const updateClaudeMode = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.method !== CLAUDE_PERMISSION_MODE) return false
    const { permissionMode: mode } = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ permissionMode: Schema.optional(Schema.String) }),
    )(input.params)
    if (typeof mode !== "string" || mode === "plan") return false
    const rows = yield* sql`UPDATE thread_settings SET mode = 'default'
      WHERE thread_id = ${input.threadId} AND provider_id IN (SELECT id FROM providers WHERE harness = 'claude-code')
      RETURNING thread_id`
    return rows.length > 0
  })

const updateCursorMode = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.method === "cursor/acp/session/update") {
      const { update } = yield* Schema.decodeUnknownEffect(CursorPayload)(input.params)
      const nativeMode =
        update?.sessionUpdate === "current_mode_update"
          ? update.currentModeId
          : update?.sessionUpdate === "config_option_update"
            ? update.configOptions?.find(
                (option) => option && (option.category === "mode" || option.id === "mode"),
              )?.currentValue
            : undefined
      if (nativeMode === "agent" || nativeMode === "plan" || nativeMode === "ask") {
        const rows =
          yield* sql`UPDATE thread_settings SET mode = ${nativeMode === "agent" ? "default" : nativeMode}
          WHERE thread_id = ${input.threadId} AND provider_id IN (SELECT id FROM providers WHERE harness = 'cursor')
          RETURNING thread_id`
        return rows.length > 0
      }
    }
    return false
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
        PI_EXTENSION_UI_REQUEST,
        CLAUDE_EXIT_PLAN_MODE,
      ].includes(input.method)
    ) {
      const copy = approvalCopy(input.method, input.params)
      const rows = yield* sql`
        INSERT INTO approvals (
          id, thread_id, turn_id, request_id, method, title, detail, request_data, created_at
        ) VALUES (
          ${randomUUID()}, ${input.threadId}, ${input.turnId}, ${String(input.requestId)},
          ${input.method}, ${copy.title}, ${copy.detail}, ${JSON.stringify(input.params)}, ${new Date().toISOString()}
        ) ON CONFLICT(request_id) DO NOTHING
        RETURNING id
      `
      return rows.length > 0
    }
    return false
  })

const clearApproval = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.method === "serverRequest/resolved") {
      const params = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ requestId: Schema.optional(Schema.Union([Schema.String, Schema.Number])) }),
      )(input.params)
      if (typeof params.requestId === "string" || typeof params.requestId === "number") {
        const rows =
          yield* sql`DELETE FROM approvals WHERE turn_id = ${input.turnId} AND request_id = ${String(params.requestId)} RETURNING id`
        return rows.length > 0
      }
    }
    return false
  })

const finishTurn = (input: RuntimeEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    let nextDispatch: TurnDispatch | null = null

    const params = yield* Schema.decodeUnknownEffect(
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
    // An interrupted turn leaves the queue alone unless a steering message is why it stopped.
    const steering =
      status === "interrupted" &&
      (yield* sql`SELECT 1 FROM queued_inputs WHERE thread_id = ${input.threadId} AND steer = 1 LIMIT 1`)
        .length > 0
    if (input.promoteQueue !== false && (status === "completed" || steering))
      nextDispatch = yield* promoteQueue(input.threadId).pipe(
        transaction,
        Effect.catch((cause) =>
          appendEvent(input.threadId, input.turnId, "error", "queue/error", cause.message, {
            error: { message: `Queued messages could not start: ${cause.message}` },
          }).pipe(Effect.as(null)),
        ),
      )

    return nextDispatch
  })
