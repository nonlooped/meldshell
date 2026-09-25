import { Either, Schema } from "effect"
import type { AvailableCommand } from "@agentclientprotocol/sdk"
import { eventPublisher, workerCommand, type WorkerPort } from "@meldshell/provider-runtime"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { RequestError } from "@agentclientprotocol/sdk"
import {
  decodeCursorPayload,
  CursorContent,
  errorMessage,
  type CursorStatus,
  type TitleRequest,
  type TurnDispatch,
  type UnknownRecord,
} from "@meldshell/contracts"
import { readCursorUsage } from "./usage"
import { cursorCommands, discoverCursorSkills } from "./skills"
import {
  CursorClient,
  discoverCursor,
  readCursorAccountEmail,
  type CursorCommand,
  type NativeMessage,
} from "./client"
import {
  automaticPermission,
  cursorPrompt,
  permissionResponse,
  planResponse,
  questionResponse,
  decodeNotification,
  nativeMethod,
} from "./protocol"
import {
  acceptsImages,
  configureModel,
  cursorMode,
  discoverModels,
  type ConfigurableSession,
} from "./session-config"
import {
  QuestionServer,
  answeredResult,
  skippedResult,
  type ToolQuestion,
  type ToolResult,
} from "./question-server"

type Emit = (method: string, params: unknown, validated?: boolean, requestId?: string) => void
interface Session extends ConfigurableSession {
  sessionId: string
  init: UnknownRecord
  emit: Emit | null
  replaying: boolean
  interactive: boolean
  permissions?: Pick<TurnDispatch, "sandbox" | "approvalPolicy">
  availableCommands?: readonly AvailableCommand[]
  onCommands?: () => void
  /** Withdraws the session's MeldShell question tool. */
  releaseQuestions?: () => void
}
interface RunningTurn {
  dispatch: TurnDispatch
  session?: Session
  interrupted: boolean
  task: Promise<void>
}
interface PendingInteraction {
  session: Session
  respond: (
    decision: string,
    answers?: Readonly<Record<string, ReadonlyArray<string>>>,
    optionId?: string,
  ) => void
}

export const runCursorWorker = (
  port: WorkerPort,
  dependencies: {
    discover: typeof discoverCursor
    Client: typeof CursorClient
    readUsage?: typeof readCursorUsage
    readAccountEmail?: typeof readCursorAccountEmail
  } = { discover: discoverCursor, Client: CursorClient },
): { shutdown: () => Promise<void> } => {
  const publish = eventPublisher(port)
  const publishStatus = (value: CursorStatus): void =>
    publish({ type: "provider-status", status: value })
  const sessions = new Map<string, Session>()
  const clients = new Set<CursorClient>()
  const turns = new Map<string, RunningTurn>()
  const approvals = new Map<string, PendingInteraction>()
  const usageRequests = new Map<string, AbortController>()
  const questionServer = new QuestionServer()
  let stopping = false
  let command: CursorCommand | null = null
  let probing: Promise<void> | null = null
  const status = (
    availability: CursorStatus["availability"],
    detail: string,
    accountEmail: string | null = null,
  ): CursorStatus => ({
    provider: "cursor",
    harness: "cursor",
    availability,
    detail,
    executablePath: command?.command ?? null,
    version:
      command?.args[0]?.match(/(\d{4}\.\d{1,2}\.\d{1,2}(?:-\d{2}-\d{2}-\d{2})?-[a-f0-9]+)/)?.[1] ??
      null,
    accountEmail,
    checkedAt: new Date().toISOString(),
  })
  const onRequest = <Response>(
    session: Session,
    method: string,
    params: UnknownRecord,
    signal: AbortSignal,
    response: (
      decision: string,
      answers?: Readonly<Record<string, ReadonlyArray<string>>>,
      optionId?: string,
    ) => Response,
  ): Promise<Response> => {
    signal.throwIfAborted()
    if (
      typeof params.sessionId === "string" &&
      session.sessionId &&
      params.sessionId !== session.sessionId
    )
      throw RequestError.invalidParams(undefined, "Cursor session does not match this connection.")
    if (!session.emit || !session.interactive || session.replaying) {
      throw new RequestError(-32601, "Inactive Cursor client request.")
    }
    const automatic =
      method === "session/request_permission"
        ? automaticPermission(session.permissions, params)
        : null
    if (automatic) {
      const result = response(automatic.decision, undefined, automatic.optionId)
      session.emit("cursor/acp/permission/automatic", { request: params, response: result }, true)
      return Promise.resolve(result)
    }
    const id = randomUUID()
    const pending = new Promise<Response>((resolve, reject) => {
      const abort = (): void => {
        approvals.delete(id)
        session.emit?.("serverRequest/resolved", { requestId: id }, true)
        reject(signal.reason)
      }
      signal.addEventListener("abort", abort, { once: true })
      approvals.set(id, {
        session,
        respond: (decision, answers, optionId) => {
          // Validate before resolving, so invalid UI answers leave the approval pending.
          const result = response(decision, answers, optionId)
          signal.removeEventListener("abort", abort)
          approvals.delete(id)
          resolve(result)
        },
      })
    })
    session.emit(nativeMethod(method), params, true, id)
    return pending
  }
  /** MeldShell's question tool, answered through the shared user-input interaction. */
  const askQuestions = (
    session: Session,
    questions: ReadonlyArray<ToolQuestion>,
    signal: AbortSignal,
  ): Promise<ToolResult> =>
    onRequest(session, "cursor/ask_user_question", { questions }, signal, (decision, answers) => {
      if (decision === "accept") return answeredResult(questions, answers)
      if (decision === "cancel")
        return {
          content: [{ type: "text" as const, text: "The user dismissed these questions." }],
          isError: true,
        }
      return skippedResult
    })
  const onMessage = (session: Session, message: NativeMessage): void => {
    const decoded = decodeNotification(message.method, message.params)
    if (decoded !== undefined && Either.isLeft(decoded)) {
      publish({
        type: "protocol-error",
        message: `Invalid ${message.method}: ${decoded.left.message}`,
        raw: message.params,
      })
      session.emit?.(nativeMethod(message.method), message.params, false)
      return
    }
    const envelope = decodeSessionReference(message.params)
    const params = Either.isRight(envelope) ? envelope.right : null
    if (
      typeof params?.sessionId === "string" &&
      session.sessionId &&
      params.sessionId !== session.sessionId
    ) {
      return
    }
    if (message.id !== undefined) {
      session.emit?.("cursor/acp/request/received", message, false)
      return
    }
    session.emit?.(
      session.replaying ? "cursor/acp/session/replay" : nativeMethod(message.method),
      message.params,
      decoded !== undefined && Either.isRight(decoded),
    )
  }
  const createSession = async (
    cwd: string,
    nativeId: string | null,
    emit: Emit | null,
    onCreated?: (session: Session) => void,
    options: { catalogOnly?: boolean } = {},
  ): Promise<Session> => {
    command ??= await dependencies.discover()
    if (stopping) throw new Error("Cursor is shutting down.")
    // The client's callbacks run only once it is connected, after `session` exists.
    const session: Session = {
      sessionId: nativeId ?? "",
      init: {},
      configuration: {},
      emit,
      replaying: nativeId !== null,
      interactive: onCreated !== undefined,
      client: new dependencies.Client(command, cwd, {
        message: (message) => onMessage(session, message),
        sessionUpdate: ({ sessionId, update }) => {
          if (sessionId === session.sessionId && update.sessionUpdate === "config_option_update")
            session.configuration = {
              ...session.configuration,
              configOptions: update.configOptions,
            }
          // Each client owns one session, and the list can arrive before session/new returns its ID.
          if (
            (!session.sessionId || sessionId === session.sessionId) &&
            update.sessionUpdate === "available_commands_update"
          ) {
            session.availableCommands = update.availableCommands
            session.onCommands?.()
          }
        },
        requestPermission: ({ params, signal }) =>
          onRequest(
            session,
            "session/request_permission",
            params,
            signal,
            (decision, _answers, optionId) => permissionResponse(params, decision, optionId),
          ),
        askQuestion: ({ params, signal }) =>
          onRequest(session, "cursor/ask_question", params, signal, (decision, answers) =>
            questionResponse(params, decision, answers),
          ),
        createPlan: ({ params, signal }) =>
          onRequest(session, "cursor/create_plan", params, signal, planResponse),
        spawned: (pid) => publish({ type: "process-started", pid }),
        stopped: (pid) => publish({ type: "process-stopped", pid }),
      }),
    }
    clients.add(session.client)
    onCreated?.(session)
    try {
      session.init = await session.client.initialize()
      if (options.catalogOnly) return session
      const questions = session.interactive
        ? await questionServer.register((asked, signal) => askQuestions(session, asked, signal))
        : null
      if (questions) session.releaseQuestions = questions.release
      const mcpServers = questions ? [questions.entry] : []
      if (nativeId && !canResume(session.init))
        throw new Error("This Cursor release cannot resume the saved conversation.")
      session.configuration = await session.client.run((agent) =>
        nativeId
          ? agent.request("session/load", { cwd, mcpServers, sessionId: nativeId })
          : agent.request("session/new", { cwd, mcpServers }),
      )
      session.sessionId = nativeId ?? sessionIdOf(session.configuration)
      if (!session.sessionId) throw new Error("Cursor returned no session ID.")
      session.replaying = false
      return session
    } catch (cause) {
      session.releaseQuestions?.()
      await session.client.close()
      clients.delete(session.client)
      throw cause
    }
  }
  const closeSession = async (session: Session): Promise<void> => {
    session.emit = null
    session.releaseQuestions?.()
    for (const [id, approval] of approvals) if (approval.session === session) approvals.delete(id)
    await session.client.close()
    clients.delete(session.client)
  }
  const probeFailed = (cause: unknown): void => {
    if (!stopping)
      publishStatus(
        status(
          command === null
            ? "missing"
            : /auth|login|sign.?in|credential/i.test(errorMessage(cause))
              ? "unauthenticated"
              : "error",
          `Could not connect to Cursor: ${errorMessage(cause)}`,
        ),
      )
  }
  const probe = (): Promise<void> => {
    if (probing || stopping) return probing ?? Promise.resolve()
    probing = (async () => {
      publishStatus(status("probing", "Connecting to Cursor CLI…"))
      let session: Session | undefined
      try {
        command = await dependencies.discover()
        session = await createSession(homedir(), null, null, undefined, { catalogOnly: true })
        const models = await discoverModels(session)
        if (!models.length) throw new Error("Cursor did not advertise any models.")
        // Cursor reports the signed-in account only through the CLI's status command.
        const account = await (dependencies.readAccountEmail ?? readCursorAccountEmail)(command)
        if (!stopping)
          publish({
            type: "provider-ready",
            providerKey: "cursor",
            models,
            status: status("ready", "Cursor CLI is ready.", account),
          })
      } catch (cause) {
        probeFailed(cause)
      } finally {
        if (session) await closeSession(session)
      }
    })().finally(() => {
      probing = null
    })
    return probing
  }
  const cancelInteractions = (session: Session): void => {
    for (const [id, approval] of approvals) {
      if (approval.session !== session) continue
      approval.respond("cancel")
      approvals.delete(id)
      session.emit?.("serverRequest/resolved", { requestId: id }, true)
    }
  }
  const sessionForTurn = async (
    dispatch: TurnDispatch,
    turn: RunningTurn,
    emit: Emit,
  ): Promise<Session> => {
    let session = sessions.get(dispatch.threadId)
    if (!session) {
      session = await createSession(
        dispatch.workspacePath,
        dispatch.nativeThreadId,
        emit,
        (created) => {
          turn.session = created
          if (turn.interrupted) void created.client.close()
        },
      )
      sessions.set(dispatch.threadId, session)
    }

    return session
  }
  const startTurn = (dispatch: TurnDispatch): void => {
    if (dispatch.harness !== "cursor") throw new Error("Turn routed to the wrong provider.")
    if (
      turns.has(dispatch.turnId) ||
      [...turns.values()].some((turn) => turn.dispatch.threadId === dispatch.threadId)
    )
      throw new Error("This Cursor thread is already running.")
    const turn: RunningTurn = { dispatch, interrupted: false, task: Promise.resolve() }
    turns.set(dispatch.turnId, turn)
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
          ...(method === "turn/completed" && !endedTurn(params) ? { promoteQueue: false } : {}),
          ...(requestId ? { requestId } : {}),
        },
      })
    emit("turn/started", { turn: { id: dispatch.turnId } })
    const runPrompt = async (session: Session) => {
      publish({
        type: "provider-session",
        threadId: dispatch.threadId,
        nativeThreadId: session.sessionId,
      })
      await configureModel(
        session,
        dispatch.model,
        cursorMode(dispatch.mode),
        dispatch.reasoningEffort,
        dispatch.speed,
      )
      emit("cursor/acp/session/configuration", session.configuration)
      const prompt = await cursorPrompt(dispatch, acceptsImages(session))
      if (turn.interrupted) throw new Error("Cursor turn interrupted.")
      const result = await session.client.run(
        (agent) => agent.request("session/prompt", { sessionId: session.sessionId, prompt }),
        0,
      )
      emit("cursor/acp/session/prompt/result", result)
      if (
        !["end_turn", "cancelled", "max_tokens", "max_turn_requests", "refusal"].includes(
          String(result.stopReason ?? ""),
        )
      )
        throw new Error("Cursor returned an unknown stop reason.")

      return result
    }
    const failTurn = async (cause: unknown): Promise<void> => {
      if (cause instanceof RequestError) emit("cursor/acp/error", cause.toErrorResponse())
      if (turn.session) {
        cancelInteractions(turn.session)
        sessions.delete(dispatch.threadId)
        await closeSession(turn.session)
      }
      emit("turn/completed", {
        turn: {
          status: turn.interrupted || stopping ? "interrupted" : "failed",
          error: errorMessage(cause),
        },
      })
    }
    turn.task = (async () => {
      let completed = false
      try {
        const session = await sessionForTurn(dispatch, turn, emit)
        turn.session = session
        session.emit = emit
        session.permissions = dispatch
        if (turn.interrupted) throw new Error("Cursor turn interrupted.")
        const result = await runPrompt(session)
        cancelInteractions(session)
        completed = true
        emit("turn/completed", {
          turn: {
            status:
              turn.interrupted || result.stopReason === "cancelled" ? "interrupted" : "completed",
          },
          cursor: result,
        })
      } catch (cause) {
        await failTurn(cause)
      } finally {
        if (completed && turn.session) turn.session.emit = null
        turns.delete(dispatch.turnId)
      }
    })()
  }
  const generateTitle = async (request: TitleRequest): Promise<void> => {
    let session: Session | undefined
    let title = ""
    try {
      session = await createSession(request.workspacePath, null, (method, params) => {
        const decoded = decodeCursorPayload(params)
        if (Either.isLeft(decoded)) return
        const update = decoded.right.update
        if (
          method === "cursor/acp/session/update" &&
          update?.sessionUpdate === "agent_message_chunk"
        )
          title += Schema.is(CursorContent)(update.content) ? (update.content.text ?? "") : ""
      })
      await configureModel(session, request.model, "ask")
      const activeSession = session
      await session.client.run(
        (agent) =>
          agent.request("session/prompt", {
            sessionId: activeSession.sessionId,
            prompt: [{ type: "text", text: request.prompt }],
          }),
        60_000,
      )
      if (!stopping && title.trim())
        publish({ type: "thread-title", threadId: request.threadId, title })
      else if (!stopping)
        publish({
          type: "title-failed",
          threadId: request.threadId,
          message: "The title model answered with no text.",
        })
    } catch (cause) {
      // The core keeps the derived title; the failure only settles the host's request.
      if (!stopping)
        publish({ type: "title-failed", threadId: request.threadId, message: errorMessage(cause) })
    } finally {
      if (session) await closeSession(session)
    }
  }
  const getUsage = async (requestId: string): Promise<void> => {
    const controller = new AbortController()
    usageRequests.set(requestId, controller)
    try {
      const usage = await (dependencies.readUsage ?? readCursorUsage)(controller.signal)
      if (!stopping && !controller.signal.aborted)
        publish({ type: "usage-result", requestId, usage })
    } catch (cause) {
      if (!stopping && !controller.signal.aborted)
        publish({ type: "usage-result", requestId, error: errorMessage(cause) })
    } finally {
      usageRequests.delete(requestId)
    }
  }
  /** Cursor only advertises commands on a live session, so open a throwaway one in the workspace. */
  const listCommands = async (requestId: string, workspacePath: string): Promise<void> => {
    let session: Session | undefined
    try {
      session = await createSession(workspacePath, null, null)
      const current = session
      if (current.availableCommands === undefined)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 3_000)
          current.onCommands = () => {
            clearTimeout(timer)
            resolve()
          }
        })
      const skills = await discoverCursorSkills(workspacePath)
      if (stopping) return
      const advertised = (current.availableCommands ?? []).flatMap((command) => {
        const name = command.name
        if (!name) return []
        const argumentHint = command.input?.hint ?? ""
        return [
          {
            name,
            description: command.description,
            ...(argumentHint ? { argumentHint } : {}),
          },
        ]
      })
      publish({ type: "commands-result", requestId, commands: cursorCommands(advertised, skills) })
    } catch (cause) {
      if (!stopping) publish({ type: "commands-result", requestId, error: errorMessage(cause) })
    } finally {
      if (session) await closeSession(session).catch(() => undefined)
    }
  }
  const shutdown = async (): Promise<void> => {
    stopping = true
    for (const controller of usageRequests.values()) controller.abort()
    usageRequests.clear()
    for (const turn of turns.values()) turn.interrupted = true
    await Promise.all([...clients].map((client) => client.close()))
    await Promise.all([...turns.values()].map((turn) => turn.task))
    await questionServer.close()
    sessions.clear()
    approvals.clear()
  }
  const interrupt = (turn: RunningTurn): void => {
    turn.interrupted = true
    if (!turn.session) return
    cancelInteractions(turn.session)
    const session = turn.session
    void session.client
      .run((agent) => agent.notify("session/cancel", { sessionId: session.sessionId }))
      .catch(() => {
        /* Failed turn settles through its task. */
      })
    const timer = setTimeout(() => {
      if (turns.has(turn.dispatch.turnId)) void turn.session?.client.close()
    }, 2_000)
    void turn.task.finally(() => clearTimeout(timer))
  }
  port.on("message", ({ data }) => {
    if (data === "probe-now") {
      void probe()
      return
    }
    const { input: message, acknowledge: ack } = workerCommand(port, data)
    if (message === null) {
      ack("Invalid Cursor worker command.")
      return
    }
    if (stopping && message.type !== "shutdown") {
      ack("Cursor is shutting down.")
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
        case "interrupt-turn": {
          const turn = turns.get(message.nativeTurnId)
          if (!turn) throw new Error("This Cursor turn is no longer running.")
          interrupt(turn)
          ack()
          break
        }
        case "resolve-approval": {
          const approval = approvals.get(String(message.requestId))
          if (!approval) throw new Error("This Cursor interaction is no longer pending.")
          approval.respond(message.decision, message.answers, message.optionId)
          approvals.delete(String(message.requestId))
          approval.session.emit?.("serverRequest/resolved", { requestId: message.requestId }, true)
          ack()
          break
        }
        case "get-usage":
          void getUsage(message.requestId)
          break
        case "cancel-usage":
          usageRequests.get(message.requestId)?.abort()
          break
        case "list-commands":
          void listCommands(message.requestId, message.workspacePath)
          break
        case "shutdown":
          void shutdown().then(
            () => ack(),
            (cause) => ack(errorMessage(cause)),
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

const Initialization = Schema.Struct({
  agentCapabilities: Schema.optional(
    Schema.Struct({ loadSession: Schema.optional(Schema.Boolean) }),
  ),
})
const canResume = (value: unknown): boolean => {
  const decoded = Schema.decodeUnknownEither(Initialization)(value)
  if (Either.isLeft(decoded))
    throw new Error(`Invalid Cursor initialization: ${decoded.left.message}`)
  return decoded.right.agentCapabilities?.loadSession === true
}
const sessionIdOf = (value: unknown): string => {
  const decoded = Schema.decodeUnknownEither(Schema.Struct({ sessionId: Schema.String }))(value)
  if (Either.isLeft(decoded)) throw new Error(`Invalid Cursor session: ${decoded.left.message}`)
  return decoded.right.sessionId
}
const endedTurn = (value: unknown): boolean => {
  const decoded = Schema.decodeUnknownEither(
    Schema.Struct({ cursor: Schema.Struct({ stopReason: Schema.String }) }),
  )(value)
  return Either.isRight(decoded) && decoded.right.cursor.stopReason === "end_turn"
}

const decodeSessionReference = Schema.decodeUnknownEither(
  Schema.Struct({ sessionId: Schema.optional(Schema.String) }),
)
