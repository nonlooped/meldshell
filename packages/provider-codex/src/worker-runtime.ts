import { eventPublisher, workerCommand, type WorkerPort } from "@meldshell/provider-runtime"
import {
  errorMessage,
  toError,
  type CodexStatus,
  type TitleRequest,
  type TurnDispatch,
  type WorkerCommand,
} from "@meldshell/contracts"
import { Effect } from "effect"
import {
  CodexAppServer,
  listCodexModels,
  requestCodex,
  probeCodex,
  type AppServerCallbacks,
  type JsonRpcNotification,
  type JsonRpcServerRequest,
  type MessageValidation,
} from "./client"
import { encodeInteractionResponse } from "./interactions"
import { nativeThreadIdOf, nativeTurnIdOf } from "./messages"
import { codexSkillCommands } from "./skills"
import { TitleTurns } from "./title-turns"
import { inputItems, sandboxPolicy, threadSettings } from "./turn-input"
import { readCodexUsage } from "./usage"

type CodexConnection = Pick<
  CodexAppServer,
  "start" | "stop" | "request" | "respond" | "rejectRequest"
>

/** The interactions Codex may ask of the user; anything else is rejected at once. */
const INTERACTION_METHODS = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/tool/requestUserInput",
  "item/permissions/requestApproval",
])

/** Account notifications that change what `probe` would report. */
const AUTH_METHODS = new Set(["account/updated", "account/login/completed"])

/** Commands acknowledged when their work settles, not on receipt. */
const ACKNOWLEDGED_ON_COMPLETION = new Set<WorkerCommand["type"]>([
  "resolve-approval",
  "shutdown",
  "interrupt-turn",
  "steer-turn",
])

/** Messages held for a turn Codex has not yet accepted; more than this stops the server. */
const BUFFER_LIMIT = 256

interface BufferedMessage {
  readonly message: JsonRpcNotification | JsonRpcServerRequest
  readonly known: MessageValidation
}

/** A MeldShell turn running on a native Codex thread. */
interface LocalTurn {
  readonly threadId: string
  readonly turnId: string
  /** Set once Codex accepts the turn; messages before then are buffered. */
  nativeTurnId?: string
  buffered?: BufferedMessage[]
}

interface PendingInteraction {
  readonly id: string | number
  readonly method: string
  readonly params: unknown
  readonly turnId: string
}

export const runCodexWorker = (
  parentPort: WorkerPort,
  dependencies: {
    probe?: typeof probeCodex
    Server?: new (path: string, callbacks: AppServerCallbacks) => CodexConnection
  } = {},
): { readonly shutdown: () => Promise<void> } => {
  let appServer: CodexConnection | null = null
  let serverEpoch = 0
  let appServerReady: Promise<CodexConnection> | null = null
  let executablePath: string | null = null
  let stopping = false
  const turnsByNativeThread = new Map<string, LocalTurn>()
  const usageRequests = new Map<string, AbortController>()
  const interactions = new Map<string, PendingInteraction>()
  const publish = eventPublisher(parentPort)
  const publishStatus = (status: CodexStatus): void => publish({ type: "provider-status", status })
  const titles = new TitleTurns(publish)

  const reject = (message: JsonRpcServerRequest, code: number, reason: string): void =>
    appServer?.rejectRequest(message.id, code, reason)

  const finishLocalTurn = (nativeThreadId: string, turnId: string): void => {
    turnsByNativeThread.delete(nativeThreadId)
    for (const [key, interaction] of interactions)
      if (interaction.turnId === turnId) interactions.delete(key)
  }

  const buffer = (local: LocalTurn, entry: BufferedMessage): void => {
    const buffered = (local.buffered ??= [])
    if (buffered.length >= BUFFER_LIMIT) {
      void appServer?.stop()
      return
    }
    buffered.push(entry)
  }

  const routeNotification = (message: JsonRpcNotification, known: MessageValidation): void => {
    if (known === "malformed") {
      publish({ type: "protocol-error", message: "Malformed known notification", raw: message })
      return
    }
    const nativeThreadId = nativeThreadIdOf(message)
    if (nativeThreadId === null || titles.observe(nativeThreadId, message)) return
    const local = turnsByNativeThread.get(nativeThreadId)
    if (local === undefined) return
    const nativeTurnId = nativeTurnIdOf(message)
    if (local.nativeTurnId === undefined) {
      buffer(local, { message, known })
      return
    }
    if (nativeTurnId !== undefined && nativeTurnId !== local.nativeTurnId) return
    if (message.method === "turn/completed" && nativeTurnId === undefined) return
    publish({
      type: "runtime-event",
      input: {
        threadId: local.threadId,
        turnId: local.turnId,
        validated: known === "validated",
        method: message.method,
        params: message.params ?? {},
        nativeTurnId,
      },
    })
    if (known === "validated" && message.method === "turn/completed")
      finishLocalTurn(nativeThreadId, local.turnId)
  }

  const routeRequest = (message: JsonRpcServerRequest, known: MessageValidation): void => {
    if (known !== "validated" || !INTERACTION_METHODS.has(message.method)) {
      reject(
        message,
        known === "malformed" ? -32602 : -32601,
        "Unsupported or invalid interaction request.",
      )
      return
    }
    const nativeThreadId = nativeThreadIdOf(message)
    // A title turn is read-only and never approved by hand; asking the user to unblock a thread name
    // would be worse than losing the name.
    if (nativeThreadId !== null && titles.owns(nativeThreadId)) {
      reject(message, -32600, "Title turns cannot request interactions.")
      return
    }
    const local = nativeThreadId === null ? undefined : turnsByNativeThread.get(nativeThreadId)
    if (local === undefined) {
      reject(message, -32600, "No active turn owns this request.")
      return
    }
    if (local.nativeTurnId === undefined) {
      buffer(local, { message, known })
      return
    }
    if (nativeTurnIdOf(message) !== local.nativeTurnId) {
      reject(message, -32600, "Request does not belong to an accepted turn.")
      return
    }
    interactions.set(String(message.id), {
      id: message.id,
      method: message.method,
      params: message.params,
      turnId: local.turnId,
    })
    publish({
      type: "runtime-event",
      input: {
        threadId: local.threadId,
        turnId: local.turnId,
        validated: true,
        method: message.method,
        params: message.params ?? {},
        requestId: message.id,
      },
    })
  }

  const flushBuffered = (local: LocalTurn): void => {
    const buffered = local.buffered ?? []
    local.buffered = []
    for (const { message, known } of buffered) {
      if ("id" in message) routeRequest(message, known)
      else routeNotification(message, known)
    }
  }

  const serverExited = (code: number | null): void => {
    interactions.clear()
    appServer = null
    appServerReady = null
    if (stopping) return
    const reason = `Codex app-server exited unexpectedly${code === null ? "." : ` with code ${code}.`}`
    for (const local of turnsByNativeThread.values())
      publish({
        type: "turn-start-failed",
        threadId: local.threadId,
        turnId: local.turnId,
        message: reason,
      })
    turnsByNativeThread.clear()
    titles.failAll("The Codex app-server exited before naming the thread.")
  }

  const ensureAppServer = async (): Promise<CodexConnection> => {
    if (stopping) throw new Error("Codex is shutting down.")
    if (appServer !== null) return appServer
    if (appServerReady !== null) return appServerReady
    if (executablePath === null) throw new Error("Codex is not ready.")

    const epoch = ++serverEpoch
    const current = (): boolean => epoch === serverEpoch
    let serverPid: number | undefined
    const Server = dependencies.Server ?? CodexAppServer
    const server = new Server(executablePath, {
      onSpawn: (pid) => {
        serverPid = pid
        publish({ type: "process-started", pid })
      },
      onNotification: (message, known) => {
        if (!current()) return
        if (known === "validated" && AUTH_METHODS.has(message.method)) void probe(true)
        routeNotification(message, known)
      },
      onRequest: (message, known) => {
        if (current()) routeRequest(message, known)
      },
      onProtocolError: (message, raw) => publish({ type: "protocol-error", message, raw }),
      onExit: (code) => {
        if (serverPid !== undefined) publish({ type: "process-stopped", pid: serverPid })
        if (current()) serverExited(code)
      },
      onStderr: (line) => process.stderr.write(`${line}\n`),
    })
    appServerReady = server.start().then(
      () => {
        if (stopping || !current()) {
          void server.stop()
          throw new Error("Codex is shutting down or was replaced.")
        }
        appServer = server
        return server
      },
      async (cause: unknown) => {
        await server.stop()
        if (current()) appServerReady = null
        throw cause
      },
    )
    return appServerReady
  }

  /** Starts or resumes the native thread for a turn and returns its identifier. */
  const nativeThreadFor = async (
    server: CodexConnection,
    dispatch: TurnDispatch,
  ): Promise<string> => {
    if (dispatch.nativeThreadId !== null) {
      await requestCodex(server, "thread/resume", {
        threadId: dispatch.nativeThreadId,
        ...threadSettings(dispatch),
      })
      return dispatch.nativeThreadId
    }
    const result = await requestCodex(server, "thread/start", threadSettings(dispatch))
    if (typeof result.thread?.id !== "string")
      throw new Error("Codex started a thread without returning its identifier.")
    publish({
      type: "provider-session",
      threadId: dispatch.threadId,
      nativeThreadId: result.thread.id,
    })
    return result.thread.id
  }

  const startTurn = async (dispatch: TurnDispatch): Promise<void> => {
    try {
      if (dispatch.mode !== "default") throw new Error("Plan mode is not supported.")
      const server = await serverForRequest()
      const nativeThreadId = await nativeThreadFor(server, dispatch)
      turnsByNativeThread.set(nativeThreadId, {
        threadId: dispatch.threadId,
        turnId: dispatch.turnId,
      })
      const result = await requestCodex(server, "turn/start", {
        threadId: nativeThreadId,
        input: inputItems(dispatch),
        cwd: dispatch.workspacePath,
        model: dispatch.model,
        effort: dispatch.reasoningEffort,
        approvalPolicy: dispatch.approvalPolicy,
        sandboxPolicy: sandboxPolicy(dispatch),
        serviceTierForTurn: dispatch.serviceTier,
      })
      if (typeof result.turn?.id !== "string") throw new Error("Codex did not accept the turn.")
      const local = turnsByNativeThread.get(nativeThreadId)
      if (local?.turnId !== dispatch.turnId) return
      local.nativeTurnId = result.turn.id
      publish({
        type: "runtime-event",
        input: {
          threadId: dispatch.threadId,
          turnId: dispatch.turnId,
          validated: true,
          method: "turn/accepted",
          params: result,
          nativeTurnId: result.turn.id,
        },
      })
      flushBuffered(local)
    } catch (cause) {
      for (const [nativeId, local] of turnsByNativeThread)
        if (local.turnId === dispatch.turnId) turnsByNativeThread.delete(nativeId)
      publish({
        type: "turn-start-failed",
        threadId: dispatch.threadId,
        turnId: dispatch.turnId,
        message: errorMessage(cause),
      })
    }
  }

  /**
   * Names a thread on a throwaway Codex thread: read-only, never approved, and ephemeral so the
   * provider does not keep a stored session for a turn the user never sees.
   */
  const generateTitle = async (request: TitleRequest): Promise<void> => {
    let nativeThreadId: string | null = null
    try {
      const server = await serverForRequest()
      const started = await requestCodex(server, "thread/start", {
        cwd: request.workspacePath,
        model: request.model,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
      })
      if (typeof started.thread?.id !== "string")
        throw new Error("Codex started a title thread without returning its identifier.")
      nativeThreadId = started.thread.id
      titles.track(nativeThreadId, request.threadId)
      await requestCodex(server, "turn/start", {
        threadId: nativeThreadId,
        input: [{ type: "text", text: request.prompt }],
        cwd: request.workspacePath,
        model: request.model,
        effort: request.reasoningEffort,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly" },
        serviceTierForTurn: "default",
      })
    } catch (cause) {
      if (nativeThreadId === null)
        publish({ type: "title-failed", threadId: request.threadId, message: errorMessage(cause) })
      else titles.settle(nativeThreadId, null, errorMessage(cause))
    }
  }

  const probeEffect = Effect.gen(function* () {
    if (stopping) return
    const status = yield* dependencies.probe ?? probeCodex
    if (stopping) return
    executablePath = status.availability === "ready" ? status.executablePath : null
    if (status.availability !== "ready") {
      publishStatus(status)
      return
    }
    yield* Effect.tryPromise({
      try: async () => {
        const models = await listCodexModels(await ensureAppServer())
        if (!stopping) publish({ type: "provider-ready", status, providerKey: "openai", models })
      },
      catch: toError,
    }).pipe(
      Effect.catchAll((cause) =>
        Effect.sync(() =>
          publishStatus({
            ...status,
            availability: "error",
            detail: `Codex model discovery failed: ${cause.message}`,
          }),
        ),
      ),
    )
  })
  const probeAbort = new AbortController()
  let probing: Promise<void> | null = null
  let authRefreshPending = false
  const probe = (authChanged = false): Promise<void> => {
    if (stopping) return Promise.resolve()
    if (authChanged) authRefreshPending = true
    probing ??= Promise.resolve()
      .then(async () => {
        do {
          authRefreshPending = false
          await Effect.runPromise(probeEffect, { signal: probeAbort.signal })
          // Auth can change after login/status was read. Collapse such events into
          // one follow-up check rather than publishing that snapshot indefinitely.
        } while (authRefreshPending && !stopping)
      })
      .catch(() => undefined) // Shutdown interrupts an in-flight CLI discovery.
      .finally(() => {
        probing = null
      })
    return probing
  }
  const serverForRequest = async (): Promise<CodexConnection> => {
    // Discovery at startup, explicit refresh, auth changes, and reconnect only.
    // An idle, connected server needs no periodic CLI commands or model/list.
    if (appServer === null) await probe()
    return ensureAppServer()
  }
  void probe()

  const resolveInteraction = (
    input: Extract<WorkerCommand, { type: "resolve-approval" }>,
    acknowledge: (error?: string) => void,
  ): void => {
    const interaction = interactions.get(String(input.requestId))
    if (interaction === undefined) {
      acknowledge("This interaction is no longer pending.")
      return
    }
    try {
      if (appServer === null) throw new Error("Codex disconnected.")
      appServer.respond(
        interaction.id,
        encodeInteractionResponse(
          interaction.method,
          interaction.params,
          input.decision,
          input.answers,
        ),
      )
      interactions.delete(String(input.requestId))
      acknowledge()
    } catch (cause) {
      acknowledge(String(cause))
    }
  }

  const readUsage = (requestId: string): void => {
    const controller = new AbortController()
    usageRequests.set(requestId, controller)
    void serverForRequest()
      .then((server) => readCodexUsage(server, controller.signal))
      .then(
        (usage) => publish({ type: "usage-result", requestId, usage }),
        (cause: unknown) =>
          publish({ type: "usage-result", requestId, error: errorMessage(cause) }),
      )
      .finally(() => usageRequests.delete(requestId))
  }

  const listCommands = (requestId: string, workspacePath: string): void => {
    void serverForRequest()
      .then((server) =>
        server.request("skills/list", { cwds: [workspacePath] }, { timeoutMs: 15_000 }),
      )
      .then(
        (response) =>
          publish({ type: "commands-result", requestId, commands: codexSkillCommands(response) }),
        (cause: unknown) =>
          publish({ type: "commands-result", requestId, error: errorMessage(cause) }),
      )
  }

  parentPort.on("message", ({ data }) => {
    if (data === "probe-now") {
      void probe()
      return
    }
    const { input, acknowledge } = workerCommand(parentPort, data)
    if (input === null) {
      publish({
        type: "protocol-error",
        message: "MeldShell sent an invalid Codex worker message.",
      })
      return
    }
    if (input.type === "cancel-usage") {
      usageRequests.get(input.requestId)?.abort()
      return
    }
    if (stopping && input.type !== "shutdown") {
      acknowledge("Codex is shutting down.")
      return
    }
    if (!ACKNOWLEDGED_ON_COMPLETION.has(input.type)) acknowledge()
    switch (input.type) {
      case "shutdown":
        void shutdown().then(
          () => acknowledge(),
          (cause: unknown) => acknowledge(String(cause)),
        )
        break
      case "get-usage":
        readUsage(input.requestId)
        break
      case "list-commands":
        listCommands(input.requestId, input.workspacePath)
        break
      case "start-turn":
        void startTurn(input.dispatch)
        break
      case "generate-title":
        void generateTitle(input.request)
        break
      case "steer-turn":
        void serverForRequest()
          .then((server) =>
            server.request("turn/steer", {
              threadId: input.nativeThreadId,
              expectedTurnId: input.nativeTurnId,
              input: [{ type: "text", text: input.text, text_elements: [] }],
            }),
          )
          .then(
            () => acknowledge(),
            (cause: unknown) => acknowledge(errorMessage(cause)),
          )
        break
      case "interrupt-turn":
        void serverForRequest()
          .then((server) =>
            server.request("turn/interrupt", {
              threadId: input.nativeThreadId,
              turnId: input.nativeTurnId,
            }),
          )
          .then(
            () => acknowledge(),
            (cause: unknown) => acknowledge(errorMessage(cause)),
          )
        break
      case "resolve-approval":
        resolveInteraction(input, acknowledge)
        break
    }
  })

  const shutdown = async (): Promise<void> => {
    stopping = true
    for (const request of usageRequests.values()) request.abort()
    probeAbort.abort()
    await probing
    titles.clear()
    const server = appServer ?? (await appServerReady?.catch(() => null))
    await server?.stop()
    turnsByNativeThread.clear()
    interactions.clear()
  }
  return { shutdown }
}
