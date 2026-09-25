import {
  query,
  type Options,
  type PermissionResult,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import {
  errorMessage,
  type TitleRequest,
  type TurnDispatch,
  type WorkerCommand,
} from "@meldshell/contracts"
import { eventPublisher, workerCommand, type WorkerPort } from "@meldshell/provider-runtime"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import {
  accepts,
  answerProblem,
  permissionResult,
  toolApproval,
  type PendingApproval,
} from "./approvals"
import { discoverClaude, type ClaudeCommand } from "./discovery"
import { ClaudeEvents } from "./events"
import { loadModelHistory } from "./model-history"
import { claudeModels } from "./models"
import { claudeOptions, claudePrompt } from "./options"
import { spawnClaudeProcess } from "./process"
import { accountStatus, claudeStatus, discoveryStatus, missingInstall } from "./status"
import { claudeUsage } from "./usage"

/** An input that stays open, sending nothing, until the session ends. */
const idleInput = (signal: AbortSignal): AsyncIterable<SDKUserMessage> => ({
  async *[Symbol.asyncIterator]() {
    if (!signal.aborted)
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      )
  },
})

const resultError = (message: Extract<SDKMessage, { type: "result" }>): string | undefined => {
  if (message.subtype !== "success") return message.errors.join("\n")
  return message.is_error ? message.result : undefined
}

/** A session that only answers questions about Claude Code: no tools, no stored transcript. */
const quiet = (): Pick<Options, "tools" | "permissionMode" | "persistSession"> => ({
  tools: [],
  permissionMode: "dontAsk",
  persistSession: false,
})

type Emit = (method: string, params: unknown, validated?: boolean, requestId?: string) => void

interface RunningTurn {
  readonly controller: AbortController
  task: Promise<void>
  sessionId: string
  session?: Query
  interrupted: boolean
}

interface WaitingApproval {
  readonly pending: PendingApproval
  readonly resolve: (result: PermissionResult) => void
  /** Reports on the turn that raised the approval. */
  readonly emit: Emit
}

export const runClaudeWorker = (port: WorkerPort): { shutdown: () => Promise<void> } => {
  let stopping = false
  let probing: Promise<void> | null = null
  let discovered: ClaudeCommand | null = null
  const queries = new Set<Query>()
  const controllers = new Set<AbortController>()
  const usageRequests = new Map<string, AbortController>()
  const turns = new Map<string, RunningTurn>()
  const approvals = new Map<string, WaitingApproval>()
  const publish = eventPublisher(port)

  const spawnOptions = (): Pick<
    Options,
    "pathToClaudeCodeExecutable" | "spawnClaudeCodeProcess" | "env"
  > => {
    if (discovered === null) throw new Error("Claude Code is not ready.")
    return {
      // Always target the user's installed Claude Code. Never the SDK's bundled binary.
      pathToClaudeCodeExecutable: discovered.claudePath,
      // An inherited CLI nesting marker belongs to the terminal that launched MeldShell.
      env: { ...process.env, CLAUDECODE: undefined },
      spawnClaudeCodeProcess: spawnClaudeProcess({
        started: (pid) => publish({ type: "process-started", pid }),
        stopped: (pid) => publish({ type: "process-stopped", pid }),
      }),
    }
  }

  const closeQuery = (session: Query | undefined): void => {
    session?.close()
    if (session) queries.delete(session)
  }

  /**
   * Runs one short-lived session for `use`, ended by its deadline or by shutdown, and closes it
   * however `use` finishes. `options` runs first and may wait on the same deadline.
   */
  const withSession = async <A>(plan: {
    readonly timeoutMs: number
    readonly options: (signal: AbortSignal) => Partial<Options> | Promise<Partial<Options>>
    /** Defaults to an input that stays open until the session ends. */
    readonly prompt?: string
    /** Supplied when the caller must be able to cancel the session before it starts. */
    readonly controller?: AbortController
    readonly use: (session: Query) => Promise<A>
  }): Promise<A> => {
    const controller = plan.controller ?? new AbortController()
    controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), plan.timeoutMs)
    let session: Query | undefined
    try {
      const options = await plan.options(controller.signal)
      session = query({
        prompt: plan.prompt ?? idleInput(controller.signal),
        options: { ...spawnOptions(), ...options, abortController: controller },
      })
      queries.add(session)
      return await plan.use(session)
    } finally {
      clearTimeout(timeout)
      controller.abort()
      closeQuery(session)
      controllers.delete(controller)
    }
  }

  const probe = (): Promise<void> => {
    if (probing !== null) return probing
    if (stopping) return Promise.resolve()
    probing = (async () => {
      publish({
        type: "provider-status",
        status: claudeStatus(discovered, "probing", "Connecting to Claude Code..."),
      })
      try {
        await withSession({
          timeoutMs: 20_000,
          options: async (signal) => {
            discovered = await discoverClaude()
            const history = await loadModelHistory(signal)
            return {
              ...quiet(),
              cwd: homedir(),
              settingSources: ["user"],
              ...(history.length
                ? { settings: { modelPicker: { options: history.map((model) => ({ model })) } } }
                : {}),
            }
          },
          use: async (session) => {
            const [models, account] = await Promise.all([
              session.supportedModels(),
              session.accountInfo(),
            ])
            publish({
              type: "provider-ready",
              providerKey: "anthropic",
              models: claudeModels(models),
              status: accountStatus(discovered, account),
            })
          },
        })
      } catch (cause) {
        if (missingInstall(cause)) discovered = null
        if (!stopping)
          publish({ type: "provider-status", status: discoveryStatus(discovered, cause) })
      }
    })().finally(() => {
      probing = null
    })
    return probing
  }

  const startTurn = (dispatch: TurnDispatch): void => {
    if (turns.has(dispatch.turnId)) throw new Error("This Claude turn has already been delivered.")
    const controller = new AbortController()
    const state: RunningTurn = {
      controller,
      sessionId: dispatch.nativeThreadId ?? dispatch.turnId,
      task: Promise.resolve(),
      interrupted: false,
    }
    turns.set(dispatch.turnId, state)
    controllers.add(controller)
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
          requestId,
        },
      })
    const interrupted = (): boolean => state.interrupted || controller.signal.aborted
    const events = new ClaudeEvents(emit)
    emit("turn/started", { turn: { id: dispatch.turnId, status: "running" } })
    let completed = false
    const finish = (result: "completed" | "failed" | "interrupted", error?: string): void => {
      if (completed) return
      completed = true
      if (error && result === "failed") emit("error", { error: { message: error } })
      emit("turn/completed", { turn: { status: result, error } })
    }
    const startSession = (sessionId: string): void => {
      state.sessionId = sessionId
      publish({ type: "provider-session", threadId: dispatch.threadId, nativeThreadId: sessionId })
    }
    /** Handles one SDK message; true once the turn's result has arrived. */
    const accept = (message: SDKMessage): boolean => {
      if (message.type === "system" && message.subtype === "init") startSession(message.session_id)
      if (message.type === "conversation_reset") startSession(message.new_conversation_id)
      events.accept(message)
      if (message.type !== "result") return false
      const error = resultError(message)
      finish(interrupted() ? "interrupted" : error === undefined ? "completed" : "failed", error)
      return true
    }
    // Approving a plan returns Claude to the permissions the thread chose, as Claude Code does.
    const workingMode = claudeOptions({ ...dispatch, mode: "default" }).permissionMode ?? "default"
    const canUseTool: NonNullable<Options["canUseTool"]> = async (toolName, toolInput, context) => {
      if (interrupted() || context.signal.aborted)
        return { behavior: "deny", message: "Turn interrupted.", interrupt: true }
      const requestId = `claude:${randomUUID()}`
      const approval = toolApproval(toolName, toolInput, context.suggestions ?? [], workingMode)
      return new Promise<PermissionResult>((resolve) => {
        const abort = (): void => {
          emit("serverRequest/resolved", { requestId })
          settle({ behavior: "deny", message: "Turn interrupted.", interrupt: true })
        }
        const settle = (result: PermissionResult): void => {
          approvals.delete(requestId)
          context.signal.removeEventListener("abort", abort)
          controller.signal.removeEventListener("abort", abort)
          resolve(result)
        }
        approvals.set(requestId, { pending: approval.pending, resolve: settle, emit })
        context.signal.addEventListener("abort", abort, { once: true })
        controller.signal.addEventListener("abort", abort, { once: true })
        emit(approval.method, approval.params, true, requestId)
      })
    }
    const consume = async (session: Query): Promise<void> => {
      for await (const message of session) if (accept(message)) break
      if (!completed)
        finish(
          interrupted() ? "interrupted" : "failed",
          "Claude stopped before returning a turn result.",
        )
    }
    state.task = (async () => {
      let session: Query | undefined
      try {
        const options = claudeOptions(dispatch)
        const input = await claudePrompt(dispatch)
        if (controller.signal.aborted) {
          finish("interrupted")
          return
        }
        const prompt: AsyncIterable<SDKUserMessage> = {
          async *[Symbol.asyncIterator]() {
            yield input
            yield* idleInput(controller.signal)
          },
        }
        session = query({
          prompt,
          options: { ...spawnOptions(), ...options, abortController: controller, canUseTool },
        })
        state.session = session
        queries.add(session)
        await consume(session)
      } catch (cause) {
        finish(interrupted() ? "interrupted" : "failed", errorMessage(cause))
      } finally {
        controller.abort()
        closeQuery(session)
        controllers.delete(controller)
        turns.delete(dispatch.turnId)
      }
    })()
  }

  const generateTitle = (request: TitleRequest): Promise<void> =>
    withSession({
      timeoutMs: 60_000,
      prompt: request.prompt,
      options: () => ({
        ...quiet(),
        cwd: request.workspacePath,
        model: request.model,
        settingSources: [],
        maxTurns: 1,
      }),
      use: async (session) => {
        for await (const message of session) {
          if (message.type !== "result") continue
          if (message.subtype !== "success" || message.is_error)
            throw new Error("Claude could not generate a title.")
          publish({ type: "thread-title", threadId: request.threadId, title: message.result })
        }
      },
    }).catch((cause: unknown) =>
      publish({ type: "title-failed", threadId: request.threadId, message: errorMessage(cause) }),
    )

  const getUsage = (requestId: string): Promise<void> => {
    const controller = new AbortController()
    usageRequests.set(requestId, controller)
    return withSession({
      timeoutMs: 20_000,
      controller,
      options: () => ({ ...quiet(), cwd: homedir(), settingSources: ["user"] }),
      use: async (session) => {
        const response = await session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
          skipBehaviors: true,
        })
        publish({ type: "usage-result", requestId, usage: claudeUsage(response) })
      },
    })
      .catch((cause: unknown) =>
        publish({ type: "usage-result", requestId, error: errorMessage(cause) }),
      )
      .finally(() => usageRequests.delete(requestId))
  }

  const listCommands = (requestId: string, workspacePath: string): Promise<void> =>
    withSession({
      timeoutMs: 20_000,
      // Project and local settings contribute the workspace's own commands and skills.
      options: () => ({
        ...quiet(),
        cwd: workspacePath,
        settingSources: ["user", "project", "local"],
      }),
      use: async (session) => {
        const [commands, skills] = await Promise.all([
          session.supportedCommands(),
          session.reloadSkills().then(
            (response) => new Set(response.skills.map((skill) => skill.name)),
            () => new Set<string>(),
          ),
        ])
        publish({
          type: "commands-result",
          requestId,
          commands: commands.map((command) => ({
            kind: skills.has(command.name) ? "skill" : "command",
            name: command.name,
            description: command.description,
            ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
          })),
        })
      },
    }).catch((cause: unknown) =>
      publish({ type: "commands-result", requestId, error: errorMessage(cause) }),
    )

  const shutdown = async (): Promise<void> => {
    if (stopping) return
    stopping = true
    for (const controller of controllers) controller.abort()
    for (const session of queries) session.close()
    await Promise.allSettled([...turns.values()].map((turn) => turn.task))
  }

  const resolveApproval = (
    message: Extract<WorkerCommand, { type: "resolve-approval" }>,
    ack: (error?: string) => void,
  ): void => {
    const approval = approvals.get(String(message.requestId))
    if (!approval) {
      ack("This Claude interaction is no longer pending.")
      return
    }
    const accepted = accepts(message.decision)
    const problem = accepted ? answerProblem(approval.pending, message.answers) : null
    if (problem !== null) {
      ack(problem)
      return
    }
    approval.resolve(permissionResult(approval.pending, message.decision, message.answers))
    const { workingMode } = approval.pending
    if (accepted && workingMode !== undefined)
      approval.emit("claude/permission_mode", { permissionMode: workingMode })
    ack()
  }

  const interruptTurn = (nativeTurnId: string, ack: (error?: string) => void): void => {
    const turn = turns.get(nativeTurnId)
    // The session ID can change before its update reaches the core. The local turn ID is stable.
    if (!turn) {
      ack("This Claude turn is no longer running.")
      return
    }
    turn.interrupted = true
    if (turn.session === undefined) {
      turn.controller.abort()
      ack()
    } else
      void turn.session.interrupt().then(
        () => ack(),
        (cause: unknown) => ack(errorMessage(cause)),
      )
  }

  port.on("message", ({ data }) => {
    if (data === "probe-now") {
      void probe()
      return
    }
    const { input: message, acknowledge: ack } = workerCommand(port, data)
    if (message === null) {
      ack("Invalid Claude worker message.")
      return
    }
    if (stopping && message.type !== "shutdown") {
      ack("Claude is shutting down.")
      return
    }
    try {
      switch (message.type) {
        case "get-usage":
          void getUsage(message.requestId)
          break
        case "cancel-usage":
          usageRequests.get(message.requestId)?.abort()
          break
        case "list-commands":
          void listCommands(message.requestId, message.workspacePath)
          break
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
          resolveApproval(message, ack)
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
