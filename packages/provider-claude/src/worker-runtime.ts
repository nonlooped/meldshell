import { workerCommand, type WorkerPort } from "@meldshell/provider-runtime"
import {
  query,
  type Options,
  type PermissionMode,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKUserMessage,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk"
import {
  errorMessage,
  type TitleRequest,
  type TurnDispatch,
  type ClaudeStatus,
} from "@meldshell/contracts"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { claudeModels } from "./models"
import { claudeOptions, claudePrompt } from "./options"
import { ClaudeEvents } from "./events"
import { claudeUsage } from "./usage"
import { loadModelHistory } from "./model-history"
import { discoverClaude, type ClaudeCommand } from "./discovery"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"

const idleInput = (signal: AbortSignal): AsyncIterable<SDKUserMessage> => ({
  async *[Symbol.asyncIterator]() {
    if (!signal.aborted)
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      )
  },
})

const toolQuestions = (toolName: string, toolInput: Record<string, unknown>) => {
  return toolName === "AskUserQuestion" && Array.isArray(toolInput.questions)
    ? toolInput.questions.map((value: Record<string, unknown>, index: number) => ({
        id: String(index),
        header: String(value.header ?? "Question"),
        question: String(value.question ?? ""),
        multiSelect: value.multiSelect === true,
        options: Array.isArray(value.options)
          ? value.options.map((option: Record<string, unknown>) => ({
              label: String(option.label ?? ""),
              description: String(option.description ?? ""),
            }))
          : [],
      }))
    : []
}
const approvalMethod = (toolName: string, asksQuestions: boolean): string => {
  if (toolName === "ExitPlanMode") return "claude/exit_plan_mode"
  if (asksQuestions) return "item/tool/requestUserInput"
  if (toolName === "Bash") return "item/commandExecution/requestApproval"
  if (["Edit", "Write", "NotebookEdit"].includes(toolName)) return "item/fileChange/requestApproval"
  return "item/permissions/requestApproval"
}
const resultError = (message: Extract<SDKMessage, { type: "result" }>): string | undefined => {
  return message.subtype === "success"
    ? message.is_error
      ? message.result
      : undefined
    : message.errors.join("\n")
}
export const runClaudeWorker = (port: WorkerPort): { shutdown: () => Promise<void> } => {
  let stopping = false
  let probing: Promise<void> | null = null
  let discovered: ClaudeCommand | null = null
  const queries = new Set<Query>()
  const controllers = new Set<AbortController>()
  const usageRequests = new Map<string, AbortController>()
  const turns = new Map<
    string,
    {
      controller: AbortController
      task: Promise<void>
      sessionId: string
      session?: Query
      interrupted: boolean
    }
  >()
  const approvals = new Map<
    string,
    {
      resolve: (result: PermissionResult) => void
      input: Record<string, unknown>
      suggestions: PermissionUpdate[]
      questions: Array<{ id: string; question: string }>
      /** Set for a plan review: the mode Claude works in once the plan is approved. */
      planApproved?: { mode: PermissionMode; emit: (method: string, params: unknown) => void }
    }
  >()
  const publish = (value: unknown): void => port.postMessage(value)
  const status = (
    availability: ClaudeStatus["availability"],
    detail: string,
    accountEmail: string | null = null,
  ): ClaudeStatus => ({
    provider: "anthropic",
    harness: "claude-code",
    availability,
    detail,
    executablePath: discovered?.executablePath ?? null,
    version: discovered?.version ?? null,
    accountEmail,
    checkedAt: new Date().toISOString(),
  })
  const spawnOptions = (): Pick<
    Options,
    "pathToClaudeCodeExecutable" | "spawnClaudeCodeProcess" | "env"
  > => {
    if (discovered === null) throw new Error("Claude Code is not ready.")
    const cli = discovered
    return {
      // Always target the user's installed Claude Code. Never the SDK's bundled binary.
      // The SDK wraps JavaScript entrypoints with Node and supplies the final command/args.
      pathToClaudeCodeExecutable: cli.claudePath,
      // An inherited CLI nesting marker belongs to the terminal that launched MeldShell.
      env: { ...process.env, CLAUDECODE: undefined },
      spawnClaudeCodeProcess: (options) => {
        // Use the SDK's resolved command/args so .js targets become `node <script> …`.
        const child = spawn(options.command, options.args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          signal: options.signal,
        })
        if (process.platform === "win32") {
          const kill = child.kill.bind(child)
          let killing = false
          // The SDK's forwarded abort calls child.kill(). TerminateProcess alone leaves tool
          // descendants holding stdout open, so the query iterator never finishes cancelling.
          child.kill = (signal) => {
            if (child.exitCode !== null || child.signalCode !== null) return false
            if (child.pid === undefined) return kill(signal)
            if (!killing) {
              killing = true
              void stopProcessTree(child.pid).catch((cause) => {
                console.error("Could not stop the Claude process tree.", cause)
                kill(signal)
              })
            }
            return true
          }
        }
        // Drain stderr without logging prompts, credentials, or tool output to the host console.
        child.stderr.resume()
        if (child.pid) publish({ type: "app-server-started", pid: child.pid })
        child.once("exit", () => {
          if (child.pid) publish({ type: "app-server-stopped", pid: child.pid })
        })
        return child
      },
    }
  }

  const isAuthenticated = (account: Awaited<ReturnType<Query["accountInfo"]>>): boolean => {
    return Boolean(
      account.email ||
        (account.tokenSource && account.tokenSource !== "none") ||
        (account.apiKeySource && account.apiKeySource !== "none") ||
        (account.apiProvider && account.apiProvider !== "firstParty"),
    )
  }
  const closeQuery = (session: Query | undefined): void => {
    session?.close()
    if (session) queries.delete(session)
  }
  const discoveryStatus = (cause: unknown): ClaudeStatus => {
    const message = errorMessage(cause)
    if (/not installed|not available on PATH/i.test(message)) return status("missing", message)
    if (/override could not be resolved/i.test(message)) return status("error", message)
    return status("error", `Could not connect to Claude Code: ${message}`)
  }

  const accountStatus = (account: Awaited<ReturnType<Query["accountInfo"]>>): ClaudeStatus => {
    const authenticated = isAuthenticated(account)
    return status(
      authenticated ? "ready" : "unauthenticated",
      authenticated
        ? "Claude Code is ready."
        : "Sign in with claude auth login in a terminal, then check again. You can also configure an Anthropic API key.",
      account.email ?? null,
    )
  }

  const probe = (): Promise<void> => {
    if (probing !== null) return probing
    if (stopping) return Promise.resolve()
    probing = (async () => {
      publish(status("probing", "Connecting to Claude Code..."))
      const controller = new AbortController()
      controllers.add(controller)
      const timeout = setTimeout(() => controller.abort(), 20_000)
      let session: Query | undefined
      try {
        discovered = await discoverClaude()
        const history = await loadModelHistory(controller.signal)
        session = query({
          prompt: idleInput(controller.signal),
          options: {
            ...spawnOptions(),
            cwd: homedir(),
            abortController: controller,
            settingSources: ["user"],
            ...(history.length
              ? {
                  settings: {
                    modelPicker: {
                      options: history.map((model) => ({ model })),
                    },
                  },
                }
              : {}),
            tools: [],
            permissionMode: "dontAsk",
            persistSession: false,
          },
        })
        queries.add(session)
        const [models, account] = await Promise.all([
          session.supportedModels(),
          session.accountInfo(),
        ])
        publish({
          type: "provider-ready",
          providerKey: "anthropic",
          models: claudeModels(models),
          status: accountStatus(account),
        })
      } catch (cause) {
        if (/not installed|override could not be resolved/i.test(errorMessage(cause)))
          discovered = null
        if (!stopping) publish(discoveryStatus(cause))
      } finally {
        clearTimeout(timeout)
        controller.abort()
        closeQuery(session)
        controllers.delete(controller)
      }
    })().finally(() => {
      probing = null
    })
    return probing
  }

  const startTurn = (dispatch: typeof TurnDispatch.Type): void => {
    if (turns.has(dispatch.turnId)) throw new Error("This Claude turn has already been delivered.")
    const controller = new AbortController()
    const state: NonNullable<ReturnType<typeof turns.get>> = {
      controller,
      sessionId: dispatch.nativeThreadId ?? dispatch.turnId,
      task: Promise.resolve(),
      interrupted: false,
    }
    turns.set(dispatch.turnId, state)
    controllers.add(controller)
    const emit = (method: string, params: unknown, validated = true, requestId?: string): void =>
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
    const accept = (message: SDKMessage): boolean => {
      if (message.type === "system" && message.subtype === "init") {
        state.sessionId = message.session_id
        publish({
          type: "provider-session",
          threadId: dispatch.threadId,
          nativeThreadId: message.session_id,
        })
      }
      if (message.type === "conversation_reset") {
        state.sessionId = message.new_conversation_id
        publish({
          type: "provider-session",
          threadId: dispatch.threadId,
          nativeThreadId: state.sessionId,
        })
      }
      events.accept(message)
      if (message.type === "result") {
        const error = resultError(message)
        finish(interrupted() ? "interrupted" : error === undefined ? "completed" : "failed", error)
        return true
      }

      return false
    }
    // Approving a plan returns Claude to the permissions the thread chose, as Claude Code does.
    const workingMode = claudeOptions({ ...dispatch, mode: "default" }).permissionMode ?? "default"
    const canUseTool: NonNullable<Options["canUseTool"]> = async (toolName, toolInput, context) => {
      if (interrupted() || context.signal.aborted)
        return { behavior: "deny", message: "Turn interrupted.", interrupt: true }
      const requestId = `claude:${randomUUID()}`
      const questions = toolQuestions(toolName, toolInput)
      const plan = toolName === "ExitPlanMode"
      const method = approvalMethod(toolName, questions.length > 0)
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
        approvals.set(requestId, {
          resolve: settle,
          input: toolInput,
          suggestions: context.suggestions ?? [],
          questions,
          ...(plan ? { planApproved: { mode: workingMode, emit } } : {}),
        })
        context.signal.addEventListener("abort", abort, { once: true })
        controller.signal.addEventListener("abort", abort, { once: true })
        emit(
          method,
          {
            approvalScope: "turn",
            reason: `Claude Code wants to use ${toolName}.\n${JSON.stringify(toolInput, null, 2)}`,
            command: toolInput.command,
            permissions: { tool: toolName, input: toolInput },
            questions,
            ...(plan ? { plan: typeof toolInput.plan === "string" ? toolInput.plan : "" } : {}),
            toolName,
            input: toolInput,
          },
          true,
          requestId,
        )
      })
    }
    const consume = async (session: Query): Promise<void> => {
      for await (const message of session) {
        if (accept(message)) break
      }
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
          options: {
            ...spawnOptions(),
            ...options,
            abortController: controller,
            canUseTool,
          },
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

  const generateTitle = async (request: typeof TitleRequest.Type): Promise<void> => {
    const controller = new AbortController()
    controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), 60_000)
    let session: Query | undefined
    try {
      session = query({
        prompt: request.prompt,
        options: {
          ...spawnOptions(),
          cwd: request.workspacePath,
          model: request.model,
          tools: [],
          permissionMode: "dontAsk",
          settingSources: [],
          persistSession: false,
          maxTurns: 1,
          abortController: controller,
        },
      })
      queries.add(session)
      for await (const message of session) {
        if (message.type !== "result") continue
        if (message.subtype !== "success" || message.is_error)
          throw new Error("Claude could not generate a title.")
        publish({ type: "thread-title", threadId: request.threadId, title: message.result })
      }
    } catch (cause) {
      publish({ type: "title-failed", threadId: request.threadId, message: errorMessage(cause) })
    } finally {
      clearTimeout(timeout)
      controller.abort()
      closeQuery(session)
      controllers.delete(controller)
    }
  }

  const getUsage = async (requestId: string): Promise<void> => {
    const controller = new AbortController()
    usageRequests.set(requestId, controller)
    controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), 20_000)
    let session: Query | undefined
    try {
      session = query({
        prompt: idleInput(controller.signal),
        options: {
          ...spawnOptions(),
          cwd: homedir(),
          abortController: controller,
          settingSources: ["user"],
          tools: [],
          permissionMode: "dontAsk",
          persistSession: false,
        },
      })
      queries.add(session)
      const response = await session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
        skipBehaviors: true,
      })
      publish({ type: "usage-result", requestId, usage: claudeUsage(response) })
    } catch (cause) {
      publish({ type: "usage-result", requestId, error: errorMessage(cause) })
    } finally {
      clearTimeout(timeout)
      controller.abort()
      closeQuery(session)
      controllers.delete(controller)
      usageRequests.delete(requestId)
    }
  }

  const listCommands = async (requestId: string, workspacePath: string): Promise<void> => {
    const controller = new AbortController()
    controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), 20_000)
    let session: Query | undefined
    try {
      session = query({
        prompt: idleInput(controller.signal),
        options: {
          ...spawnOptions(),
          cwd: workspacePath,
          abortController: controller,
          // Project and local settings contribute the workspace's own commands and skills.
          settingSources: ["user", "project", "local"],
          tools: [],
          permissionMode: "dontAsk",
          persistSession: false,
        },
      })
      queries.add(session)
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
    } catch (cause) {
      publish({ type: "commands-result", requestId, error: errorMessage(cause) })
    } finally {
      clearTimeout(timeout)
      controller.abort()
      closeQuery(session)
      controllers.delete(controller)
    }
  }

  const shutdown = async (): Promise<void> => {
    if (stopping) return
    stopping = true
    for (const controller of controllers) controller.abort()
    for (const session of queries) session.close()
    await Promise.allSettled([...turns.values()].map((turn) => turn.task))
  }

  const resolveApproval = (
    message: Extract<
      NonNullable<ReturnType<typeof workerCommand>["input"]>,
      { type: "resolve-approval" }
    >,
    ack: (error?: string) => void,
  ): void => {
    const approval = approvals.get(String(message.requestId))
    if (!approval) {
      ack("This Claude interaction is no longer pending.")
      return
    }
    if (message.decision === "accept" || message.decision === "acceptForSession") {
      if (
        approval.questions.some(
          (question) => !message.answers?.[question.id]?.some((answer) => answer.trim()),
        )
      ) {
        ack("Answer each question before continuing.")
        return
      }
      approval.resolve({
        behavior: "allow",
        updatedInput: {
          ...approval.input,
          ...(approval.questions.length
            ? {
                answers: Object.fromEntries(
                  approval.questions.map((question) => [
                    question.question,
                    message.answers![question.id]!.join(", "),
                  ]),
                ),
              }
            : {}),
        },
        // Session approval must never write user or project settings.
        ...(approval.planApproved
          ? {
              updatedPermissions: [
                { type: "setMode", mode: approval.planApproved.mode, destination: "session" },
              ],
            }
          : message.decision === "acceptForSession"
            ? {
                updatedPermissions: approval.suggestions.map((suggestion) => ({
                  ...suggestion,
                  destination: "session" as const,
                })),
              }
            : {}),
      })
      approval.planApproved?.emit("claude/permission_mode", {
        permissionMode: approval.planApproved.mode,
      })
    } else
      approval.resolve({
        behavior: "deny",
        message: "The user declined this request.",
        interrupt: message.decision === "cancel",
      })
    ack()
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
        case "interrupt-turn": {
          const turn = turns.get(message.nativeTurnId)
          // The session ID can change before its update reaches the core. The local turn ID is stable.
          if (!turn) {
            ack("This Claude turn is no longer running.")
            break
          }
          turn.interrupted = true
          if (turn.session === undefined) {
            turn.controller.abort()
            ack()
          } else {
            void turn.session.interrupt().then(
              () => ack(),
              (cause) => ack(errorMessage(cause)),
            )
          }
          break
        }
        case "resolve-approval": {
          resolveApproval(message, ack)
          break
        }
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
