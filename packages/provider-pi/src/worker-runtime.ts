import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { Result } from "effect"
import {
  asRecord,
  asRecords,
  asText,
  decodePiPayload,
  errorMessage,
  type ComposerCommand,
  type PiDialog,
  type PiStatus,
  type TitleRequest,
  type TurnDispatch,
  type UnknownRecord,
  type WorkerCommand,
} from "@meldshell/contracts"
import { eventPublisher, workerCommand, type WorkerPort } from "@meldshell/provider-runtime"
import { decodeDialog, dialogResponse } from "./dialogs"
import { discoverPi, type PiCommand } from "./discovery"
import { parseModelSlug, piModels } from "./models"
import { piPrompt } from "./prompt"
import { PiRpc } from "./rpc"
import { listPiSessions, readPiSession } from "./sessions"

type Emit = (method: string, params: unknown, validated?: boolean, requestId?: string) => void

/** One thread's Pi, kept running between turns as Pi's RPC mode intends. */
interface Session {
  readonly threadId: string
  rpc: PiRpc
  /** The model the thread last chose, which a run Pi starts on its own also uses. */
  model: string
  /** Pi is between `agent_start` and `agent_settled`, however the run began. */
  running: boolean
  closing: boolean
  /** Reports to the running turn; null between turns, when Pi's records belong to no turn. */
  emit: Emit | null
  /** Ends the running turn's wait once Pi will not continue on its own. */
  settle: (() => void) | null
  /** How the last assistant message ended, which decides the turn's status. */
  stopReason: string | null
  stopError: string | null
}

interface RunningTurn {
  readonly threadId: string
  session?: Session
  interrupted: boolean
  task: Promise<void>
}

interface PendingDialog {
  readonly session: Session
  readonly dialog: PiDialog
  readonly timer: ReturnType<typeof setTimeout> | undefined
}

/** How long a title or command listing may take before its Pi is stopped. */
const SHORT_TASK_MS = 60_000
/** How long an interrupted turn may take to settle before its Pi is stopped. */
const INTERRUPT_GRACE_MS = 5_000

/** Resolves once Pi settles, or fails with Pi's own diagnostics if it exits first. */
const untilSettled = (rpc: PiRpc, settled: Promise<void>): Promise<void> =>
  Promise.race([
    settled,
    rpc.exited.then(() => {
      throw rpc.error ?? new Error("Pi stopped before the turn settled.")
    }),
  ])

export const runPiWorker = (
  port: WorkerPort,
  dependencies: { readonly discover: () => Promise<PiCommand> } = { discover: discoverPi },
): { shutdown: () => Promise<void> } => {
  const publish = eventPublisher(port)
  const connections = new Set<PiRpc>()
  const sessions = new Map<string, Session>()
  const turns = new Map<string, RunningTurn>()
  const dialogs = new Map<string, PendingDialog>()
  let discovered: PiCommand | null = null
  let probing: Promise<void> | null = null
  let stopping = false

  const status = (availability: PiStatus["availability"], detail: string): PiStatus => ({
    provider: "pi",
    harness: "pi",
    availability,
    detail,
    executablePath: discovered?.executablePath ?? null,
    ...(discovered ? { launcher: { command: discovered.command, args: discovered.args } } : {}),
    version: discovered?.version ?? null,
    accountEmail: null,
    checkedAt: new Date().toISOString(),
  })

  const connect = async (
    cwd: string,
    args: ReadonlyArray<string>,
    record: (record: UnknownRecord) => void,
  ): Promise<PiRpc> => {
    discovered ??= await dependencies.discover()
    if (stopping) throw new Error("Pi is shutting down.")
    const rpc = new PiRpc(discovered, cwd, args, {
      record,
      spawned: (pid) => publish({ type: "process-started", pid }),
      stopped: (pid) => publish({ type: "process-stopped", pid }),
    })
    connections.add(rpc)
    void rpc.exited.then(() => connections.delete(rpc))
    return rpc
  }

  /** Runs `use` against a short-lived Pi with no stored session, stopped however `use` ends. */
  const withPi = async <A>(
    cwd: string,
    args: ReadonlyArray<string>,
    use: (rpc: PiRpc, settled: Promise<void>) => Promise<A>,
  ): Promise<A> => {
    let settle = (): void => undefined
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })
    const rpc = await connect(cwd, ["--no-session", ...args], (record) => {
      // Nobody is there to answer an extension's dialog outside a turn.
      if (record.type === "extension_ui_request" && decodeDialog(record) !== null)
        rpc.answer(asText(record.id), { cancelled: true })
      if (record.type === "agent_settled") settle()
    })
    const deadline = setTimeout(() => void rpc.close(), SHORT_TASK_MS)
    try {
      return await use(rpc, settled)
    } finally {
      clearTimeout(deadline)
      await rpc.close()
    }
  }

  /** The models Pi has credentials for, with Pi's current model as the default. */
  const readCatalog = () =>
    withPi(homedir(), [], async (rpc) => {
      const [available, current] = await Promise.all([
        rpc.request("get_available_models"),
        rpc.request("get_state"),
      ])
      const { models } = asRecord(available)
      return piModels(Array.isArray(models) ? models : [], asRecord(current).model)
    })

  const failedStatus = (cause: unknown): PiStatus => {
    const message = errorMessage(cause)
    return /not installed|not available on PATH/i.test(message)
      ? status("missing", message)
      : status("error", `Could not connect to Pi: ${message}`)
  }

  const probe = (): Promise<void> => {
    if (probing !== null) return probing
    if (stopping) return Promise.resolve()
    probing = (async () => {
      publish({ type: "provider-status", status: status("probing", "Connecting to Pi…") })
      try {
        discovered = await dependencies.discover().catch((cause: unknown) => {
          discovered = null
          throw cause
        })
        const models = await readCatalog()
        if (stopping) return
        if (models.length === 0)
          publish({
            type: "provider-status",
            status: status(
              "unauthenticated",
              "Pi has no models with credentials. Run pi and use /login, or set a provider API key, then check again.",
            ),
          })
        else
          publish({
            type: "provider-ready",
            providerKey: "pi",
            models,
            status: status("ready", "Pi is ready."),
          })
      } catch (cause) {
        if (!stopping) publish({ type: "provider-status", status: failedStatus(cause) })
      }
    })().finally(() => {
      probing = null
    })
    return probing
  }

  const resolvedDialog = (requestId: string): void => {
    const pending = dialogs.get(requestId)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    dialogs.delete(requestId)
    pending.session.emit?.("serverRequest/resolved", { requestId })
  }

  const cancelDialogs = (session: Session): void => {
    for (const [requestId, pending] of dialogs) {
      if (pending.session !== session) continue
      try {
        session.rpc.answer(requestId, { cancelled: true })
      } catch {
        /* Pi has already exited. */
      }
      resolvedDialog(requestId)
    }
  }

  /** A dialog waits for the user, as in Pi's own interface; outside a turn nobody can answer. */
  const openDialog = (session: Session, dialog: PiDialog, record: UnknownRecord): void => {
    if (!session.emit) {
      session.rpc.answer(dialog.id, { cancelled: true })
      return
    }
    // Pi answers a timed dialog itself once its timeout passes.
    const timer =
      dialog.timeout === undefined
        ? undefined
        : setTimeout(() => resolvedDialog(dialog.id), dialog.timeout)
    dialogs.set(dialog.id, { session, dialog, timer })
    session.emit("pi/extension_ui_request", record, true, dialog.id)
  }

  /** Follows Pi's run state and how each assistant message ended, whoever started the run. */
  const trackRun = (session: Session, record: UnknownRecord): void => {
    if (record.type === "agent_start") {
      session.running = true
      // An extension started this run, so no MeldShell turn is waiting for it yet.
      if (!session.emit && !stopping) openTurn(session)
    }
    // An idle notification before agent_start does not belong to the waiting prompt.
    if (record.type === "agent_settled" && session.running) {
      session.running = false
      session.settle?.()
    }
    const message = record.type === "message_end" ? asRecord(record.message) : {}
    if (message.role === "assistant") {
      session.stopReason = asText(message.stopReason) || null
      session.stopError = asText(message.errorMessage) || null
    }
  }

  /** Forwards Pi's records unchanged. */
  const onRecord = (session: Session, record: UnknownRecord): void => {
    if (session.closing) return
    trackRun(session, record)
    const dialog = record.type === "extension_ui_request" ? decodeDialog(record) : null
    if (dialog !== null) return openDialog(session, dialog, record)
    const decoded = decodePiPayload(record)
    if (Result.isFailure(decoded))
      publish({
        type: "protocol-error",
        message: `Invalid Pi ${asText(record.type) || "record"}: ${decoded.failure.message}`,
        raw: record,
      })
    session.emit?.(`pi/${asText(record.type) || "record"}`, record, Result.isSuccess(decoded))
  }

  const closeSession = async (session: Session): Promise<void> => {
    session.closing = true
    cancelDialogs(session)
    session.emit = null
    session.settle = null
    await session.rpc.close()
  }

  const closeThreadSession = async (threadId: string) => {
    const session = sessions.get(threadId)
    if (!session) return
    sessions.delete(threadId)
    await closeSession(session)
    await Promise.all(
      [...turns.values()].filter((turn) => turn.threadId === threadId).map((turn) => turn.task),
    )
  }

  /** The thread's running Pi, or a new one that opens the thread's saved Pi session. */
  const sessionFor = async (dispatch: TurnDispatch): Promise<Session> => {
    const existing = sessions.get(dispatch.threadId)
    // A rewind clears the thread's saved session, so a running Pi holds a conversation it no longer has.
    if (existing && existing.rpc.error === null && dispatch.nativeThreadId !== null) return existing
    if (existing) {
      sessions.delete(dispatch.threadId)
      await closeSession(existing)
    }
    const args = dispatch.nativeThreadId ? ["--session", dispatch.nativeThreadId] : []
    const session: Session = {
      threadId: dispatch.threadId,
      rpc: undefined as unknown as PiRpc,
      model: dispatch.model,
      running: false,
      closing: false,
      emit: null,
      settle: null,
      stopReason: null,
      stopError: null,
    }
    session.rpc = await connect(dispatch.workspacePath, args, (record) => onRecord(session, record))
    sessions.set(dispatch.threadId, session)
    return session
  }

  /** Selects the turn's model and thinking level where they differ from the session's. */
  const configure = async (session: Session, dispatch: TurnDispatch): Promise<UnknownRecord> => {
    const state = asRecord(await session.rpc.request("get_state"))
    const { provider, modelId } = parseModelSlug(dispatch.model)
    const model = asRecord(state.model)
    if (model.provider !== provider || model.id !== modelId)
      await session.rpc.request("set_model", { provider, modelId })
    if (dispatch.reasoningEffort !== null && state.thinkingLevel !== dispatch.reasoningEffort)
      await session.rpc.request("set_thinking_level", { level: dispatch.reasoningEffort })
    return state
  }

  /** Sends the turn's prompt and waits until Pi will not continue on its own. */
  const runPrompt = async (
    turn: RunningTurn,
    dispatch: TurnDispatch,
    session: Session,
  ): Promise<void> => {
    const state = await configure(session, dispatch)
    session.model = dispatch.model
    publish({
      type: "provider-session",
      threadId: dispatch.threadId,
      nativeThreadId: asText(state.sessionFile) || asText(state.sessionId),
    })
    const prompt = await piPrompt(dispatch)
    if (turn.interrupted) throw new Error("Pi turn interrupted.")
    session.stopReason = null
    session.stopError = null
    const settled = new Promise<void>((resolve) => {
      session.settle = resolve
    })
    const accepted = asRecord(await session.rpc.request("prompt", prompt, 0))
    // An extension command or input handler consumed the prompt. A run the command started
    // before answering belongs to this turn; one it starts later opens a turn of its own.
    if (accepted.disposition !== "handled" || session.running)
      await untilSettled(session.rpc, settled)
  }

  const completion = (turn: RunningTurn, session: Session) =>
    turn.interrupted || session.stopReason === "aborted"
      ? { status: "interrupted" }
      : session.stopReason === "error"
        ? { status: "failed", error: session.stopError ?? "Pi's model request failed." }
        : { status: "completed" }

  /** Registers a turn and the emitter that reports its events. */
  const beginTurn = (threadId: string, turnId: string) => {
    if (turns.has(turnId) || [...turns.values()].some((turn) => turn.threadId === threadId))
      throw new Error("This Pi thread is already running.")
    const turn: RunningTurn = { threadId, interrupted: false, task: Promise.resolve() }
    turns.set(turnId, turn)
    const emit: Emit = (method, params, validated = true, requestId) =>
      publish({
        type: "runtime-event",
        input: {
          threadId,
          turnId,
          nativeTurnId: turnId,
          method,
          params,
          validated,
          ...(requestId === undefined ? {} : { requestId }),
        },
      })
    return { turn, emit }
  }

  /** Runs a turn's work, then settles it once Pi is idle; a Pi that failed is replaced. */
  const runTurn = (
    turnId: string,
    turn: RunningTurn,
    emit: Emit,
    work: () => Promise<Session>,
  ): Promise<void> =>
    (async () => {
      let result: { status: string; error?: string }
      try {
        result = completion(turn, await work())
      } catch (cause) {
        result = {
          status: turn.interrupted || stopping ? "interrupted" : "failed",
          error: errorMessage(cause),
        }
        if (turn.session) {
          sessions.delete(turn.threadId)
          await closeSession(turn.session)
        }
      }
      if (turn.session) {
        cancelDialogs(turn.session)
        turn.session.emit = null
        turn.session.settle = null
      }
      turns.delete(turnId)
      emit("turn/completed", { turn: result })
    })()

  const startTurn = (dispatch: TurnDispatch): void => {
    if (dispatch.harness !== "pi") throw new Error("Turn routed to the wrong provider.")
    const { turn, emit } = beginTurn(dispatch.threadId, dispatch.turnId)
    emit("turn/started", { turn: { id: dispatch.turnId } })
    turn.task = runTurn(dispatch.turnId, turn, emit, async () => {
      const session = await sessionFor(dispatch)
      turn.session = session
      session.emit = emit
      if (turn.interrupted) throw new Error("Pi turn interrupted.")
      await runPrompt(turn, dispatch, session)
      return session
    })
  }

  /** Opens a turn for a run Pi started on its own, such as one an extension began. */
  const openTurn = (session: Session): void => {
    if ([...turns.values()].some((turn) => turn.threadId === session.threadId)) return
    const turnId = randomUUID()
    const { turn, emit } = beginTurn(session.threadId, turnId)
    publish({ type: "turn-opened", threadId: session.threadId, turnId, model: session.model })
    turn.session = session
    session.emit = emit
    session.stopReason = null
    session.stopError = null
    const settled = new Promise<void>((resolve) => {
      session.settle = resolve
    })
    emit("turn/started", { turn: { id: turnId } })
    turn.task = runTurn(turnId, turn, emit, async () => {
      await untilSettled(session.rpc, settled)
      return session
    })
  }

  const interruptTurn = (nativeTurnId: string, ack: (error?: string) => void): void => {
    const turn = turns.get(nativeTurnId)
    if (!turn) {
      ack("This Pi turn is no longer running.")
      return
    }
    turn.interrupted = true
    const session = turn.session
    if (session === undefined) {
      ack()
      return
    }
    cancelDialogs(session)
    // Abort answers once the session is idle, so the run is over even without `agent_settled`.
    void session.rpc.request("abort", {}, INTERRUPT_GRACE_MS).then(
      () => session.settle?.(),
      () => void session.rpc.close(),
    )
    const timer = setTimeout(() => {
      if (turns.has(nativeTurnId)) void session.rpc.close()
    }, INTERRUPT_GRACE_MS)
    void turn.task.finally(() => clearTimeout(timer))
    ack()
  }

  const resolveDialog = (
    message: Extract<WorkerCommand, { type: "resolve-approval" }>,
    ack: (error?: string) => void,
  ): void => {
    const requestId = String(message.requestId)
    const pending = dialogs.get(requestId)
    if (!pending) {
      ack("This Pi dialog is no longer pending.")
      return
    }
    try {
      pending.session.rpc.answer(
        requestId,
        dialogResponse(pending.dialog, message.decision, message.answers),
      )
    } catch (cause) {
      ack(errorMessage(cause))
      return
    }
    resolvedDialog(requestId)
    ack()
  }

  const generateTitle = async (request: TitleRequest): Promise<void> => {
    try {
      const title = await withPi(request.workspacePath, ["--no-tools"], async (rpc, settled) => {
        await rpc.request("set_model", parseModelSlug(request.model))
        if (request.reasoningEffort !== null)
          await rpc.request("set_thinking_level", { level: request.reasoningEffort })
        await rpc.request("prompt", { message: request.prompt }, 0)
        await untilSettled(rpc, settled)
        return asText(asRecord(await rpc.request("get_last_assistant_text")).text)
      })
      if (stopping) return
      if (title.trim()) publish({ type: "thread-title", threadId: request.threadId, title })
      else
        publish({
          type: "title-failed",
          threadId: request.threadId,
          message: "The title model answered with no text.",
        })
    } catch (cause) {
      if (!stopping)
        publish({ type: "title-failed", threadId: request.threadId, message: errorMessage(cause) })
    }
  }

  /** Pi lists its prompt templates, skills, and extension commands; skills run as `/skill:name`. */
  const listCommands = async (requestId: string, workspacePath: string): Promise<void> => {
    try {
      const listed = await withPi(workspacePath, [], (rpc) => rpc.request("get_commands"))
      const commands = asRecords(asRecord(listed).commands).flatMap(
        (command): ComposerCommand[] => {
          const name = asText(command.name)
          if (!name) return []
          return [
            {
              kind: "command",
              name,
              description: asText(command.description),
            },
          ]
        },
      )
      if (!stopping) publish({ type: "commands-result", requestId, commands })
    } catch (cause) {
      if (!stopping) publish({ type: "commands-result", requestId, error: errorMessage(cause) })
    }
  }

  const shutdown = async (): Promise<void> => {
    if (stopping) return
    stopping = true
    for (const turn of turns.values()) turn.interrupted = true
    await Promise.all([...connections].map((rpc) => rpc.close()))
    await Promise.allSettled([...turns.values()].map((turn) => turn.task))
    sessions.clear()
    dialogs.clear()
  }

  port.on("message", ({ data }) => {
    if (data === "probe-now") {
      void probe()
      return
    }
    const { input: message, acknowledge: ack } = workerCommand(port, data)
    if (message === null) {
      ack("Invalid Pi worker command.")
      return
    }
    if (stopping && message.type !== "shutdown") {
      ack("Pi is shutting down.")
      return
    }
    try {
      switch (message.type) {
        case "start-turn":
          startTurn(message.dispatch)
          ack()
          break
        case "generate-title":
          void generateTitle(message.request)
          ack()
          break
        case "interrupt-turn":
          interruptTurn(message.nativeTurnId, ack)
          break
        case "resolve-approval":
          resolveDialog(message, ack)
          break
        case "get-usage":
          publish({
            type: "usage-result",
            requestId: message.requestId,
            error: "Pi does not report subscription usage.",
          })
          break
        case "cancel-usage":
          break
        case "list-commands":
          void listCommands(message.requestId, message.workspacePath)
          break
        case "list-sessions":
          void listPiSessions(message.workspacePath).then(
            (sessions) =>
              publish({ type: "sessions-result", requestId: message.requestId, sessions }),
            (cause: unknown) =>
              publish({
                type: "sessions-result",
                requestId: message.requestId,
                error: errorMessage(cause),
              }),
          )
          break
        case "read-session":
          void readPiSession(message.workspacePath, message.nativeThreadId).then(
            (history) =>
              publish({ type: "session-history-result", requestId: message.requestId, history }),
            (cause: unknown) =>
              publish({
                type: "session-history-result",
                requestId: message.requestId,
                error: errorMessage(cause),
              }),
          )
          break
        case "steer-turn":
          ack("Pi turns are not steered from MeldShell.")
          break
        case "close-thread-session":
          void closeThreadSession(message.threadId).then(
            () => ack(),
            (cause: unknown) => ack(errorMessage(cause)),
          )
          break
        case "shutdown":
          void shutdown().then(
            () => ack(),
            (cause: unknown) => ack(errorMessage(cause)),
          )
          break
      }
    } catch (cause) {
      ack(errorMessage(cause))
    }
  })
  void probe()
  return { shutdown }
}
