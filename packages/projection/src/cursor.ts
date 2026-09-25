import {
  decodeCursorPayload,
  CursorContent,
  CursorToolContent,
  CursorTodo,
  type CursorPayload,
  type CursorUpdate,
  type CanonicalEvent,
  type CanonicalEventKind,
} from "@meldshell/contracts"
import { Either, Schema } from "effect"
import { createTwoFilesPatch, OMIT_HEADERS } from "diff"

const contentText = (block: CursorContent | undefined): string => {
  if (!block) return ""
  if (block.type === "text") return block.text ?? ""
  if (block.type === "resource") return block.resource?.text || block.resource?.uri || ""
  if (block.type === "resource_link")
    return (block.title ?? "") || (block.name ?? "") || (block.uri ?? "")
  if (block.type === "image") return "Image"
  if (block.type === "audio") return "Audio"
  return ""
}

export const cursorEventKind = (method: string, params: unknown): CanonicalEventKind => {
  if (method === "cursor/acp/error") return "error"
  if (
    ["cursor/acp/session/request_permission", "cursor/ask_question", "cursor/create_plan"].includes(
      method,
    )
  )
    return "approval"
  if (method === "cursor/update_todos") return "plan"
  if (method === "cursor/task" || method === "cursor/generate_image") return "tool"
  if (method !== "cursor/acp/session/update")
    return method.includes("/session/") ? "status" : "unknown"
  const decoded = decodeCursorPayload(params)
  if (Either.isLeft(decoded) || !decoded.right.update) return "unknown"
  const update = decoded.right.update
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return "assistant"
    case "agent_thought_chunk":
      return "reasoning"
    case "user_message_chunk":
      return "user"
    case "plan":
      return "plan"
    case "tool_call":
    case "tool_call_update":
      return update.kind === "execute" ? "command" : update.kind === "edit" ? "file-change" : "tool"
    case "usage_update":
      return "usage"
    case "available_commands_update":
    case "current_mode_update":
    case "config_option_update":
    case "session_info_update":
      return "status"
    default:
      return "unknown"
  }
}

export const cursorEventText = (method: string, params: unknown): string | null => {
  const decoded = decodeCursorPayload(params)
  if (Either.isLeft(decoded)) return `Invalid ${method} payload: ${decoded.left.message}`
  const p = decoded.right
  if (method === "cursor/acp/error") return p.message ?? ""
  if (method === "cursor/create_plan") return p.plan ?? ""
  if (method === "cursor/task" || method === "cursor/generate_image") return p.description ?? ""
  const update = p.update
  return contentText(contentBlock(update?.content)) || update?.title || null
}

/**
 * One ACP diff as a file change in the shape Codex reports: a new file carries its whole content,
 * and an edit carries a unified diff whose file headers the viewer supplies.
 */
const fileChange = (entry: typeof CursorToolContent.Type) => {
  const path = entry.path ?? ""
  if (entry.oldText === null) return { path, kind: { type: "add" }, diff: entry.newText ?? "" }
  return {
    path,
    kind: { type: "update" },
    diff: createTwoFilesPatch(
      path,
      path,
      entry.oldText ?? "",
      entry.newText ?? "",
      undefined,
      undefined,
      {
        context: 3,
        headerOptions: OMIT_HEADERS,
      },
    ),
  }
}

const toolEvent = (event: CanonicalEvent, tool: CursorUpdate): CanonicalEvent => {
  const content = toolContent(tool.content)
  const output = content
    .map((entry) => (entry.type === "content" ? contentText(entry.content) : ""))
    .filter(Boolean)
    .join("\n\n")
  const changes = content.filter((entry) => entry.type === "diff").map(fileChange)
  const kind = tool.kind === "execute" ? "command" : changes.length ? "file-change" : "tool"
  const title = (tool.title ?? "") || (tool.kind ?? "") || "Cursor tool"
  return {
    ...event,
    kind,
    text: kind === "command" ? [title, output].filter(Boolean).join("\n\n") : title,
    payload: {
      native: event.payload,
      cursorTool: tool,
      item: {
        type:
          kind === "command"
            ? "commandExecution"
            : kind === "file-change"
              ? "fileChange"
              : "cursorTool",
        tool: title,
        arguments: tool.rawInput,
        result: tool.rawOutput ?? content,
        command: kind === "command" ? rawCommand(tool.rawInput) || title : undefined,
        aggregatedOutput: output,
        changes,
        status:
          tool.status === "in_progress" || tool.status === "pending" ? "inProgress" : tool.status,
      },
    },
  }
}

/** Project native ACP history at read time. Stored events never become Codex protocol items. */
export const prepareCursorEvents = (events: ReadonlyArray<CanonicalEvent>): CanonicalEvent[] => {
  const result: CanonicalEvent[] = []
  const tools = new Map<string, { index: number; state: CursorUpdate }>()
  const chunks = new Map<string, { kind: string; index: number }>()
  const todos = new Map<string, Map<string, typeof CursorTodo.Type>>()
  const todoEvents = new Map<string, number>()
  const appendChunk = (
    event: CanonicalEvent,
    turn: string,
    _params: CursorPayload,
    update: CursorUpdate,
  ): void => {
    const kind = update.sessionUpdate === "agent_message_chunk" ? "assistant" : "reasoning"
    const content = contentBlock(update.content)
    if (content?.type !== "text") {
      result.push({
        ...event,
        kind: "tool",
        text: contentText(content),
        payload: { native: event.payload, item: { type: "cursorContent", result: [content] } },
      })
      chunks.delete(turn)
      return
    }
    const previous = chunks.get(turn)
    if (previous?.kind === kind) {
      const first = result[previous.index]!
      result[previous.index] = { ...first, text: (first.text ?? "") + (content.text ?? "") }
    } else {
      chunks.set(turn, { kind, index: result.length })
      result.push({ ...event, kind, text: content.text ?? "" })
    }
  }
  const appendTool = (
    event: CanonicalEvent,
    turn: string,
    _params: CursorPayload,
    update: CursorUpdate,
  ): void => {
    chunks.delete(turn)
    const key = `${turn}:${update.toolCallId ?? ""}`
    const previous = tools.get(key)
    const state = { ...previous?.state, ...update }
    const projected = toolEvent(previous ? result[previous.index]! : event, state)
    if (previous) result[previous.index] = projected
    else result.push(projected)
    tools.set(key, { state, index: previous?.index ?? result.length - 1 })
  }
  const appendPlan = (
    event: CanonicalEvent,
    turn: string,
    params: CursorPayload,
    update: CursorUpdate | undefined,
  ): void => {
    const state =
      params.merge === true
        ? new Map(todos.get(event.threadId))
        : new Map<string, typeof CursorTodo.Type>()
    for (const [index, entry] of (params.todos ?? update?.entries ?? []).entries())
      state.set((entry.id ?? "") || String(index), entry)
    todos.set(event.threadId, state)
    const body = [...state.values()]
      .map(
        (entry) =>
          `- ${entry.status === "completed" ? "[x]" : "[ ]"} ${entry.content ?? ""} (${entry.status ?? ""})`,
      )
      .join("\n")
    const previous = todoEvents.get(turn)
    const projected = {
      ...(previous === undefined ? event : result[previous]!),
      kind: "plan" as const,
      text: body,
      payload: event.payload,
    }
    if (previous === undefined) {
      todoEvents.set(turn, result.length)
      result.push(projected)
    } else result[previous] = projected
  }
  const appendStatus = (
    event: CanonicalEvent,
    params: CursorPayload,
    update: CursorUpdate | undefined,
  ): void => {
    const stateText = cursorStateText(event.method, params, update)
    if (stateText)
      result.push({
        ...event,
        kind: "tool",
        text: stateText,
        payload: { native: event.payload, item: { type: "cursorStatus", result: params } },
      })
    else if (event.kind === "approval" || event.kind === "error") result.push(event)
  }
  const appendUpdate = (
    event: CanonicalEvent,
    turn: string,
    params: CursorPayload,
    update: CursorUpdate,
  ): boolean => {
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
      case "agent_thought_chunk":
        appendChunk(event, turn, params, update)
        return true
      case "tool_call":
      case "tool_call_update":
        appendTool(event, turn, params, update)
        return true
      case "plan":
        appendPlan(event, turn, params, update)
        return true
      default:
        return false
    }
  }
  const append = (event: CanonicalEvent): void => {
    if (!event.method.startsWith("cursor/")) {
      result.push(event)
      return
    }
    if (event.method === "cursor/acp/session/replay" || event.kind === "unknown") return
    const turn = event.turnId ?? event.threadId
    const decoded = decodeCursorPayload(event.payload)
    if (Either.isLeft(decoded)) {
      result.push({
        ...event,
        kind: "error",
        text: `Invalid ${event.method} payload: ${decoded.left.message}`,
      })
      return
    }
    const params = decoded.right
    const update = params.update
    if (event.method === "cursor/update_todos") {
      appendPlan(event, turn, params, update)
      return
    }
    if (update && appendUpdate(event, turn, params, update)) return
    if (["cursor/task", "cursor/generate_image"].includes(event.method)) {
      chunks.delete(turn)
      result.push({
        ...event,
        kind: "tool",
        text: (params.description ?? "") || "Cursor activity",
        payload: {
          native: event.payload,
          item: {
            type: event.method === "cursor/task" ? "cursorTask" : "cursorImage",
            arguments: params,
            result: params,
            outputFile: params.filePath,
            parent: params.agentId,
          },
        },
      })
      return
    }
    appendStatus(event, params, update)
  }
  for (const event of events) append(event)
  return result
}

const cursorStateText = (
  method: string,
  params: CursorPayload,
  update: CursorUpdate | undefined,
): string => {
  if (update?.sessionUpdate === "usage_update")
    return `Context: ${String(update.used)} / ${String(update.size)} tokens${update.cost ? ` · ${JSON.stringify(update.cost)}` : ""}`
  if (update?.sessionUpdate === "current_mode_update")
    return `Cursor mode: ${update.currentModeId ?? ""}`
  if (update?.sessionUpdate === "config_option_update")
    return (update.configOptions ?? [])
      .map((option) => `${option.name ?? ""}: ${option.currentValue ?? ""}`)
      .join(" · ")
  if (update?.sessionUpdate === "available_commands_update")
    return (update.availableCommands ?? [])
      .map((command) => `/${command.name ?? ""} — ${command.description ?? ""}`)
      .join("\n")
  if (method === "cursor/acp/session/prompt/result" && params.stopReason !== "end_turn")
    return `Cursor stopped: ${(params.stopReason ?? "").replaceAll("_", " ")}`
  return ""
}

const contentBlock = (value: CursorUpdate["content"]): CursorContent | undefined =>
  Schema.is(CursorContent)(value) ? value : undefined
const toolContent = (
  value: CursorUpdate["content"],
): ReadonlyArray<typeof CursorToolContent.Type> =>
  Schema.is(Schema.Array(CursorToolContent))(value) ? value : []
const rawCommand = (value: unknown): string => {
  const decoded = Schema.decodeUnknownEither(
    Schema.Struct({ command: Schema.optional(Schema.String) }),
  )(value)
  return Either.isRight(decoded) ? (decoded.right.command ?? "") : ""
}
