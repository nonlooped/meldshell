import {
  asRecord,
  asRecords,
  asText,
  type CanonicalEvent,
  type CanonicalEventKind,
  type UnknownRecord,
} from "@meldshell/contracts"

const contentText = (value: unknown): string => {
  const block = asRecord(value)
  if (block.type === "text") return asText(block.text)
  if (block.type === "resource")
    return asText(asRecord(block.resource).text) || asText(asRecord(block.resource).uri)
  if (block.type === "resource_link")
    return asText(block.title) || asText(block.name) || asText(block.uri)
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
  const update = asRecord(asRecord(params).update)
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
  const p = asRecord(params)
  if (method === "cursor/acp/error") return asText(p.message)
  if (method === "cursor/create_plan") return asText(p.plan)
  if (method === "cursor/task" || method === "cursor/generate_image") return asText(p.description)
  const update = asRecord(p.update)
  return contentText(update.content) || asText(update.title) || null
}

const diffText = (oldText: string, newText: string): string => {
  const lines = (value: string): string[] =>
    value === "" ? [] : value.replace(/\n$/, "").split("\n")
  const before = lines(oldText),
    after = lines(newText)
  return `@@ -${before.length ? 1 : 0},${before.length} +${after.length ? 1 : 0},${after.length} @@\n${[...before.map((line) => `-${line}`), ...after.map((line) => `+${line}`)].join("\n")}\n`
}

const toolEvent = (event: CanonicalEvent, tool: UnknownRecord): CanonicalEvent => {
  const content = asRecords(tool.content)
  const output = content
    .map((entry) => (entry.type === "content" ? contentText(entry.content) : ""))
    .filter(Boolean)
    .join("\n\n")
  const changes = content
    .filter((entry) => entry.type === "diff")
    .map((entry) => ({
      path: asText(entry.path),
      kind: { type: entry.oldText === null ? "add" : "update" },
      diff: diffText(asText(entry.oldText), asText(entry.newText)),
    }))
  const kind = tool.kind === "execute" ? "command" : changes.length ? "file-change" : "tool"
  const title = asText(tool.title) || asText(tool.kind) || "Cursor tool"
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
        command: kind === "command" ? asText(asRecord(tool.rawInput).command) || title : undefined,
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
  const tools = new Map<string, { index: number; state: UnknownRecord }>()
  const chunks = new Map<string, { kind: string; index: number }>()
  const todos = new Map<string, Map<string, UnknownRecord>>()
  const todoEvents = new Map<string, number>()
  const appendChunk = (
    event: CanonicalEvent,
    turn: string,
    _params: UnknownRecord,
    update: UnknownRecord,
  ): void => {
    const kind = update.sessionUpdate === "agent_message_chunk" ? "assistant" : "reasoning"
    const content = asRecord(update.content)
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
      result[previous.index] = { ...first, text: (first.text ?? "") + asText(content.text) }
    } else {
      chunks.set(turn, { kind, index: result.length })
      result.push({ ...event, kind, text: asText(content.text) })
    }
  }
  const appendTool = (
    event: CanonicalEvent,
    turn: string,
    _params: UnknownRecord,
    update: UnknownRecord,
  ): void => {
    chunks.delete(turn)
    const key = `${turn}:${asText(update.toolCallId)}`
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
    params: UnknownRecord,
    update: UnknownRecord,
  ): void => {
    const state =
      params.merge === true ? new Map(todos.get(event.threadId)) : new Map<string, UnknownRecord>()
    for (const [index, entry] of asRecords(params.todos ?? update.entries).entries())
      state.set(asText(entry.id) || String(index), entry)
    todos.set(event.threadId, state)
    const body = [...state.values()]
      .map(
        (entry) =>
          `- ${entry.status === "completed" ? "[x]" : "[ ]"} ${asText(entry.content)} (${asText(entry.status)})`,
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
    params: UnknownRecord,
    update: UnknownRecord,
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
  const append = (event: CanonicalEvent): void => {
    if (!event.method.startsWith("cursor/")) {
      result.push(event)
      return
    }
    if (event.method === "cursor/acp/session/replay" || event.kind === "unknown") return
    const turn = event.turnId ?? event.threadId
    const params = asRecord(event.payload),
      update = asRecord(params.update)
    if (
      event.method === "cursor/acp/session/update" &&
      ["agent_message_chunk", "agent_thought_chunk"].includes(asText(update.sessionUpdate))
    ) {
      appendChunk(event, turn, params, update)
      return
    }
    if (["tool_call", "tool_call_update"].includes(asText(update.sessionUpdate))) {
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
        text: asText(params.description) || "Cursor activity",
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

const cursorStateText = (method: string, params: UnknownRecord, update: UnknownRecord): string => {
  if (update.sessionUpdate === "usage_update")
    return `Context: ${String(update.used)} / ${String(update.size)} tokens${update.cost ? ` · ${JSON.stringify(update.cost)}` : ""}`
  if (update.sessionUpdate === "current_mode_update")
    return `Cursor mode: ${asText(update.currentModeId)}`
  if (update.sessionUpdate === "config_option_update")
    return asRecords(update.configOptions)
      .map((option) => `${asText(option.name)}: ${asText(option.currentValue)}`)
      .join(" · ")
  if (update.sessionUpdate === "available_commands_update")
    return asRecords(update.availableCommands)
      .map((command) => `/${asText(command.name)} — ${asText(command.description)}`)
      .join("\n")
  if (method === "cursor/acp/session/prompt/result" && params.stopReason !== "end_turn")
    return `Cursor stopped: ${asText(params.stopReason).replaceAll("_", " ")}`
  return ""
}
