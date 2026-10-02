import { asRecord, asRecords, asText, type UnknownRecord } from "@meldshell/contracts"

type Emit = (method: string, params: unknown, validated?: boolean) => void

/** Pi's records that only repeat what the message and tool events already reported. */
const REPEATED = new Set([
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  "message_start",
  "tool_execution_start",
  "tool_execution_end",
  "queue_update",
  "agent_settled",
])

const SHELL_TOOLS = new Set(["bash", "powershell"])

const display = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "")

/** The text of a tool result's content blocks; images are named rather than inlined. */
const contentText = (content: unknown): string =>
  typeof content === "string"
    ? content
    : asRecords(content)
        .map((block) =>
          block.type === "text" ? asText(block.text) : block.type === "image" ? "[Image]" : "",
        )
        .filter(Boolean)
        .join("\n")

/** How the last assistant message of a run ended, which decides the MeldShell turn's status. */
export interface RunOutcome {
  readonly stopReason: string | null
  readonly error: string | null
}

/**
 * Translates Pi's RPC session events into MeldShell's shared event vocabulary once, so the core and
 * renderer read Pi like the other harnesses. Records it does not translate keep their native shape
 * under `pi/<type>` for inspection.
 */
export class PiEvents {
  private messages = 0
  private message = ""
  private readonly tools = new Map<string, UnknownRecord>()
  private readonly output = new Map<string, string>()
  private compaction = 0
  private stopReason: string | null = null
  private error: string | null = null

  constructor(
    private readonly prefix: string,
    private readonly emit: Emit,
  ) {}

  get outcome(): RunOutcome {
    return { stopReason: this.stopReason, error: this.error }
  }

  accept(record: UnknownRecord): void {
    switch (record.type) {
      case "message_start":
        if (asRecord(record.message).role === "assistant")
          this.message = `${this.prefix}:${++this.messages}`
        return
      case "message_update":
        return this.update(asRecord(record.assistantMessageEvent))
      case "message_end":
        return this.end(asRecord(record.message))
      case "tool_execution_update":
        return this.progress(record)
      case "compaction_start":
        return this.compactionStarted()
      case "compaction_end":
        return this.compactionEnded(record)
      case "auto_retry_start":
        this.emit("item/completed", {
          item: {
            id: `${this.prefix}:retry`,
            type: "providerStatus",
            text: `Retrying Pi request (${display(record.attempt)}/${display(record.maxAttempts)})`,
            result: asText(record.errorMessage),
            status: "completed",
          },
        })
        return
      case "session_info_changed":
        if (typeof record.name === "string")
          this.emit("thread/name/updated", { threadName: record.name })
        return
    }
    if (typeof record.type === "string" && REPEATED.has(record.type)) return
    this.emit(`pi/${asText(record.type) || "record"}`, record, false)
  }

  private update(event: UnknownRecord): void {
    const id = `${this.message}:${display(event.contentIndex)}`
    if (event.type === "text_delta")
      this.emit("item/agentMessage/delta", {
        itemId: id,
        delta: asText(event.delta),
        item: { id, type: "agentMessage" },
      })
    else if (event.type === "thinking_delta")
      this.emit("item/reasoning/delta", {
        itemId: id,
        delta: asText(event.delta),
        item: { id, type: "reasoning" },
      })
    else if (event.type === "toolcall_end") this.startTool(asRecord(event.toolCall))
  }

  private end(message: UnknownRecord): void {
    if (message.role === "assistant") return this.assistant(message)
    if (message.role === "toolResult") return this.toolResult(message)
    // The prompt and tool declarations Pi records for itself, repeated on every run.
    if (message.role === "user" || message.role === "system") return
    this.emit(`pi/message/${asText(message.role) || "unknown"}`, message, false)
  }

  private assistant(message: UnknownRecord): void {
    const stopReason = asText(message.stopReason)
    asRecords(message.content).forEach((block, index) => {
      const id = `${this.message}:${index}`
      if (block.type === "text" && asText(block.text))
        this.emit("item/completed", {
          item: {
            id,
            type: "agentMessage",
            text: asText(block.text),
            phase: stopReason === "stop" ? "final_answer" : "commentary",
          },
        })
      else if (block.type === "thinking" && asText(block.thinking))
        this.emit("item/completed", {
          item: { id, type: "reasoning", text: asText(block.thinking) },
        })
      else if (block.type === "toolCall") this.startTool(block)
    })
    this.emit("thread/tokenUsage/updated", {
      usage: message.usage,
      model: message.model,
      provider: message.provider,
    })
    this.stopReason = stopReason || null
    this.error =
      stopReason === "error" || stopReason === "aborted"
        ? asText(message.errorMessage) || null
        : null
    if (stopReason === "error")
      this.emit("error", { error: { message: this.error ?? "Pi's model request failed." } })
  }

  private startTool(call: UnknownRecord): void {
    const id = asText(call.id)
    if (!id || this.tools.has(id)) return
    const name = asText(call.name)
    const input = asRecord(call.arguments)
    const item: UnknownRecord = {
      id,
      type: "dynamicToolCall",
      tool: name,
      arguments: input,
      text: `${name}\n${display(input)}`,
      status: "inProgress",
    }
    if (SHELL_TOOLS.has(name))
      Object.assign(item, { type: "commandExecution", command: asText(input.command) })
    if ((name === "edit" || name === "write") && typeof input.path === "string")
      Object.assign(item, {
        type: "fileChange",
        changes: [{ path: input.path, kind: { type: name === "write" ? "add" : "update" } }],
      })
    this.tools.set(id, item)
    this.emit("item/started", { item })
  }

  /** Shell tools report their whole output so far; forward only what is new. */
  private progress(record: UnknownRecord): void {
    const id = asText(record.toolCallId)
    if (this.tools.get(id)?.type !== "commandExecution") return
    const text = contentText(asRecord(record.partialResult).content)
    const previous = this.output.get(id) ?? ""
    if (!text.startsWith(previous) || text === previous) return
    this.output.set(id, text)
    this.emit("item/commandExecution/outputDelta", {
      itemId: id,
      delta: text.slice(previous.length),
    })
  }

  private toolResult(message: UnknownRecord): void {
    const id = asText(message.toolCallId)
    const item = this.tools.get(id) ?? {
      id,
      type: "dynamicToolCall",
      tool: asText(message.toolName),
    }
    const output = contentText(message.content)
    const failed = message.isError === true
    const details = asRecord(message.details)
    if (item.type === "fileChange") {
      if (failed) Object.assign(item, { type: "dynamicToolCall", changes: [] })
      else {
        const [change] = asRecords(item.changes)
        const write = item.tool === "write"
        const diff = write ? asText(asRecord(item.arguments).content) : asText(details.patch)
        item.changes = [{ ...change, diff }]
      }
    }
    this.emit("item/completed", {
      item: {
        ...item,
        status: failed ? "failed" : "completed",
        text: `${asText(item.tool) || "Tool"}\n${output}`,
        aggregatedOutput: output,
        result: message.details,
        contentItems: message.content,
      },
    })
    this.tools.delete(id)
    this.output.delete(id)
  }

  private compactionStarted(): void {
    this.emit("item/started", {
      item: {
        id: `${this.prefix}:compaction:${++this.compaction}`,
        type: "contextCompaction",
        text: "Compacting context",
        status: "inProgress",
      },
    })
  }

  private compactionEnded(record: UnknownRecord): void {
    const failed = record.result === undefined
    this.emit("item/completed", {
      item: {
        id: `${this.prefix}:compaction:${this.compaction}`,
        type: "contextCompaction",
        text: failed
          ? record.aborted === true
            ? "Context compaction stopped"
            : "Context compaction failed"
          : "Context compacted",
        status: failed ? "failed" : "completed",
        ...(failed ? { error: record.errorMessage } : { result: record.result }),
      },
    })
  }
}
