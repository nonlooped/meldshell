import { homedir } from "node:os"
import {
  asRecord,
  asRecords,
  asText,
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
import { ApprovalGate, READ_ONLY_TOOLS } from "./approval-gate"
import { decodeDialog, dialogResponse } from "./dialogs"
import { atLeast, discoverPi, MINIMUM_PI_VERSION, type PiCommand } from "./discovery"
import { PiEvents, type RunOutcome } from "./events"
import { parseModelSlug, piModels } from "./models"
import { piPrompt } from "./prompt"
import { PiRpc } from "./rpc"

type Emit = (method: string, params: unknown, validated?: boolean, requestId?: string) => void
type TurnStatus = "completed" | "failed" | "interrupted"

interface TurnOutcome {
  readonly result: TurnStatus
  readonly error?: string
}

interface RunningTurn {
  readonly dispatch: TurnDispatch
  readonly emit: Emit
  rpc?: PiRpc
  interrupted: boolean
  /** Ends the wait for Pi to settle, as `agent_settled` or a finished abort does. */
  settle: () => void
  task: Promise<void>
}

interface PendingDialog {
  readonly turn: RunningTurn
  readonly dialog: PiDialog
  readonly timer: ReturnType<typeof setTimeout> | undefined
}

/** How long a title or command listing may take before its Pi process is stopped. */
const SHORT_TASK_MS = 60_000
/** How long an interrupted turn may take to settle before its Pi process is stopped. */
const INTERRUPT_GRACE_MS = 5_000

/** Resolves once Pi settles, or fails with Pi's own diagnostics if it exits first. */
const untilSettled = (rpc: PiRpc, settled: Promise<void>): Promise<void> =>
  Promise.race([
    settled,
    rpc.exited.then(() => {
      throw rpc.error ?? new Error("Pi stopped before the turn settled.")
    }),
  ])

const acceptsImages = (model: UnknownRecord): boolean =>
  Array.isArray(model.input) && model.input.includes("image")

/** A run's last assistant message decides the turn: aborted, failed, or completed. */
const turnOutcome = (interrupted: boolean, outcome: RunOutcome): TurnOutcome => {
  if (interrupted || outcome.stopReason === "aborted") return { result: "interrupted" }
  if (outcome.stopReason === "error")
    return { result: "failed", error: outcome.error ?? "Pi's model request failed." }
  return { result: "completed" }
}

export const runPiWorker = (
  port: WorkerPort,
  dependencies: { readonly discover: () => Promise<PiCommand> } = { discover: discoverPi },
): { shutdown: () => Promise<void> } => {
  const publish = eventPublisher(port)
  const gate = new ApprovalGate()
  const connections = new Set<PiRpc>()
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
        // Discover again on every probe, so an update or a new install is picked up.
        discovered = await dependencies.discover().catch((cause: unknown) => {
          discovered = null
          throw cause
        })
        if (!atLeast(discovered.version, MINIMUM_PI_VERSION)) {
          publish({
            type: "provider-status",
            status: status(
              "outdated",
              `MeldShell needs Pi ${MINIMUM_PI_VERSION} or newer. Run pi update, then check again.`,
            ),
          })
          return
        }
        const catalog = await readCatalog()
        if (stopping) return
        if (catalog.length === 0)
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
            models: catalog,
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

  /** Pi has no permission prompts; MeldShell narrows its tools or loads its approval gate. */
  const permissionArgs = async (dispatch: TurnDispatch): Promise<string[]> => {
    const readOnly =
      dispatch.sandbox === "read-only" ||
      (dispatch.approvalPolicy === "never" && dispatch.sandbox !== "danger-full-access")
    if (readOnly) return ["--tools", READ_ONLY_TOOLS.join(",")]
    if (dispatch.approvalPolicy === "never") return []
    return ["--extension", await gate.path()]
  }

  const resolvedDialog = (requestId: string): void => {
    const pending = dialogs.get(requestId)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    dialogs.delete(requestId)
    pending.turn.emit("serverRequest/resolved", { requestId })
  }

  const cancelDialogs = (turn: RunningTurn): void => {
    for (const [requestId, pending] of dialogs) {
      if (pending.turn !== turn) continue
      try {
        turn.rpc?.answer(requestId, { cancelled: true })
      } catch {
        /* Pi has already exited. */
      }
      resolvedDialog(requestId)
    }
  }

  /** Dialogs wait for the user; Pi's other extension UI records are notifications. */
  const extensionRequest = (turn: RunningTurn, record: UnknownRecord): void => {
    const dialog = decodeDialog(record)
    if (dialog === null) {
      if (record.method === "notify" && asText(record.message))
        turn.emit("item/completed", {
          item: {
            id: `pi:notify:${asText(record.id)}`,
            type: "providerStatus",
            text: asText(record.message),
            result: asText(record.notifyType) || "info",
            status: "completed",
          },
        })
      else turn.emit(`pi/extension_ui/${asText(record.method) || "unknown"}`, record, false)
      return
    }
    // Pi answers a timed dialog itself once its timeout passes.
    const timer =
      dialog.timeout === undefined
        ? undefined
        : setTimeout(() => resolvedDialog(dialog.id), dialog.timeout)
    dialogs.set(dialog.id, { turn, dialog, timer })
    turn.emit("pi/extension_ui_request", record, true, dialog.id)
  }

  /** Starts Pi on the thread's session with the permissions the turn chose. */
  const openTurn = async (turn: RunningTurn, events: PiEvents): Promise<PiRpc | null> => {
    const { dispatch } = turn
    const sessionId = dispatch.nativeThreadId ?? dispatch.threadId
    const args = ["--session-id", sessionId, ...(await permissionArgs(dispatch))]
    if (turn.interrupted) return null
    turn.rpc = await connect(dispatch.workspacePath, args, (record) => {
      if (record.type === "extension_ui_request") return extensionRequest(turn, record)
      if (record.type === "agent_settled") turn.settle()
      events.accept(record)
    })
    return turn.interrupted ? null : turn.rpc
  }

  /** Sends the turn's prompt and waits until Pi will not continue on its own. */
  const runTurn = async (
    turn: RunningTurn,
    events: PiEvents,
    settled: Promise<void>,
  ): Promise<TurnOutcome> => {
    const rpc = await openTurn(turn, events)
    if (rpc === null) return { result: "interrupted" }
    const { dispatch } = turn
    const model = asRecord(await rpc.request("set_model", parseModelSlug(dispatch.model)))
    if (dispatch.reasoningEffort !== null)
      await rpc.request("set_thinking_level", { level: dispatch.reasoningEffort })
    const state = asRecord(await rpc.request("get_state"))
    publish({
      type: "provider-session",
      threadId: dispatch.threadId,
      nativeThreadId: asText(state.sessionId) || (dispatch.nativeThreadId ?? dispatch.threadId),
    })
    const prompt = await piPrompt(dispatch, acceptsImages(model))
    if (turn.interrupted) return { result: "interrupted" }
    const accepted = asRecord(await rpc.request("prompt", prompt, 0))
    // An extension command or input handler consumed the prompt; no run started.
    if (accepted.disposition !== "handled") await untilSettled(rpc, settled)
    return turnOutcome(turn.interrupted, events.outcome)
  }

  const startTurn = (dispatch: TurnDispatch): void => {
    if (dispatch.harness !== "pi") throw new Error("Turn routed to the wrong provider.")
    if (
      turns.has(dispatch.turnId) ||
      [...turns.values()].some((turn) => turn.dispatch.threadId === dispatch.threadId)
    )
      throw new Error("This Pi thread is already running.")
    const emit: Emit = (method, params, validated = true, requestId) =>
      publish({
        type: "runtime-event",
        input: {
          threadId: dispatch.threadId,
          turnId: dispatch.turnId,
          nativeTurnId: dispatch.turnId,
          method,
          params,
          validated,
          ...(requestId === undefined ? {} : { requestId }),
        },
      })
    const turn: RunningTurn = {
      dispatch,
      emit,
      interrupted: false,
      settle: () => undefined,
      task: Promise.resolve(),
    }
    const settled = new Promise<void>((resolve) => {
      turn.settle = resolve
    })
    turns.set(dispatch.turnId, turn)
    const events = new PiEvents(dispatch.turnId, emit)
    emit("turn/started", { turn: { id: dispatch.turnId, status: "running" } })
    turn.task = (async () => {
      const { result, error } = await runTurn(turn, events, settled).catch(
        (cause: unknown): TurnOutcome => ({
          result: turn.interrupted || stopping ? "interrupted" : "failed",
          error: errorMessage(cause),
        }),
      )
      // The turn ends once its Pi has exited, so a queued turn never shares the session file.
      cancelDialogs(turn)
      await turn.rpc?.close()
      turns.delete(dispatch.turnId)
      if (result === "failed" && error) emit("error", { error: { message: error } })
      emit("turn/completed", { turn: { status: result, ...(error ? { error } : {}) } })
    })()
  }

  const interruptTurn = (nativeTurnId: string, ack: (error?: string) => void): void => {
    const turn = turns.get(nativeTurnId)
    if (!turn) {
      ack("This Pi turn is no longer running.")
      return
    }
    turn.interrupted = true
    cancelDialogs(turn)
    const rpc = turn.rpc
    if (rpc === undefined) {
      ack()
      return
    }
    const timer = setTimeout(() => void rpc.close(), INTERRUPT_GRACE_MS)
    void turn.task.finally(() => clearTimeout(timer))
    // Abort answers once the session is idle, so the run is over even without `agent_settled`.
    // A failed abort stops Pi instead; either way the turn settles through its task.
    void rpc.request("abort", {}, INTERRUPT_GRACE_MS).then(
      () => turn.settle(),
      () => void rpc.close(),
    )
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
      const response = dialogResponse(pending.dialog, message.decision, message.answers)
      pending.turn.rpc?.answer(requestId, response)
    } catch (cause) {
      ack(errorMessage(cause))
      return
    }
    resolvedDialog(requestId)
    ack()
  }

  const generateTitle = async (request: TitleRequest): Promise<void> => {
    try {
      const title = await withPi(
        request.workspacePath,
        ["--no-tools", "--no-context-files", "--no-skills", "--no-prompt-templates"],
        async (rpc, settled) => {
          await rpc.request("set_model", parseModelSlug(request.model))
          if (request.reasoningEffort !== null)
            await rpc.request("set_thinking_level", { level: request.reasoningEffort })
          await rpc.request("prompt", { message: request.prompt }, 0)
          await untilSettled(rpc, settled)
          return asText(asRecord(await rpc.request("get_last_assistant_text")).text)
        },
      )
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
              kind: command.source === "skill" ? "skill" : "command",
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
    await gate.dispose()
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
        case "steer-turn":
          ack("Pi turns are not steered from MeldShell.")
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
