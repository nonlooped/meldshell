import { Schema } from "effect"

/** Provider schemas validate known fields while preserving native extensions at every depth. */
const providerStruct = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [Schema.Record(Schema.String, Schema.Unknown)])

const text = Schema.optional(Schema.NullOr(Schema.String))
const textParts = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Array(Schema.Unknown)])),
)
export const PlanStep = providerStruct({ step: text, content: text, status: text })
export const NativeItem = providerStruct({
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
      providerStruct({
        path: Schema.String,
        kind: providerStruct({ type: Schema.String }),
      }),
    ),
  ),
})
export type NativeItem = typeof NativeItem.Type

/** Fields consumed by canonical projection. Provider-owned extensions stay in the native payload. */
export const NativePayload = providerStruct({
  itemId: text,
  threadId: text,
  turnId: text,
  thread: Schema.optional(providerStruct({ id: Schema.String })),
  turn: Schema.optional(
    providerStruct({
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
    Schema.NullOr(Schema.Union([Schema.String, providerStruct({ message: text })])),
  ),
  plan: Schema.optional(Schema.Union([Schema.String, Schema.Array(PlanStep)])),
  toolName: text,
  command: textParts,
  reason: text,
})
export type NativePayload = typeof NativePayload.Type

export const CursorContent = providerStruct({
  type: Schema.String,
  text,
  title: text,
  name: text,
  uri: text,
  resource: Schema.optional(providerStruct({ text, uri: text })),
})
export type CursorContent = typeof CursorContent.Type
export const CursorToolContent = providerStruct({
  type: Schema.String,
  content: Schema.optional(CursorContent),
  path: text,
  oldText: text,
  newText: text,
})
export const CursorTodo = providerStruct({
  id: text,
  content: Schema.String,
  status: Schema.String,
})
const CursorCommand = providerStruct({ name: Schema.String, description: Schema.String })
export const CursorUpdate = providerStruct({
  sessionUpdate: Schema.String,
  toolCallId: text,
  kind: text,
  title: text,
  status: text,
  content: Schema.optional(Schema.Union([CursorContent, Schema.Array(CursorToolContent)])),
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
      providerStruct({
        name: Schema.String,
        currentValue: Schema.String,
        id: text,
        category: text,
      }),
    ),
  ),
})
export type CursorUpdate = typeof CursorUpdate.Type
export const CursorQuestion = providerStruct({
  id: Schema.String,
  prompt: Schema.String,
  allowMultiple: Schema.optional(Schema.Boolean),
  options: Schema.Array(providerStruct({ id: Schema.String, label: Schema.String })),
})
const CursorPermissionOption = providerStruct({
  optionId: Schema.String,
  name: Schema.String,
  kind: Schema.String,
})
export const CursorPayload = providerStruct({
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
  toolCall: Schema.optional(providerStruct({ title: text })),
  options: Schema.optional(Schema.Array(CursorPermissionOption)),
  questions: Schema.optional(Schema.Array(CursorQuestion)),
})
export type CursorPayload = typeof CursorPayload.Type

/** Decoders expose SchemaError paths; retaining excess fields never changes the stored native data. */
export const decodeNativePayload = Schema.decodeUnknownResult(NativePayload)
export const decodeCursorPayload = Schema.decodeUnknownResult(CursorPayload)

const update = CursorUpdate.schema.fields
export const CursorSessionNotification = providerStruct({
  sessionId: Schema.String,
  update: Schema.Union([
    providerStruct({
      ...update,
      sessionUpdate: Schema.Literals([
        "agent_message_chunk",
        "agent_thought_chunk",
        "user_message_chunk",
      ]),
      content: CursorContent,
    }),
    providerStruct({
      ...update,
      sessionUpdate: Schema.Literals(["tool_call", "tool_call_update"]),
      toolCallId: Schema.String,
      content: Schema.optional(Schema.Array(CursorToolContent)),
    }),
    providerStruct({
      ...update,
      sessionUpdate: Schema.Literal("plan"),
      entries: Schema.Array(CursorTodo),
    }),
    providerStruct({
      ...update,
      sessionUpdate: Schema.Literal("available_commands_update"),
      availableCommands: Schema.Array(CursorCommand),
    }),
    providerStruct({
      ...update,
      sessionUpdate: Schema.Literal("config_option_update"),
      configOptions: Schema.Array(
        providerStruct({
          name: Schema.String,
          currentValue: Schema.String,
          id: text,
          category: text,
        }),
      ),
    }),
    providerStruct({
      ...update,
      sessionUpdate: Schema.Literal("current_mode_update"),
      currentModeId: Schema.String,
    }),
    providerStruct({
      ...update,
      sessionUpdate: Schema.Literal("usage_update"),
      used: Schema.Number,
      size: Schema.Number,
    }),
    providerStruct({ ...update, sessionUpdate: Schema.Literal("session_info_update") }),
  ]),
})

/** A content block of a Pi message: text, thinking, an image, or a tool call. */
export const PiContent = providerStruct({
  type: Schema.String,
  text,
  thinking: text,
  id: text,
  name: text,
  arguments: Schema.optional(Schema.Unknown),
})
export type PiContent = typeof PiContent.Type

/** A Pi `AgentMessage`; its role decides which fields are present. */
export const PiMessage = providerStruct({
  role: Schema.String,
  content: Schema.optional(Schema.Union([Schema.String, Schema.Array(PiContent)])),
  stopReason: text,
  errorMessage: text,
  toolCallId: text,
  toolName: text,
  isError: Schema.optional(Schema.Boolean),
  details: Schema.optional(Schema.Unknown),
  usage: Schema.optional(Schema.Unknown),
  command: text,
  output: text,
  summary: text,
})
export type PiMessage = typeof PiMessage.Type

/** The delta a streaming assistant message emitted, as Pi's RPC mode sends it. */
const PiAssistantMessageEvent = providerStruct({
  type: Schema.String,
  contentIndex: Schema.optional(Schema.Number),
  delta: text,
  content: Schema.optional(Schema.Unknown),
  toolCall: Schema.optional(PiContent),
})

/**
 * One record of Pi's RPC event stream: a session event or an extension UI request. Extension
 * notifications carry `message` as text; message events carry the message itself.
 */
export const PiPayload = providerStruct({
  type: Schema.String,
  message: Schema.optional(Schema.Union([Schema.String, PiMessage])),
  assistantMessageEvent: Schema.optional(PiAssistantMessageEvent),
  toolCallId: text,
  toolName: text,
  args: Schema.optional(Schema.Unknown),
  partialResult: Schema.optional(Schema.Unknown),
  result: Schema.optional(Schema.Unknown),
  isError: Schema.optional(Schema.Boolean),
  reason: text,
  aborted: Schema.optional(Schema.Boolean),
  errorMessage: text,
  finalError: text,
  attempt: Schema.optional(Schema.Number),
  maxAttempts: Schema.optional(Schema.Number),
  success: Schema.optional(Schema.Boolean),
  id: text,
  method: text,
  title: text,
  notifyType: text,
})
export type PiPayload = typeof PiPayload.Type
export const decodePiPayload = Schema.decodeUnknownResult(PiPayload)

/** The dialog methods of Pi's RPC extension UI; its other methods expect no answer. */
const PI_DIALOG_METHODS = ["select", "confirm", "input", "editor"] as const

/** A dialog a Pi extension opened, as Pi's RPC mode sends it. */
export const PiDialog = providerStruct({
  type: Schema.Literal("extension_ui_request"),
  id: Schema.String,
  method: Schema.Literals(PI_DIALOG_METHODS),
  title: Schema.String,
  options: Schema.optional(Schema.Array(Schema.String)),
  message: text,
  placeholder: text,
  prefill: text,
  timeout: Schema.optional(Schema.Number),
})
export type PiDialog = typeof PiDialog.Type

/** The single question a Pi dialog asks. A confirmation offers these two answers. */
export const PI_DIALOG_QUESTION = "answer"
export const PI_CONFIRM_ANSWERS = { yes: "Yes", no: "No" } as const

/** A Pi dialog as the question it asks: its title, a confirmation's message, and its options. */
export const piDialogQuestion = (dialog: PiDialog) => {
  const choices =
    dialog.method === "select"
      ? (dialog.options ?? [])
      : dialog.method === "confirm"
        ? [PI_CONFIRM_ANSWERS.yes, PI_CONFIRM_ANSWERS.no]
        : null
  return {
    id: PI_DIALOG_QUESTION,
    header: dialog.title,
    question: dialog.method === "confirm" ? (dialog.message ?? "") || dialog.title : dialog.title,
    multiSelect: false,
    isOther: false,
    multiline: dialog.method === "editor",
    ...(dialog.method === "editor" && dialog.prefill ? { defaultValue: dialog.prefill } : {}),
    options: choices?.map((label) => ({ label, description: "" })) ?? null,
  }
}
