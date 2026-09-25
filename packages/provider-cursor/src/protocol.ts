import { Either, Schema, type ParseResult } from "effect"
import {
  asRecord,
  CursorPayload,
  CursorSessionNotification,
  asRecords,
  asText,
  type ProviderModelCatalogEntry,
  type TurnDispatch,
  type UnknownRecord,
} from "@meldshell/contracts"
import type { ContentBlock, RequestPermissionResponse } from "@agentclientprotocol/sdk"
import { readFile } from "node:fs/promises"
import { referenceText } from "@meldshell/provider-runtime"
import mime from "mime/lite"

export const cursorModels = (
  session: UnknownRecord,
  image: boolean,
): ProviderModelCatalogEntry[] => {
  const models = asRecord(session.models)
  return asRecords(models.availableModels)
    .filter((model) => asText(model.modelId))
    .map((model) => ({
      catalogId: asText(model.modelId),
      slug: asText(model.modelId),
      displayName: asText(model.name) || asText(model.modelId),
      description: asText(model.description),
      reasoningEfforts: [],
      defaultReasoningEffort: null,
      serviceTiers: [],
      defaultServiceTier: null,
      additionalSpeedTiers: [],
      fastServiceTier: null,
      inputModalities: image ? ["text", "image"] : ["text"],
      supportsPersonality: false,
      isDefault: model.modelId === models.currentModelId,
      hidden: false,
      upgrade: null,
      modelSpecialty: null,
      multiAgentVersion: null,
    }))
}

/** The image formats Cursor accepts in a prompt. */
const CURSOR_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])

export const cursorPrompt = async (
  dispatch: TurnDispatch,
  images: boolean,
): Promise<ContentBlock[]> => {
  const prompt: ContentBlock[] = [{ type: "text", text: dispatch.text }]
  for (const attachment of dispatch.attachments) {
    if (attachment.type === "mention" || attachment.type === "skill") {
      prompt.push({
        type: "text",
        text: referenceText(attachment),
      })
      continue
    }
    if (!images) throw new Error("This Cursor release does not advertise image input.")
    if (attachment.type === "localImage") {
      const mimeType = mime.getType(attachment.value)
      if (mimeType === null || !CURSOR_IMAGE_TYPES.has(mimeType))
        throw new Error("Unsupported Cursor image format.")
      prompt.push({
        type: "image",
        mimeType,
        data: (await readFile(attachment.value)).toString("base64"),
      })
    } else {
      const match = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(attachment.value)
      if (!match || !CURSOR_IMAGE_TYPES.has(match[1]!))
        throw new Error("Cursor image attachments must contain image data.")
      prompt.push({ type: "image", mimeType: match[1]!, data: match[2]! })
    }
  }
  return prompt
}

/** Cursor's reply to a permission request; cancelling declines without choosing an option. */
export function permissionResponse(
  params: UnknownRecord,
  decision: string,
  optionId?: string,
): RequestPermissionResponse {
  if (decision === "cancel") return { outcome: { outcome: "cancelled" } }
  const option = asRecords(params.options).find((entry) => entry.optionId === optionId)
  if (!option) throw new Error("Choose one of Cursor's advertised permission options.")
  return { outcome: { outcome: "selected", optionId: asText(option.optionId) } }
}

export const planResponse = (decision: string): UnknownRecord => ({
  outcome: {
    outcome: decision === "accept" ? "accepted" : decision === "cancel" ? "cancelled" : "rejected",
  },
})

export function questionResponse(
  params: UnknownRecord,
  decision: string,
  answers?: Readonly<Record<string, ReadonlyArray<string>>>,
): UnknownRecord {
  if (decision !== "accept")
    return { outcome: { outcome: decision === "cancel" ? "cancelled" : "skipped" } }
  const selected = asRecords(params.questions).map((question) => {
    const values = [...new Set(answers?.[asText(question.id)] ?? [])]
    if (
      !values.length ||
      (!question.allowMultiple && values.length !== 1) ||
      values.some((value) => !asRecords(question.options).some((option) => option.id === value))
    )
      throw new Error("Choose valid answers for each Cursor question.")
    return { questionId: question.id, selectedOptionIds: values }
  })
  return { outcome: { outcome: "answered", answers: selected } }
}

/**
 * The answer to a permission request that the thread's settings already decide: never asking means
 * full access allows once and anything else rejects. Null when the user should be asked.
 */
export const automaticPermission = (
  permissions: Pick<TurnDispatch, "sandbox" | "approvalPolicy"> | undefined,
  params: UnknownRecord,
): { decision: string; optionId?: string } | null => {
  if (permissions?.approvalPolicy !== "never") return null
  const kind = permissions.sandbox === "danger-full-access" ? "allow_once" : "reject_once"
  const option = asRecords(params.options).find((entry) => entry.kind === kind)
  if (option) return { decision: "accept", optionId: asText(option.optionId) }
  return kind === "reject_once" ? { decision: "cancel" } : null
}

export const nativeMethod = (method: string): string =>
  method.startsWith("cursor/") ? method : `cursor/acp/${method}`

const decodeUpdateKind = Schema.decodeUnknownEither(
  Schema.Struct({ update: Schema.Struct({ sessionUpdate: Schema.String }) }),
)

const SESSION_UPDATES = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "user_message_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
  "available_commands_update",
  "config_option_update",
  "current_mode_update",
  "usage_update",
  "session_info_update",
])

const decodeSessionNotification = Schema.decodeUnknownEither(CursorSessionNotification, {
  onExcessProperty: "preserve",
})
const decodeExtensionNotification = Schema.decodeUnknownEither(
  Schema.Struct({
    ...CursorPayload.fields,
    toolCallId: Schema.String,
  }),
  { onExcessProperty: "preserve" },
)

/** Undefined means an unknown extension; Left means a malformed known notification. */
export const decodeNotification = (
  method: string,
  params: unknown,
): Either.Either<CursorPayload, ParseResult.ParseError> | undefined => {
  if (method === "session/update") {
    const envelope = decodeUpdateKind(params)
    if (
      Either.isRight(envelope) &&
      envelope.right.update &&
      !SESSION_UPDATES.has(envelope.right.update.sessionUpdate)
    )
      return undefined
    return decodeSessionNotification(params)
  }
  if (["cursor/update_todos", "cursor/task", "cursor/generate_image"].includes(method))
    return decodeExtensionNotification(params)
  return undefined
}
