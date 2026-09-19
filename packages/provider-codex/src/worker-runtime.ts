import { workerCommand, type WorkerPort } from "@meldshell/provider-runtime"
import { type TitleRequest, type TurnDispatch } from "@meldshell/contracts"
import {
  CodexAppServer,
  listCodexModels,
  probeCodex,
  readCodexUsage,
  encodeInteractionResponse,
  type MessageValidation,
  type JsonRpcNotification,
  type JsonRpcServerRequest,
  type AppServerCallbacks,
} from "./index"
import { Effect } from "effect"

type CodexConnection = Pick<
  CodexAppServer,
  "start" | "stop" | "request" | "respond" | "rejectRequest"
>

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
  const localByNativeThread = new Map<
    string,
    {
      threadId: string
      turnId: string
      nativeTurnId?: string
      buffered?: Array<{ message: JsonRpcNotification; known: MessageValidation }>
    }
  >()
  const usageRequests = new Map<string, AbortController>()
  const serverRequestIds = new Map<
    string,
    { id: string | number; method: string; params: unknown; turnId: string }
  >()

  interface PendingTitle {
    readonly threadId: string
    text: string | null
    readonly timeout: ReturnType<typeof setTimeout>
  }

  /**
   * Title turns run on their own ephemeral Codex thread, keyed separately from conversation threads:
   * nothing they emit belongs in a transcript, and the user never sees them run.
   */
  const titleThreads = new Map<string, PendingTitle>()

  /** Codex answers a title turn long before this; the timer only stops a hung turn leaking an entry. */
  const TITLE_TIMEOUT_MS = 60_000

  const publish = (message: unknown): void => parentPort.postMessage(message)

  const threadIdFrom = (message: JsonRpcNotification): string | null => {
    const params = message.params
    if (typeof params !== "object" || params === null) return null
    const record = params as Record<string, unknown>
    if (typeof record.threadId === "string") return record.threadId
    const thread = record.thread
    return typeof thread === "object" && thread !== null && "id" in thread
      ? String((thread as Record<string, unknown>).id)
      : null
  }

  const nativeTurnIdFrom = (message: JsonRpcNotification): string | undefined => {
    const params = message.params
    if (typeof params !== "object" || params === null) return undefined
    const direct = (params as Record<string, unknown>).turnId
    if (typeof direct === "string") return direct
    const turn = (params as Record<string, unknown>).turn
    return typeof turn === "object" && turn !== null && "id" in turn
      ? String((turn as Record<string, unknown>).id)
      : undefined
  }

  const agentMessageText = (item: unknown): string | null => {
    if (typeof item !== "object" || item === null) return null
    const record = item as Record<string, unknown>
    return record.type === "agentMessage" && typeof record.text === "string" ? record.text : null
  }

  /** The completed turn repeats its items, so a dropped `item/completed` still yields a title. */
  const finalMessageText = (params: unknown): string | null => {
    if (typeof params !== "object" || params === null) return null
    const turn = (params as Record<string, unknown>).turn
    const items =
      typeof turn === "object" && turn !== null
        ? (turn as Record<string, unknown>).items
        : undefined
    if (!Array.isArray(items)) return null
    for (const item of [...items].reverse()) {
      const text = agentMessageText(item)
      if (text !== null) return text
    }
    return null
  }

  const settleTitle = (nativeThreadId: string, title: string | null, detail?: string): void => {
    const pending = titleThreads.get(nativeThreadId)
    if (pending === undefined) return
    clearTimeout(pending.timeout)
    titleThreads.delete(nativeThreadId)
    if (title === null || title.trim() === "") {
      publish({
        type: "title-failed",
        threadId: pending.threadId,
        message: detail ?? "The title model answered with no text.",
      })
      return
    }
    publish({ type: "thread-title", threadId: pending.threadId, title })
  }

  const updateTitle = (
    nativeThreadId: string,
    pendingTitle: NonNullable<ReturnType<typeof titleThreads.get>>,
    message: JsonRpcNotification,
  ): void => {
    if (message.method === "item/completed") {
      const params = message.params
      const item =
        typeof params === "object" && params !== null
          ? (params as Record<string, unknown>).item
          : undefined
      pendingTitle.text = agentMessageText(item) ?? pendingTitle.text
    }
    if (message.method === "turn/completed") {
      settleTitle(nativeThreadId, pendingTitle.text ?? finalMessageText(message.params))
    }
  }
  const finishLocalTurn = (nativeThreadId: string, turnId: string): void => {
    localByNativeThread.delete(nativeThreadId)
    for (const [key, request] of serverRequestIds)
      if (request.turnId === turnId) serverRequestIds.delete(key)
  }
  const bufferNotification = (
    local: NonNullable<ReturnType<typeof localByNativeThread.get>>,
    message: JsonRpcNotification,
    known: MessageValidation,
  ): void => {
    const buffered = (local.buffered ??= [])
    if (buffered.length >= 256) {
      void appServer?.stop()
      return
    }
    buffered.push({ message, known })
  }
  const routeNotification = (message: JsonRpcNotification, known: MessageValidation): void => {
    if (known === "malformed") {
      publish({ type: "protocol-error", message: "Malformed known notification", raw: message })
      return
    }
    const nativeThreadId = threadIdFrom(message)
    if (nativeThreadId === null) return
    const pendingTitle = titleThreads.get(nativeThreadId)
    if (pendingTitle !== undefined) {
      updateTitle(nativeThreadId, pendingTitle, message)
      return
    }
    const local = localByNativeThread.get(nativeThreadId)
    if (local === undefined) return
    const nativeTurnId = nativeTurnIdFrom(message)
    if (
      nativeTurnId !== undefined &&
      local.nativeTurnId !== undefined &&
      nativeTurnId !== local.nativeTurnId
    )
      return
    if (local.nativeTurnId === undefined) {
      bufferNotification(local, message, known)
      return
    }
    if (message.method === "turn/completed" && nativeTurnId === undefined) return
    publish({
      type: "runtime-event",
      known,
      input: {
        threadId: local.threadId,
        turnId: local.turnId,
        validated: known === "validated",
        method: message.method,
        params: message.params ?? {},
        nativeTurnId: nativeTurnIdFrom(message),
      },
    })
    if (known === "validated" && message.method === "turn/completed") {
      finishLocalTurn(nativeThreadId, local.turnId)
    }
  }

  const routeRequest = (message: JsonRpcServerRequest, known: MessageValidation): void => {
    if (
      known !== "validated" ||
      ![
        "item/commandExecution/requestApproval",
        "item/fileChange/requestApproval",
        "item/tool/requestUserInput",
        "item/permissions/requestApproval",
      ].includes(message.method)
    ) {
      appServer?.rejectRequest(
        message.id,
        known === "malformed" ? -32602 : -32601,
        "Unsupported or invalid interaction request.",
      )
      return
    }
    const nativeThreadId = threadIdFrom(message)
    if (nativeThreadId === null) {
      appServer?.rejectRequest(message.id, -32600, "No active turn owns this request.")
      return
    }
    // A title turn is read-only and never approved by hand; asking the user to unblock a thread name
    // would be worse than losing the name.
    if (titleThreads.has(nativeThreadId)) {
      appServer?.rejectRequest(message.id, -32600, "Title turns cannot request interactions.")
      return
    }
    const local = localByNativeThread.get(nativeThreadId)
    if (local === undefined) {
      appServer?.rejectRequest(message.id, -32600, "No active turn owns this request.")
      return
    }
    const nativeTurnId = nativeTurnIdFrom(message)
    if (local.nativeTurnId === undefined) {
      const buffered = (local.buffered ??= [])
      if (buffered.length >= 256) {
        void appServer?.stop()
        return
      }
      buffered.push({ message, known })
      return
    }
    if (nativeTurnId !== local.nativeTurnId) {
      appServer?.rejectRequest(message.id, -32600, "Request does not belong to an accepted turn.")
      return
    }
    serverRequestIds.set(String(message.id), {
      id: message.id,
      method: message.method,
      params: message.params,
      turnId: local.turnId,
    })
    publish({
      type: "runtime-event",
      known,
      input: {
        threadId: local.threadId,
        turnId: local.turnId,
        validated: known === "validated",
        method: message.method,
        params: message.params ?? {},
        requestId: message.id,
      },
    })
  }

  const ensureAppServer = async (): Promise<CodexConnection> => {
    if (stopping) throw new Error("Codex is shutting down.")
    if (appServer !== null) return appServer
    if (appServerReady !== null) return appServerReady
    if (executablePath === null) throw new Error("Codex is not ready.")

    const epoch = ++serverEpoch
    let serverPid: number | undefined
    const Server = dependencies.Server ?? CodexAppServer
    const server = new Server(executablePath, {
      onSpawn: (pid) => {
        serverPid = pid
        publish({ type: "app-server-started", pid })
      },
      onNotification: (message, known) => {
        if (epoch !== serverEpoch) return
        if (
          known === "validated" &&
          ["account/updated", "account/login/completed"].includes(message.method)
        )
          void probe(true)
        routeNotification(message, known)
      },
      onRequest: (message, known) => {
        if (epoch === serverEpoch) routeRequest(message, known)
      },
      onProtocolError: (message, raw) => publish({ type: "protocol-error", message, raw }),
      onExit: (code) => {
        publish({ type: "app-server-stopped", pid: serverPid })
        if (epoch !== serverEpoch) return
        serverRequestIds.clear()
        appServer = null
        appServerReady = null
        if (!stopping) {
          for (const local of localByNativeThread.values()) {
            publish({
              type: "turn-start-failed",
              threadId: local.threadId,
              turnId: local.turnId,
              message: `Codex app-server exited unexpectedly${code === null ? "." : ` with code ${code}.`}`,
            })
          }
          localByNativeThread.clear()
          for (const nativeThreadId of [...titleThreads.keys()]) {
            settleTitle(
              nativeThreadId,
              null,
              "The Codex app-server exited before naming the thread.",
            )
          }
          publish({ type: "app-server-exit", code })
        }
      },
      onStderr: (line) => process.stderr.write(`${line}\n`),
    })
    appServerReady = server.start().then(
      () => {
        if (stopping || epoch !== serverEpoch) {
          void server.stop()
          throw new Error("Codex is shutting down or was replaced.")
        }
        appServer = server
        return server
      },
      async (cause: unknown) => {
        await server.stop()
        if (epoch === serverEpoch) appServerReady = null
        throw cause
      },
    )
    return appServerReady
  }

  const inputItems = (dispatch: TurnDispatch): ReadonlyArray<Record<string, unknown>> => [
    ...(dispatch.text === "" ? [] : [{ type: "text", text: dispatch.text }]),
    ...dispatch.attachments.map((attachment) => {
      switch (attachment.type) {
        case "image":
          return { type: "image", url: attachment.value }
        case "localImage":
          return { type: "localImage", path: attachment.value }
        case "mention":
          return {
            type: "mention",
            name: attachment.name ?? attachment.value,
            path: attachment.value,
          }
        case "skill":
          return {
            type: "skill",
            name: attachment.name ?? attachment.value,
            path: attachment.value,
          }
      }
    }),
  ]

  const sandboxPolicy = (dispatch: TurnDispatch): Record<string, unknown> => {
    switch (dispatch.sandbox) {
      case "read-only":
        return { type: "readOnly" }
      case "workspace-write":
        return { type: "workspaceWrite" }
      case "danger-full-access":
        return { type: "dangerFullAccess" }
    }
  }

  const resumeThread = async (
    server: Awaited<ReturnType<typeof ensureAppServer>>,
    dispatch: TurnDispatch,
  ): Promise<string> => {
    let nativeThreadId = dispatch.nativeThreadId
    if (nativeThreadId === null) {
      const result = (await server.request("thread/start", {
        cwd: dispatch.workspacePath,
        model: dispatch.model,
        approvalPolicy: dispatch.approvalPolicy,
        sandbox: dispatch.sandbox,
        serviceTier: dispatch.serviceTier,
      })) as { readonly thread?: { readonly id?: unknown } }
      if (typeof result.thread?.id !== "string") {
        throw new Error("Codex started a thread without returning its identifier.")
      }
      nativeThreadId = result.thread.id
      publish({ type: "provider-session", threadId: dispatch.threadId, nativeThreadId })
    } else {
      await server.request("thread/resume", {
        threadId: nativeThreadId,
        cwd: dispatch.workspacePath,
        model: dispatch.model,
        approvalPolicy: dispatch.approvalPolicy,
        sandbox: dispatch.sandbox,
        serviceTier: dispatch.serviceTier,
      })
    }

    return nativeThreadId
  }
  const flushBuffered = (local: NonNullable<ReturnType<typeof localByNativeThread.get>>): void => {
    const buffered = local.buffered ?? []
    local.buffered = []
    for (const event of buffered) {
      if ("id" in event.message) routeRequest(event.message as JsonRpcServerRequest, event.known)
      else routeNotification(event.message, event.known)
    }
  }
  const startTurn = async (dispatch: TurnDispatch): Promise<void> => {
    try {
      if (dispatch.mode !== "default") throw new Error("Plan mode is not supported.")
      const server = await serverForRequest()
      const nativeThreadId = await resumeThread(server, dispatch)

      localByNativeThread.set(nativeThreadId, {
        threadId: dispatch.threadId,
        turnId: dispatch.turnId,
      })
      const result = (await server.request("turn/start", {
        threadId: nativeThreadId,
        input: inputItems(dispatch),
        cwd: dispatch.workspacePath,
        model: dispatch.model,
        effort: dispatch.reasoningEffort,
        approvalPolicy: dispatch.approvalPolicy,
        sandboxPolicy: sandboxPolicy(dispatch),
        serviceTierForTurn: dispatch.serviceTier,
      })) as { readonly turn?: { readonly id?: unknown } }
      if (typeof result.turn?.id !== "string") throw new Error("Codex did not accept the turn.")
      const local = localByNativeThread.get(nativeThreadId)
      if (local?.turnId === dispatch.turnId) local.nativeTurnId = result.turn.id
      if (local?.turnId === dispatch.turnId) {
        publish({
          type: "runtime-event",
          known: true,
          input: {
            threadId: dispatch.threadId,
            turnId: dispatch.turnId,
            method: "turn/accepted",
            params: result,
            nativeTurnId: result.turn.id,
          },
        })
        flushBuffered(local)
      }
    } catch (cause) {
      for (const [nativeId, local] of localByNativeThread)
        if (local.turnId === dispatch.turnId) localByNativeThread.delete(nativeId)
      publish({
        type: "turn-start-failed",
        threadId: dispatch.threadId,
        turnId: dispatch.turnId,
        message: cause instanceof Error ? cause.message : String(cause),
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
      const started = (await server.request("thread/start", {
        cwd: request.workspacePath,
        model: request.model,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
      })) as { readonly thread?: { readonly id?: unknown } }
      if (typeof started.thread?.id !== "string") {
        throw new Error("Codex started a title thread without returning its identifier.")
      }
      nativeThreadId = started.thread.id
      const timedOutThreadId = nativeThreadId
      const timeout = setTimeout(
        () => settleTitle(timedOutThreadId, null, "The title model did not answer in time."),
        TITLE_TIMEOUT_MS,
      )
      titleThreads.set(nativeThreadId, {
        threadId: request.threadId,
        text: null,
        timeout,
      })
      await server.request("turn/start", {
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
      const message = cause instanceof Error ? cause.message : String(cause)
      if (nativeThreadId === null)
        publish({ type: "title-failed", threadId: request.threadId, message })
      else settleTitle(nativeThreadId, null, message)
    }
  }

  const probeEffect = Effect.gen(function* () {
    if (stopping) return
    const status = yield* dependencies.probe ?? probeCodex
    if (stopping) return
    executablePath = status.availability === "ready" ? status.executablePath : null
    if (status.availability !== "ready") {
      publish(status)
      return
    }
    yield* Effect.tryPromise({
      try: async () => {
        const server = await ensureAppServer()
        const models = await listCodexModels(server)
        if (!stopping) publish({ type: "provider-ready", status, providerKey: "openai", models })
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    }).pipe(
      Effect.catchAll((cause) =>
        Effect.sync(() =>
          publish({
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

  const resolveApproval = (
    input: Extract<
      NonNullable<ReturnType<typeof workerCommand>["input"]>,
      { type: "resolve-approval" }
    >,
    acknowledge: (error?: string) => void,
  ): void => {
    const requestId = serverRequestIds.get(String(input.requestId))
    if (requestId !== undefined) {
      try {
        if (appServer === null) throw new Error("Codex disconnected.")
        appServer.respond(
          requestId.id,
          encodeInteractionResponse(
            requestId.method,
            requestId.params,
            input.decision,
            input.answers,
          ),
        )
        serverRequestIds.delete(String(input.requestId))
        acknowledge()
      } catch (cause) {
        acknowledge(String(cause))
      }
    } else acknowledge("This interaction is no longer pending.")
  }
  parentPort.on("message", (event: { readonly data: unknown }) => {
    const message = event.data as Record<string, unknown> | string
    if (
      typeof message === "object" &&
      message !== null &&
      message.type === "cancel-usage" &&
      typeof message.requestId === "string"
    ) {
      usageRequests.get(message.requestId)?.abort()
      return
    }
    if (message === "probe-now") {
      void probe()
      return
    }
    const { input, acknowledge } = workerCommand(parentPort, message)
    if (input === null) {
      publish({
        type: "protocol-error",
        message: "MeldShell sent an invalid Codex worker message.",
      })
      return
    }
    if (stopping && input.type !== "shutdown") {
      acknowledge("Codex is shutting down.")
      return
    }
    if (
      input.type !== "resolve-approval" &&
      input.type !== "shutdown" &&
      input.type !== "interrupt-turn"
    )
      acknowledge()
    switch (input.type) {
      case "shutdown":
        void shutdown().then(
          () => acknowledge(),
          (cause: unknown) => acknowledge(String(cause)),
        )
        break
      case "get-usage": {
        const controller = new AbortController()
        usageRequests.set(input.requestId, controller)
        void serverForRequest()
          .then((server) => readCodexUsage(server, controller.signal))
          .then(
            (usage) => publish({ type: "usage-result", requestId: input.requestId, usage }),
            (cause: unknown) =>
              publish({
                type: "usage-result",
                requestId: input.requestId,
                error: cause instanceof Error ? cause.message : String(cause),
              }),
          )
          .finally(() => usageRequests.delete(input.requestId))
        break
      }
      case "start-turn":
        void startTurn(input.dispatch)
        break
      case "generate-title":
        void generateTitle(input.request)
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
            (cause: unknown) => acknowledge(cause instanceof Error ? cause.message : String(cause)),
          )
        break
      case "resolve-approval": {
        resolveApproval(input, acknowledge)
        break
      }
    }
  })

  const shutdown = async (): Promise<void> => {
    stopping = true
    for (const request of usageRequests.values()) request.abort()
    probeAbort.abort()
    await probing
    for (const pending of titleThreads.values()) clearTimeout(pending.timeout)
    titleThreads.clear()
    const server = appServer ?? (await appServerReady?.catch(() => null))
    await server?.stop()
    localByNativeThread.clear()
    serverRequestIds.clear()
  }
  return { shutdown }
}
