import type { CanonicalEvent, CanonicalEventKind } from "@meldshell/contracts"

type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue =>
  typeof value === "object" && value !== null ? (value as RecordValue) : {}
const records = (value: unknown): RecordValue[] => (Array.isArray(value) ? value.map(record) : [])
const text = (value: unknown): string => (typeof value === "string" ? value : "")
const contentText = (value: unknown): string => {
  const block = record(value)
  if (block.type === "text") return text(block.text)
  if (block.type === "resource")
    return text(record(block.resource).text) || text(record(block.resource).uri)
  if (block.type === "resource_link")
    return text(block.title) || text(block.name) || text(block.uri)
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
  const update = record(record(params).update)
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
  const p = record(params)
  if (method === "cursor/acp/error") return text(p.message)
  if (method === "cursor/create_plan") return text(p.plan)
  if (method === "cursor/task" || method === "cursor/generate_image") return text(p.description)
  const update = record(p.update)
  return contentText(update.content) || text(update.title) || null
}

const diffText = (oldText: string, newText: string): string => {
  const lines = (value: string): string[] =>
    value === "" ? [] : value.replace(/\n$/, "").split("\n")
  const before = lines(oldText),
    after = lines(newText)
  return `@@ -${before.length ? 1 : 0},${before.length} +${after.length ? 1 : 0},${after.length} @@\n${[...before.map((line) => `-${line}`), ...after.map((line) => `+${line}`)].join("\n")}\n`
}

const toolEvent = (event: CanonicalEvent, tool: RecordValue): CanonicalEvent => {
  const content = records(tool.content)
  const output = content
    .map((entry) => (entry.type === "content" ? contentText(entry.content) : ""))
    .filter(Boolean)
    .join("\n\n")
  const changes = content
    .filter((entry) => entry.type === "diff")
    .map((entry) => ({
      path: text(entry.path),
      kind: { type: entry.oldText === null ? "add" : "update" },
      diff: diffText(text(entry.oldText), text(entry.newText)),
    }))
  const kind = tool.kind === "execute" ? "command" : changes.length ? "file-change" : "tool"
  const title = text(tool.title) || text(tool.kind) || "Cursor tool"
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
        command: kind === "command" ? text(record(tool.rawInput).command) || title : undefined,
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
  const tools = new Map<string, { index: number; state: RecordValue }>()
  const chunks = new Map<string, { kind: string; index: number }>()
  const todos = new Map<string, Map<string, RecordValue>>()
  const todoEvents = new Map<string, number>()
  const appendChunk = (
    event: CanonicalEvent,
    turn: string,
    _params: RecordValue,
    update: RecordValue,
  ): void => {
    const kind = update.sessionUpdate === "agent_message_chunk" ? "assistant" : "reasoning"
    const content = record(update.content)
    if (content.type !== "text") {
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
      result[previous.index] = { ...first, text: (first.text ?? "") + text(content.text) }
    } else {
      chunks.set(turn, { kind, index: result.length })
      result.push({ ...event, kind, text: text(content.text) })
    }
  }
  const appendTool = (
    event: CanonicalEvent,
    turn: string,
    _params: RecordValue,
    update: RecordValue,
  ): void => {
    chunks.delete(turn)
    const key = `${turn}:${text(update.toolCallId)}`
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
    params: RecordValue,
    update: RecordValue,
  ): void => {
    const state =
      params.merge === true ? new Map(todos.get(event.threadId)) : new Map<string, RecordValue>()
    for (const [index, entry] of records(params.todos ?? update.entries).entries())
      state.set(text(entry.id) || String(index), entry)
    todos.set(event.threadId, state)
    const body = [...state.values()]
      .map(
        (entry) =>
          `- ${entry.status === "completed" ? "[x]" : "[ ]"} ${text(entry.content)} (${text(entry.status)})`,
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
  const appendStatus = (event: CanonicalEvent, params: RecordValue, update: RecordValue): void => {
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
  const append = (event: CanonicalEvent): void => {
    if (!event.method.startsWith("cursor/")) {
      result.push(event)
      return
    }
    if (event.method === "cursor/acp/session/replay" || event.kind === "unknown") return
    const turn = event.turnId ?? event.threadId
    const params = record(event.payload),
      update = record(params.update)
    if (
      event.method === "cursor/acp/session/update" &&
      ["agent_message_chunk", "agent_thought_chunk"].includes(text(update.sessionUpdate))
    ) {
      appendChunk(event, turn, params, update)
      return
    }
    if (["tool_call", "tool_call_update"].includes(text(update.sessionUpdate))) {
      appendTool(event, turn, params, update)
      return
    }
    if (event.method === "cursor/update_todos" || update.sessionUpdate === "plan") {
      appendPlan(event, turn, params, update)
      return
    }
    if (["cursor/task", "cursor/generate_image"].includes(event.method)) {
      chunks.delete(turn)
      result.push({
        ...event,
        kind: "tool",
        text: text(params.description) || "Cursor activity",
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

const cursorStateText = (method: string, params: RecordValue, update: RecordValue): string => {
  if (update.sessionUpdate === "usage_update")
    return `Context: ${String(update.used)} / ${String(update.size)} tokens${update.cost ? ` · ${JSON.stringify(update.cost)}` : ""}`
  if (update.sessionUpdate === "current_mode_update")
    return `Cursor mode: ${text(update.currentModeId)}`
  if (update.sessionUpdate === "config_option_update")
    return records(update.configOptions)
      .map((option) => `${text(option.name)}: ${text(option.currentValue)}`)
      .join(" · ")
  if (update.sessionUpdate === "available_commands_update")
    return records(update.availableCommands)
      .map((command) => `/${text(command.name)} — ${text(command.description)}`)
      .join("\n")
  if (method === "cursor/acp/session/prompt/result" && params.stopReason !== "end_turn")
    return `Cursor stopped: ${text(params.stopReason).replaceAll("_", " ")}`
  return ""
}
