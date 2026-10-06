import {
  asRecord,
  asText,
  decodePiPayload,
  type CanonicalEvent,
  type CanonicalEventKind,
  type PiContent,
  type PiMessage,
  type PiPayload,
} from "@meldshell/contracts"
import { Result } from "effect"
import { Slots } from "./slots"

const DIALOGS = new Set(["select", "confirm", "input", "editor"])
const SHELL_TOOLS = new Set(["bash", "powershell"])
const FILE_TOOLS = new Set(["edit", "write"])

const toolKind = (name: string | null | undefined): CanonicalEventKind =>
  SHELL_TOOLS.has(name ?? "") ? "command" : FILE_TOOLS.has(name ?? "") ? "file-change" : "tool"

const messageOf = (payload: PiPayload): PiMessage | undefined =>
  typeof payload.message === "object" && payload.message !== null ? payload.message : undefined

const blocks = (message: PiMessage | undefined): ReadonlyArray<PiContent> =>
  Array.isArray(message?.content) ? message.content : []

/** The text of content blocks of one type; images are named rather than inlined. */
const contentText = (content: unknown, type: "text" | "thinking" = "text"): string => {
  if (typeof content === "string") return type === "text" ? content : ""
  if (!Array.isArray(content)) return ""
  return content
    .map((value) => {
      const block = asRecord(value)
      if (block.type === "image" && type === "text") return "Image"
      return block.type === type ? asText(block[type]) : ""
    })
    .filter(Boolean)
    .join("\n")
}

export const piEventKind = (method: string, params: unknown): CanonicalEventKind => {
  const decoded = decodePiPayload(params)
  if (Result.isFailure(decoded)) return "unknown"
  const payload = decoded.success
  switch (method) {
    case "pi/message_update": {
      const update = payload.assistantMessageEvent
      if (update?.type.startsWith("text_")) return "assistant"
      if (update?.type.startsWith("thinking_")) return "reasoning"
      if (update?.type.startsWith("toolcall_")) return toolKind(update.toolCall?.name)
      return "status"
    }
    case "pi/message_end": {
      const message = messageOf(payload)
      if (message?.role === "assistant") return "assistant"
      if (message?.role === "toolResult") return toolKind(message.toolName)
      return "status"
    }
    case "pi/tool_execution_start":
    case "pi/tool_execution_update":
    case "pi/tool_execution_end":
      return toolKind(payload.toolName)
    case "pi/extension_ui_request":
      return DIALOGS.has(payload.method ?? "") ? "approval" : "status"
    default:
      return "status"
  }
}

/** Searchable text. Streaming deltas carry none, since the message that ends them has it all. */
export const piEventText = (method: string, params: unknown): string | null => {
  const decoded = decodePiPayload(params)
  if (Result.isFailure(decoded)) return `Invalid ${method} payload: ${decoded.failure.message}`
  const payload = decoded.success
  if (method === "pi/extension_ui_request")
    return (DIALOGS.has(payload.method ?? "") ? payload.title : asText(payload.message)) || null
  if (method === "pi/auto_retry_start" || method === "pi/compaction_end")
    return payload.errorMessage || null
  if (method !== "pi/message_end") return null
  const message = messageOf(payload)
  switch (message?.role) {
    case "assistant":
      return contentText(message.content) || message.errorMessage || null
    case "toolResult":
    case "custom":
      return contentText(message.content) || null
    case "bashExecution":
      return [message.command, message.output].filter(Boolean).join("\n") || null
    case "branchSummary":
    case "compactionSummary":
      return message.summary || null
    default:
      return null
  }
}

interface ToolState {
  readonly name: string
  readonly args: unknown
  output: string
  status: "inProgress" | "completed" | "failed"
  details?: unknown
  result?: unknown
}

/** A Pi tool call in the shape the transcript renders commands, file changes, and tools. */
const toolEvent = (event: CanonicalEvent, tool: ToolState): CanonicalEvent => {
  const kind = toolKind(tool.name)
  const args = asRecord(tool.args)
  const path = asText(args.path)
  const command = asText(args.command)
  const title = [tool.name, kind === "command" ? "" : path].filter(Boolean).join(" ") || "Pi tool"
  const diff = tool.name === "write" ? asText(args.content) : asText(asRecord(tool.details).patch)
  return {
    ...event,
    kind,
    text: kind === "command" ? [command || title, tool.output].filter(Boolean).join("\n\n") : title,
    payload: {
      native: event.payload,
      item: {
        type:
          kind === "command"
            ? "commandExecution"
            : kind === "file-change"
              ? "fileChange"
              : "piTool",
        tool: tool.name,
        arguments: tool.args,
        result: tool.details ?? tool.result,
        command: kind === "command" ? command || title : undefined,
        aggregatedOutput: tool.output,
        changes:
          kind === "file-change" && path && tool.status !== "failed"
            ? [{ path, kind: { type: tool.name === "write" ? "add" : "update" }, diff }]
            : [],
        status: tool.status,
      },
    },
  }
}

const statusEvent = (event: CanonicalEvent, text: string, type: string): CanonicalEvent => ({
  ...event,
  kind: "tool",
  text,
  payload: { native: event.payload, item: { type, result: event.payload } },
})

const recordText = (payload: PiPayload): string => {
  switch (payload.type) {
    case "compaction_start":
      return `Compacting context${payload.reason ? ` (${payload.reason})` : ""}`
    case "compaction_end":
      return payload.aborted
        ? "Context compaction stopped"
        : payload.errorMessage
          ? `Context compaction failed: ${payload.errorMessage}`
          : "Context compacted"
    case "auto_retry_start":
      return `Retrying (${String(payload.attempt ?? "")}/${String(payload.maxAttempts ?? "")}): ${payload.errorMessage ?? ""}`
    case "auto_retry_end":
      return payload.success ? "" : `Retry failed: ${payload.finalError ?? ""}`
    default:
      return ""
  }
}

/**
 * Projects native Pi RPC records at read time, one event at a time, into `result`. Stored events
 * never become Codex protocol items.
 */
export const piProjection = (result: Slots): ((event: CanonicalEvent) => void) => {
  const messages = new Map<string, number>()
  const blockEvents = new Map<string, number>()
  const tools = new Map<string, { index: number; state: ToolState }>()
  /** Turns MeldShell started with a prompt of its own. */
  const prompted = new Set<string>()

  const blockKey = (turn: string, index: number | undefined) =>
    `${turn}:${messages.get(turn) ?? 0}:${index ?? 0}`

  /** Streams into, or replaces, the event that shows one content block of an assistant message. */
  const setBlock = (
    event: CanonicalEvent,
    turn: string,
    index: number | undefined,
    kind: "assistant" | "reasoning",
    text: string,
    replace: boolean,
  ): void => {
    const key = blockKey(turn, index)
    const previous = blockEvents.get(key)
    if (previous === undefined) {
      if (!text) return
      blockEvents.set(key, result.items.length)
      result.push({ ...event, kind, text, payload: { native: event.payload } })
      return
    }
    const first = result.items[previous]!
    result.set(previous, { ...first, text: replace ? text : (first.text ?? "") + text })
  }

  const setTool = (
    event: CanonicalEvent,
    turn: string,
    id: string,
    update: (state: ToolState | undefined) => ToolState,
  ): void => {
    const key = `${turn}:${id}`
    const previous = tools.get(key)
    const state = update(previous?.state)
    const projected = toolEvent(previous ? result.items[previous.index]! : event, state)
    if (previous) result.set(previous.index, projected)
    else result.push(projected)
    tools.set(key, { state, index: previous?.index ?? result.items.length - 1 })
  }

  const startTool = (event: CanonicalEvent, turn: string, call: PiContent | undefined): void => {
    if (!call?.id) return
    setTool(
      event,
      turn,
      call.id,
      (state) =>
        state ?? { name: call.name ?? "", args: call.arguments, output: "", status: "inProgress" },
    )
  }

  const assistantEnded = (event: CanonicalEvent, turn: string, message: PiMessage): void => {
    blocks(message).forEach((block, index) => {
      if (block.type === "text") setBlock(event, turn, index, "assistant", block.text ?? "", true)
      else if (block.type === "thinking")
        setBlock(event, turn, index, "reasoning", block.thinking ?? "", true)
      else if (block.type === "toolCall") startTool(event, turn, block)
    })
    if (message.stopReason === "error")
      result.push({
        ...event,
        kind: "error",
        text: message.errorMessage || "Pi's model request failed.",
        payload: { native: event.payload },
      })
  }

  const messageEnded = (event: CanonicalEvent, turn: string, message: PiMessage): void => {
    switch (message.role) {
      case "assistant":
        return assistantEnded(event, turn, message)
      case "toolResult":
        return setTool(event, turn, message.toolCallId ?? "", (state) => ({
          name: state?.name ?? message.toolName ?? "",
          args: state?.args,
          output: contentText(message.content) || (state?.output ?? ""),
          status: message.isError ? "failed" : "completed",
          details: message.details,
        }))
      case "bashExecution":
      case "custom":
      case "branchSummary":
      case "compactionSummary": {
        const text = piEventText(event.method, event.payload)
        if (text) result.push(statusEvent(event, text, `pi/${message.role}`))
        return
      }
      case "user": {
        // MeldShell records the prompts it sends; a turn Pi started has only Pi's own message.
        const text = contentText(message.content)
        if (!prompted.has(turn) && text)
          result.push({ ...event, kind: "user", text, payload: { native: event.payload } })
        return
      }
      default:
        return
    }
  }

  /** Deltas stream into their content block; a finished tool call starts its tool. */
  const streamed = (event: CanonicalEvent, turn: string, payload: PiPayload): void => {
    const update = payload.assistantMessageEvent
    if (update?.type === "text_delta" || update?.type === "thinking_delta")
      setBlock(
        event,
        turn,
        update.contentIndex,
        update.type === "text_delta" ? "assistant" : "reasoning",
        update.delta ?? "",
        false,
      )
    else if (update?.type === "toolcall_end") startTool(event, turn, update.toolCall)
  }

  const toolExecution = (event: CanonicalEvent, turn: string, payload: PiPayload): void => {
    const id = payload.toolCallId ?? ""
    const name = payload.toolName ?? ""
    if (payload.type === "tool_execution_start")
      return setTool(
        event,
        turn,
        id,
        (state) => state ?? { name, args: payload.args, output: "", status: "inProgress" },
      )
    if (payload.type === "tool_execution_update")
      return setTool(event, turn, id, (state) => ({
        name: state?.name ?? name,
        args: state?.args ?? payload.args,
        output: contentText(asRecord(payload.partialResult).content) || (state?.output ?? ""),
        status: state?.status ?? "inProgress",
      }))
    // Calls made from inside another tool have no result message of their own.
    setTool(event, turn, id, (state) =>
      state && state.status !== "inProgress"
        ? state
        : {
            name: state?.name ?? name,
            args: state?.args,
            output: contentText(asRecord(payload.result).content) || (state?.output ?? ""),
            status: payload.isError ? "failed" : "completed",
            result: payload.result,
          },
    )
  }

  const append = (event: CanonicalEvent, turn: string, payload: PiPayload): void => {
    switch (payload.type) {
      case "message_start":
        if (messageOf(payload)?.role === "assistant")
          messages.set(turn, (messages.get(turn) ?? 0) + 1)
        return
      case "message_update":
        return streamed(event, turn, payload)
      case "message_end": {
        const message = messageOf(payload)
        if (message) messageEnded(event, turn, message)
        return
      }
      case "tool_execution_start":
      case "tool_execution_update":
      case "tool_execution_end":
        return toolExecution(event, turn, payload)
      case "extension_ui_request":
        if (DIALOGS.has(payload.method ?? "")) result.push(event)
        else if (
          payload.method === "notify" &&
          typeof payload.message === "string" &&
          payload.message
        )
          result.push(statusEvent(event, payload.message, "pi/notify"))
        return
      default: {
        const text = recordText(payload)
        if (text) result.push(statusEvent(event, text, `pi/${payload.type}`))
      }
    }
  }

  return (event) => {
    if (!event.method.startsWith("pi/")) {
      if (event.kind === "user") prompted.add(event.turnId ?? event.threadId)
      result.push(event)
      return
    }
    const decoded = decodePiPayload(event.payload)
    if (Result.isFailure(decoded)) {
      result.push({
        ...event,
        kind: "error",
        text: `Invalid ${event.method} payload: ${decoded.failure.message}`,
        payload: { native: event.payload },
      })
      return
    }
    append(event, event.turnId ?? event.threadId, decoded.success)
  }
}

export const preparePiEvents = (events: ReadonlyArray<CanonicalEvent>): CanonicalEvent[] => {
  const result = new Slots()
  const push = piProjection(result)
  for (const event of events) push(event)
  return result.items
}
