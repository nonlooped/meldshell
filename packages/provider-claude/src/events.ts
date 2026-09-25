import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { asRecord } from "@meldshell/contracts"

const display = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "")

/** Translate SDK messages once; the core and renderer continue to consume the shared event vocabulary. */
type AssistantMessage = Extract<SDKMessage, { type: "assistant" }>
type AssistantBlock = AssistantMessage["message"]["content"][number]
type UserMessage = Extract<SDKMessage, { type: "user" }>
type ToolResult = Extract<
  Exclude<UserMessage["message"]["content"], string>[number],
  { type: "tool_result" }
>
type SystemMessage = Extract<SDKMessage, { type: "system" }>
type TaskMessage = Extract<
  SystemMessage,
  { subtype: "task_started" | "task_progress" | "task_notification" | "task_updated" }
>

export class ClaudeEvents {
  private readonly messages = new Map<string, string>()
  private readonly tools = new Map<string, Record<string, unknown>>()
  private readonly blockIndexes = new Map<string, Map<number, string>>()
  private readonly nextBlock = new Map<string, number>()
  private readonly tasks = new Map<string, Record<string, unknown>>()
  private readonly hiddenTasks = new Set<string>()
  private compactionId: string | null = null
  constructor(
    private readonly emit: (method: string, params: unknown, validated?: boolean) => void,
  ) {}
  accept(message: SDKMessage): void {
    switch (message.type) {
      case "stream_event":
        return this.stream(message)
      case "assistant":
        return this.assistant(message)
      case "user":
        if (Array.isArray(message.message.content)) {
          for (const block of message.message.content)
            if (block.type === "tool_result") this.toolResult(message, block)
          return
        }
        break
      case "tool_progress":
        this.emit("item/tool/progress", {
          itemId: message.tool_use_id,
          message: `${message.tool_name} running for ${Math.round(message.elapsed_time_seconds)}s`,
        })

        return
      case "system":
        if (this.system(message)) return
        break
      case "result":
        this.emit("thread/tokenUsage/updated", {
          usage: message.usage,
          modelUsage: message.modelUsage,
          costUSD: message.total_cost_usd,
        })

        return
    }

    // Keep other native events, including MCP state, hooks, and rate limits, for inspection.
    this.emit(
      `claude/${message.type}${"subtype" in message ? `/${message.subtype}` : ""}`,
      message,
      false,
    )
  }
  private stream(message: Extract<SDKMessage, { type: "stream_event" }>): void {
    const parent = message.parent_tool_use_id ?? "main"

    const event = message.event

    if (event.type === "message_start") this.messages.set(parent, event.message.id)

    const messageId = this.messages.get(parent)

    if (event.type === "content_block_start" && messageId) {
      const indexes = this.blockIndexes.get(messageId) ?? new Map<number, string>()
      indexes.set(event.index, event.content_block.type)
      this.blockIndexes.set(messageId, indexes)
    }

    if (event.type === "content_block_delta" && messageId) {
      const type =
        event.delta.type === "text_delta"
          ? "text"
          : event.delta.type === "thinking_delta"
            ? "thinking"
            : null
      if (type) {
        const indexes = this.blockIndexes.get(messageId) ?? new Map<number, string>()
        indexes.set(event.index, type)
        this.blockIndexes.set(messageId, indexes)
      }
      const id = `${messageId}:${event.index}`
      if (event.delta.type === "text_delta")
        this.emit("item/agentMessage/delta", {
          itemId: id,
          delta: event.delta.text,
          item: { id, type: "agentMessage", parentToolUseId: message.parent_tool_use_id },
        })
      if (event.delta.type === "thinking_delta")
        this.emit("item/reasoning/delta", {
          itemId: id,
          delta: event.delta.thinking,
          item: { id, type: "reasoning", parentToolUseId: message.parent_tool_use_id },
        })
    }

    return
  }
  private assistant(message: AssistantMessage): void {
    message.message.content.forEach((block) => this.assistantBlock(message, block))

    if (message.error) this.emit("error", { error: { message: `Claude: ${message.error}` } })

    return
  }
  private assistantBlock(message: AssistantMessage, block: AssistantBlock): void {
    const indexes = this.blockIndexes.get(message.message.id)
    const index =
      [...(indexes ?? [])].find(([, type]) => type === block.type)?.[0] ??
      this.nextBlock.get(message.message.id) ??
      0
    indexes?.delete(index)
    this.nextBlock.set(
      message.message.id,
      Math.max(index + 1, this.nextBlock.get(message.message.id) ?? 0),
    )
    const id = `${message.message.id}:${index}`
    if (block.type === "text")
      this.emit("item/completed", {
        item: {
          id,
          type: "agentMessage",
          text: block.text,
          parentToolUseId: message.parent_tool_use_id,
          phase:
            message.parent_tool_use_id === null && message.message.stop_reason === "end_turn"
              ? "final_answer"
              : "commentary",
        },
      })
    else if (block.type === "thinking")
      this.emit("item/completed", { item: { id, type: "reasoning", text: block.thinking } })
    else if (block.type === "tool_use") {
      this.startTool(message, block)
    }
  }
  private startTool(
    message: AssistantMessage,
    block: Extract<AssistantBlock, { type: "tool_use" }>,
  ): void {
    const input = asRecord(block.input)
    const item: Record<string, unknown> = {
      id: block.id,
      type: "dynamicToolCall",
      tool: block.name,
      arguments: input,
      text: `${block.name}\n${display(input)}`,
      status: "inProgress",
      parentToolUseId: message.parent_tool_use_id,
    }
    if (block.name === "Bash")
      Object.assign(item, {
        type: "commandExecution",
        command: display(input.command),
        cwd: input.cwd,
      })
    if (["Edit", "Write", "NotebookEdit"].includes(block.name))
      Object.assign(item, {
        type: "fileChange",
        changes: [{ path: input.file_path ?? input.notebook_path, kind: { type: "update" } }],
      })
    if (block.name === "TodoWrite") Object.assign(item, { type: "plan", plan: input.todos })
    this.tools.set(block.id, item)
    this.emit("item/started", { item })
  }
  private toolResult(message: UserMessage, block: ToolResult): void {
    const item = this.tools.get(block.tool_use_id)

    const output =
      typeof block.content === "string"
        ? block.content
        : (block.content ?? [])
            .map((part) =>
              part.type === "text" ? part.text : part.type === "image" ? "[Image]" : display(part),
            )
            .join("\n")

    if (item?.type === "fileChange") {
      this.updateFileChange(item, block.is_error, message.tool_use_result)
    }

    if (item?.type === "commandExecution")
      this.emit("item/commandExecution/outputDelta", {
        itemId: block.tool_use_id,
        delta: output,
      })

    this.emit("item/completed", {
      item: {
        ...(item ?? { id: block.tool_use_id, type: "dynamicToolCall" }),
        status: block.is_error ? "failed" : "completed",
        text: `${item?.tool ?? "Tool"}\n${output}`,
        aggregatedOutput: output,
        result: message.tool_use_result,
        contentItems: block.content,
      },
    })

    this.tools.delete(block.tool_use_id)
  }
  private updateFileChange(
    item: Record<string, unknown>,
    failed: boolean | undefined,
    nativeResult: unknown,
  ): void {
    const result = asRecord(nativeResult)
    if (failed) Object.assign(item, { type: "dynamicToolCall", changes: [] })
    else if (typeof result.filePath === "string") {
      const patch = Array.isArray(result.structuredPatch)
        ? result.structuredPatch
            .map((value) => {
              const hunk = asRecord(value)
              if (
                ![hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines].every(
                  Number.isSafeInteger,
                ) ||
                !Array.isArray(hunk.lines)
              )
                return ""
              return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n${hunk.lines.map(String).join("\n")}\n`
            })
            .join("")
        : ""
      item.changes = [
        {
          path: result.filePath,
          kind: { type: result.type === "create" ? "add" : "update" },
          diff: result.type === "create" ? display(result.content) : patch,
        },
      ]
    }
  }
  private task(message: TaskMessage): void {
    if ("skip_transcript" in message && message.skip_transcript)
      this.hiddenTasks.add(message.task_id)

    if (this.hiddenTasks.has(message.task_id)) return

    const previous = this.tasks.get(message.task_id)

    const patch = message.subtype === "task_updated" ? message.patch : {}

    const status =
      message.subtype === "task_notification"
        ? message.status
        : (patch.status ?? previous?.status ?? "inProgress")

    const item = {
      ...previous,
      id: `task:${message.task_id}`,
      type: "dynamicToolCall",
      tool: "Background task",
      text:
        ("description" in message ? message.description : patch.description) ??
        previous?.text ??
        "Background task",
      status:
        status === "running" || status === "pending"
          ? "inProgress"
          : status === "killed"
            ? "stopped"
            : status,
      ...("tool_use_id" in message ? { parentToolUseId: message.tool_use_id } : {}),
      ...("summary" in message ? { aggregatedOutput: message.summary } : {}),
      ...("usage" in message ? { usage: message.usage } : {}),
      ...("output_file" in message ? { outputFile: message.output_file } : {}),
      ...(patch.error ? { error: patch.error } : {}),
    }

    this.tasks.set(message.task_id, item)

    this.emit(
      ["completed", "failed", "stopped"].includes(String(item.status))
        ? "item/completed"
        : "item/started",
      { item },
    )

    return
  }
  private system(message: SystemMessage): boolean {
    if (
      message.subtype === "task_started" ||
      message.subtype === "task_progress" ||
      message.subtype === "task_notification" ||
      message.subtype === "task_updated"
    ) {
      this.task(message)
      return true
    }

    if (message.subtype === "status" && message.status === "compacting") {
      this.compactionId = message.uuid
      this.emit("item/started", {
        item: {
          id: this.compactionId,
          type: "contextCompaction",
          text: "Compacting context",
          status: "inProgress",
        },
      })
      return true
    }

    if (
      message.subtype === "compact_boundary" ||
      (message.subtype === "status" && message.compact_result)
    ) {
      const failed = message.subtype === "status" && message.compact_result === "failed"
      this.emit("item/completed", {
        item: {
          id: this.compactionId ?? message.uuid,
          type: "contextCompaction",
          text: failed ? "Context compaction failed" : "Context compacted",
          status: failed ? "failed" : "completed",
          ...(message.subtype === "status"
            ? { error: message.compact_error }
            : { result: message.compact_metadata }),
        },
      })
      // The status and boundary messages can both describe the same compaction.
      return true
    }

    if (message.subtype === "api_retry") {
      this.emit("item/completed", {
        item: {
          id: "claude:api-retry",
          type: "providerStatus",
          text: `Retrying Claude request (${message.attempt}/${message.max_retries})`,
          result: `Waiting ${Math.ceil(message.retry_delay_ms / 1000)}s. ${message.error}`,
          status: "completed",
        },
      })
      return true
    }
    if (message.subtype === "local_command_output") {
      this.emit("item/completed", {
        item: {
          id: message.uuid,
          type: "agentMessage",
          text: message.content,
          phase: "final_answer",
        },
      })

      return true
    }

    return false
  }
}
