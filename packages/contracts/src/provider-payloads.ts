import { Schema } from "effect"

const text = Schema.optional(Schema.NullOr(Schema.String))
const textParts = Schema.optional(
  Schema.NullOr(Schema.Union(Schema.String, Schema.Array(Schema.Unknown))),
)
export const PlanStep = Schema.Struct({ step: text, content: text, status: text })
export const NativeItem = Schema.Struct({
  id: text,
  type: text,
  phase: text,
  parentToolUseId: text,
  text: textParts,
  message: textParts,
  summary: textParts,
  review: textParts,
  command: textParts,
  plan: Schema.optional(Schema.Unknown),
  content: Schema.optional(Schema.Unknown),
  tool: text,
  aggregatedOutput: text,
  changes: Schema.optional(
    Schema.Array(
      Schema.Struct({
        path: Schema.String,
        kind: Schema.Struct({ type: Schema.String }),
      }),
    ),
  ),
})
export type NativeItem = typeof NativeItem.Type

/** Fields consumed by canonical projection. Provider-owned extensions stay in the native payload. */
export const NativePayload = Schema.Struct({
  itemId: text,
  threadId: text,
  turnId: text,
  thread: Schema.optional(Schema.Struct({ id: Schema.String })),
  turn: Schema.optional(
    Schema.Struct({
      id: text,
      status: text,
      items: Schema.optional(Schema.Array(NativeItem)),
    }),
  ),
  item: Schema.optional(Schema.NullOr(NativeItem)),
  delta: text,
  explanation: text,
  message: text,
  diff: text,
  /** Codex MCP startup, login, and sandbox setup notifications report a bare string. */
  error: Schema.optional(
    Schema.NullOr(Schema.Union(Schema.String, Schema.Struct({ message: text }))),
  ),
  plan: Schema.optional(Schema.Union(Schema.String, Schema.Array(PlanStep))),
  toolName: text,
  command: textParts,
  reason: text,
})
export type NativePayload = typeof NativePayload.Type

export const CursorContent = Schema.Struct({
  type: Schema.String,
  text,
  title: text,
  name: text,
  uri: text,
  resource: Schema.optional(Schema.Struct({ text, uri: text })),
})
export type CursorContent = typeof CursorContent.Type
export const CursorToolContent = Schema.Struct({
  type: Schema.String,
  content: Schema.optional(CursorContent),
  path: text,
  oldText: text,
  newText: text,
})
export const CursorTodo = Schema.Struct({ id: text, content: Schema.String, status: Schema.String })
const CursorCommand = Schema.Struct({ name: Schema.String, description: Schema.String })
export const CursorUpdate = Schema.Struct({
  sessionUpdate: Schema.String,
  toolCallId: text,
  kind: text,
  title: text,
  status: text,
  content: Schema.optional(Schema.Union(CursorContent, Schema.Array(CursorToolContent))),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
  entries: Schema.optional(Schema.Array(CursorTodo)),
  used: Schema.optional(Schema.Number),
  size: Schema.optional(Schema.Number),
  cost: Schema.optional(Schema.Unknown),
  currentModeId: text,
  availableCommands: Schema.optional(Schema.Array(CursorCommand)),
  configOptions: Schema.optional(
    Schema.Array(
      Schema.Struct({ name: Schema.String, currentValue: Schema.String, id: text, category: text }),
    ),
  ),
})
export type CursorUpdate = typeof CursorUpdate.Type
export const CursorQuestion = Schema.Struct({
  id: Schema.String,
  prompt: Schema.String,
  allowMultiple: Schema.optional(Schema.Boolean),
  options: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })),
})
const CursorPermissionOption = Schema.Struct({
  optionId: Schema.String,
  name: Schema.String,
  kind: Schema.String,
})
export const CursorPayload = Schema.Struct({
  sessionId: text,
  toolCallId: text,
  message: text,
  plan: text,
  description: text,
  title: text,
  overview: text,
  filePath: text,
  agentId: text,
  stopReason: text,
  merge: Schema.optional(Schema.Boolean),
  todos: Schema.optional(Schema.Array(CursorTodo)),
  update: Schema.optional(CursorUpdate),
  toolCall: Schema.optional(Schema.Struct({ title: text })),
  options: Schema.optional(Schema.Array(CursorPermissionOption)),
  questions: Schema.optional(Schema.Array(CursorQuestion)),
})
export type CursorPayload = typeof CursorPayload.Type

/** Decoders expose ParseError paths; retaining excess fields never changes the stored native data. */
export const decodeNativePayload = Schema.decodeUnknownEither(NativePayload, {
  onExcessProperty: "preserve",
})
export const decodeCursorPayload = Schema.decodeUnknownEither(CursorPayload, {
  onExcessProperty: "preserve",
})

const update = CursorUpdate.fields
export const CursorSessionNotification = Schema.Struct({
  sessionId: Schema.String,
  update: Schema.Union(
    Schema.Struct({
      ...update,
      sessionUpdate: Schema.Literal(
        "agent_message_chunk",
        "agent_thought_chunk",
        "user_message_chunk",
      ),
      content: CursorContent,
    }),
    Schema.Struct({
      ...update,
      sessionUpdate: Schema.Literal("tool_call", "tool_call_update"),
      toolCallId: Schema.String,
      content: Schema.optional(Schema.Array(CursorToolContent)),
    }),
    Schema.Struct({
      ...update,
      sessionUpdate: Schema.Literal("plan"),
      entries: Schema.Array(CursorTodo),
    }),
    Schema.Struct({
      ...update,
      sessionUpdate: Schema.Literal("available_commands_update"),
      availableCommands: Schema.Array(CursorCommand),
    }),
    Schema.Struct({
      ...update,
      sessionUpdate: Schema.Literal("config_option_update"),
      configOptions: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          currentValue: Schema.String,
          id: text,
          category: text,
        }),
      ),
    }),
    Schema.Struct({
      ...update,
      sessionUpdate: Schema.Literal("current_mode_update"),
      currentModeId: Schema.String,
    }),
    Schema.Struct({
      ...update,
      sessionUpdate: Schema.Literal("usage_update"),
      used: Schema.Number,
      size: Schema.Number,
    }),
    Schema.Struct({ ...update, sessionUpdate: Schema.Literal("session_info_update") }),
  ),
})
