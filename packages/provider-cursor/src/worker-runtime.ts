import { workerCommand, type WorkerPort } from "@meldshell/provider-runtime"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { RequestError, type RequestPermissionResponse } from "@agentclientprotocol/sdk"
import {
  asRecord,
  asRecords,
  asText,
  errorMessage,
  type CursorStatus,
  type TitleRequest,
  type TurnDispatch,
  type UnknownRecord,
} from "@meldshell/contracts"
import { effortOption, modelSelection, parameterizedModels } from "./model-config"
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
  cursorModels,
  cursorPrompt,
  interactionResponse,
  knownNotification,
  nativeMethod,
} from "./protocol"

type Emit = (method: string, params: unknown, validated?: boolean, requestId?: string) => void
interface Session {
  client: CursorClient
  sessionId: string
  init: UnknownRecord
  configuration: UnknownRecord
  emit: Emit | null
  replaying: boolean
  interactive: boolean
  permissions?: Pick<TurnDispatch, "sandbox" | "approvalPolicy">
  availableCommands?: readonly UnknownRecord[]
  onCommands?: () => void
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

const automaticPermission = (
  session: Session,
  params: UnknownRecord,
): { decision: string; optionId?: string } | null => {
  if (session.permissions?.approvalPolicy !== "never") return null
  const kind = session.permissions.sandbox === "danger-full-access" ? "allow_once" : "reject_once"
  const option = asRecords(params.options).find((entry) => entry.kind === kind)
  if (option) return { decision: "accept", optionId: asText(option.optionId) }
  return kind === "reject_once" ? { decision: "cancel" } : null
}

/** Cursor names MeldShell's default mode `agent`; plan and ask share their names. */
const cursorMode = (mode: TurnDispatch["mode"]): string => (mode === "default" ? "agent" : mode)

export const runCursorWorker = (
  port: WorkerPort,
  dependencies: {
    discover: typeof discoverCursor
    Client: typeof CursorClient
    readUsage?: typeof readCursorUsage
    readAccountEmail?: typeof readCursorAccountEmail
  } = { discover: discoverCursor, Client: CursorClient },
): { shutdown: () => Promise<void> } => {
  const publish = (value: unknown): void => port.postMessage(value)
  const sessions = new Map<string, Session>()
  const clients = new Set<CursorClient>()
  const turns = new Map<string, RunningTurn>()
  const approvals = new Map<string, PendingInteraction>()
  const usageRequests = new Map<string, AbortController>()
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
      method === "session/request_permission" ? automaticPermission(session, params) : null
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
  const onMessage = (session: Session, message: NativeMessage): void => {
    const params = asRecord(message.params)
    if (
      typeof params.sessionId === "string" &&
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
      knownNotification(message.method, message.params),
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
    const session: Session = {
      client: undefined as unknown as CursorClient,
      sessionId: nativeId ?? "",
      init: {},
      configuration: {},
      emit,
      replaying: nativeId !== null,
      interactive: onCreated !== undefined,
    }
    session.client = new dependencies.Client(command, cwd, {
      message: (message) => onMessage(session, message),
      sessionUpdate: ({ sessionId, update }) => {
        if (sessionId === session.sessionId && update.sessionUpdate === "config_option_update")
          session.configuration = { ...session.configuration, configOptions: update.configOptions }
        // Each client owns one session, and the list can arrive before session/new returns its ID.
        if (
          (!session.sessionId || sessionId === session.sessionId) &&
          update.sessionUpdate === "available_commands_update"
        ) {
          session.availableCommands = asRecords(update.availableCommands)
          session.onCommands?.()
        }
      },
      requestPermission: ({ params, signal }) =>
        onRequest(
          session,
          "session/request_permission",
          params,
          signal,
          (decision, answers, optionId): RequestPermissionResponse =>
            interactionResponse("session/request_permission", params, decision, answers, optionId),
        ),
      askQuestion: ({ params, signal }) =>
        onRequest(session, "cursor/ask_question", params, signal, (decision, answers, optionId) =>
          interactionResponse("cursor/ask_question", params, decision, answers, optionId),
        ),
      createPlan: ({ params, signal }) =>
        onRequest(session, "cursor/create_plan", params, signal, (decision) =>
          interactionResponse("cursor/create_plan", params, decision),
        ),
      spawned: (pid) => publish({ type: "app-server-started", pid }),
      stopped: (pid) => publish({ type: "app-server-stopped", pid }),
    })
    clients.add(session.client)
    onCreated?.(session)
    try {
      session.init = await session.client.initialize()
      if (options.catalogOnly) return session
      if (nativeId && asRecord(session.init.agentCapabilities).loadSession !== true)
        throw new Error("This Cursor release cannot resume the saved conversation.")
      session.configuration = await session.client.run((agent) =>
        nativeId
          ? agent.request("session/load", { cwd, mcpServers: [], sessionId: nativeId })
          : agent.request("session/new", { cwd, mcpServers: [] }),
      )
      session.sessionId = nativeId ?? asText(session.configuration.sessionId)
      if (!session.sessionId) throw new Error("Cursor returned no session ID.")
      session.replaying = false
      return session
    } catch (cause) {
      await session.client.close()
      clients.delete(session.client)
      throw cause
    }
  }
  const closeSession = async (session: Session): Promise<void> => {
    session.emit = null
    for (const [id, approval] of approvals) if (approval.session === session) approvals.delete(id)
    await session.client.close()
    clients.delete(session.client)
  }
  const configure = async (session: Session, model: string, mode: string): Promise<void> => {
    for (const [category, value, fallback] of [
      ["model", model, "session/set_model"],
      ["mode", mode, "session/set_mode"],
    ] as const) {
      const option = asRecords(session.configuration.configOptions).find(
        (entry) => entry.category === category || entry.id === category,
      )
      if (option) {
        const result = await session.client.run((agent) =>
          agent.request("session/set_config_option", {
            sessionId: session.sessionId,
            configId: asText(option.id),
            value,
          }),
        )
        session.configuration = { ...session.configuration, ...result }
      } else
        await session.client.run((agent) =>
          agent.request(fallback, {
            sessionId: session.sessionId,
            [category === "model" ? "modelId" : "modeId"]: value,
          }),
        )
    }
  }
  const configureModel = async (
    session: Session,
    model: string,
    mode: string,
    effort: string | null = null,
    speed?: "standard" | "fast",
  ): Promise<void> => {
    const selection = modelSelection(model)
    const modelOption = asRecords(session.configuration.configOptions).find(
      (option) => option.category === "model" || option.id === "model",
    )
    const parameterized = asRecords(modelOption?.options).some(
      (option) => option.value === selection.model,
    )
    await configure(session, parameterized ? selection.model : model, mode)
    if (!parameterized) return
    const options = asRecords(session.configuration.configOptions)
    const reasoning = effortOption(options)
    if (reasoning && effort !== null) selection.parameters.set(asText(reasoning.id), effort)
    if (speed && options.some((option) => option.id === "fast"))
      selection.parameters.set("fast", String(speed === "fast"))
    for (const [id, value] of selection.parameters) {
      const option = asRecords(session.configuration.configOptions).find((entry) => entry.id === id)
      if (!option || !asRecords(option.options).some((entry) => entry.value === value))
        throw new Error(
          `Cursor no longer supports ${id}=${value} for ${selection.model}. Refresh the model catalog.`,
        )
      const result = await session.client.run((agent) =>
        agent.request("session/set_config_option", {
          sessionId: session.sessionId,
          configId: id,
          value,
        }),
      )
      session.configuration = { ...session.configuration, ...result }
    }
  }
  const discoverModels = async (session: Session) => {
    const image =
      asRecord(asRecord(session.init.agentCapabilities).promptCapabilities).image === true
    let models
    try {
      const catalog = await session.client.run((agent) =>
        agent.request<UnknownRecord>("cursor/list_available_models", {}),
      )
      models = parameterizedModels(catalog, session.configuration, image)
    } catch (cause) {
      if (!(cause instanceof RequestError) || cause.code !== -32601) throw cause
      // Older releases only expose their model catalog through a new session.
      session.configuration = await session.client.run((agent) =>
        agent.request("session/new", {
          cwd: homedir(),
          mcpServers: [],
        }),
      )
      models = cursorModels(session.configuration, image)
    }

    return models
  }
  const probeFailed = (cause: unknown): void => {
    if (!stopping)
      publish(
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
      publish(status("probing", "Connecting to Cursor CLI…"))
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
        known: validated,
        input: {
          threadId: dispatch.threadId,
          turnId: dispatch.turnId,
          nativeTurnId: dispatch.turnId,
          method,
          params,
          validated,
          ...(method === "turn/completed" &&
          asRecord(asRecord(params).cursor).stopReason !== "end_turn"
            ? { promoteQueue: false }
            : {}),
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
      const prompt = await cursorPrompt(
        dispatch,
        asRecord(asRecord(session.init.agentCapabilities).promptCapabilities).image === true,
      )
      if (turn.interrupted) throw new Error("Cursor turn interrupted.")
      const result = await session.client.run(
        (agent) => agent.request("session/prompt", { sessionId: session.sessionId, prompt }),
        0,
      )
      emit("cursor/acp/session/prompt/result", result)
      if (
        !["end_turn", "cancelled", "max_tokens", "max_turn_requests", "refusal"].includes(
          asText(result.stopReason),
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
        const update = asRecord(asRecord(params).update)
        if (
          method === "cursor/acp/session/update" &&
          update.sessionUpdate === "agent_message_chunk"
        )
          title += asText(asRecord(update.content).text)
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
    } catch {
      /* The core already retained the derived title. */
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
        const name = asText(command.name)
        if (!name) return []
        const argumentHint = asText(asRecord(command.input).hint)
        return [
          {
            name,
            description: asText(command.description),
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
