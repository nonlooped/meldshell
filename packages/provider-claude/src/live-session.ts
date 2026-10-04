import {
  query,
  type Options,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"

type Result = Extract<SDKMessage, { type: "result" }>
type CanUseTool = NonNullable<Options["canUseTool"]>

interface PendingTurn {
  readonly input: SDKUserMessage
  readonly resolve: (result: Result) => void
  readonly reject: (cause: unknown) => void
  readonly canUseTool: CanUseTool
  responded: boolean
}

/** One streaming process per thread. A result ends a turn, not the input stream or process. */
export class LiveClaudeSession {
  readonly controller = new AbortController()
  readonly query: ReturnType<typeof query>
  readonly task: Promise<void>
  private pending: PendingTurn | undefined
  private wake: (() => void) | undefined
  private input: SDKUserMessage | undefined
  private ended = false
  private processExit: Promise<void> = Promise.resolve()
  private failure: unknown = new Error("Claude stopped before returning a turn result.")

  constructor(
    options: Options,
    private readonly onMessage: (message: SDKMessage) => void,
  ) {
    const spawn = options.spawnClaudeCodeProcess
    this.query = query({
      prompt: this.inputs(),
      options: {
        ...options,
        abortController: this.controller,
        ...(spawn
          ? {
              spawnClaudeCodeProcess: (spawnOptions) => {
                const child = spawn(spawnOptions)
                this.processExit = new Promise<void>((resolve) => {
                  child.once("exit", () => resolve())
                  child.once("error", (error) => {
                    if (error.name !== "AbortError") resolve()
                  })
                })
                return child
              },
            }
          : {}),
        canUseTool: (...args) =>
          this.pending?.canUseTool(...args) ??
          Promise.resolve({ behavior: "deny", message: "No active turn.", interrupt: true }),
      },
    })
    this.task = this.consume()
  }

  get closed(): boolean {
    return this.ended || this.controller.signal.aborted
  }

  send(input: SDKUserMessage, canUseTool: CanUseTool): Promise<Result> {
    if (this.closed) return Promise.reject(this.failure)
    if (this.pending)
      return Promise.reject(new Error("This Claude thread already has a running turn."))
    const result = new Promise<Result>((resolve, reject) => {
      this.pending = { input, resolve, reject, canUseTool, responded: false }
    })
    this.input = input
    this.wake?.()
    return result
  }

  async close(): Promise<void> {
    this.controller.abort()
    this.wake?.()
    this.query.close()
    await this.task
    // The Windows process-tree kill is asynchronous. Do not resume the same transcript or
    // remove its workspace until the old process has actually released it.
    await this.processExit
  }

  private async *inputs(): AsyncGenerator<SDKUserMessage> {
    while (!this.controller.signal.aborted) {
      if (this.input) {
        const input = this.input
        this.input = undefined
        yield input
      } else {
        await new Promise<void>((resolve) => {
          this.wake = resolve
        })
        this.wake = undefined
      }
    }
  }

  private answers(message: Result, turn: PendingTurn): boolean {
    const ids =
      message.user_message_uuids ??
      (message.user_message_uuid === undefined ? undefined : [message.user_message_uuid])
    if (ids) return turn.input.uuid !== undefined && ids.includes(turn.input.uuid)
    // Older CLIs have no prompt echo. A resumed background notification can produce a success
    // before the queued user prompt runs. Wait for its response, but retain startup errors and
    // local slash commands, which legitimately finish without an assistant message.
    return (
      message.is_error ||
      message.subtype !== "success" ||
      turn.responded ||
      message.local_command !== undefined
    )
  }

  private async consume(): Promise<void> {
    try {
      for await (const message of this.query) {
        const turn = this.pending
        if (
          turn &&
          (message.type === "assistant" || message.type === "stream_event") &&
          message.parent_tool_use_id === null
        )
          turn.responded = true
        if (turn && message.type === "system" && message.subtype === "local_command_output")
          turn.responded = true
        this.onMessage(message)
        if (turn && message.type === "result" && this.answers(message, turn)) {
          this.pending = undefined
          turn.resolve(message)
        }
      }
    } catch (cause) {
      this.failure = cause
    } finally {
      this.ended = true
      this.controller.abort()
      this.wake?.()
      this.query.close()
      this.pending?.reject(this.failure)
      this.pending = undefined
    }
  }
}
