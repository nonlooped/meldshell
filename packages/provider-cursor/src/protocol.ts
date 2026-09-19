import type { ProviderModelCatalogEntry, TurnDispatch } from "@meldshell/contracts"
import type { ContentBlock, RequestPermissionResponse } from "@agentclientprotocol/sdk"
import { readFile } from "node:fs/promises"
import { extname } from "node:path"
import { record, records, text, type RecordValue } from "./client"

export const cursorModels = (session: RecordValue, image: boolean): ProviderModelCatalogEntry[] => {
  const models = record(session.models)
  return records(models.availableModels)
    .filter((model) => text(model.modelId))
    .map((model) => ({
      catalogId: text(model.modelId),
      slug: text(model.modelId),
      displayName: text(model.name) || text(model.modelId),
      description: text(model.description),
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

export const cursorPrompt = async (
  dispatch: TurnDispatch,
  images: boolean,
): Promise<ContentBlock[]> => {
  const prompt: ContentBlock[] = [{ type: "text", text: dispatch.text }]
  for (const attachment of dispatch.attachments) {
    if (attachment.type === "mention" || attachment.type === "skill") {
      prompt.push({
        type: "text",
        text: `${attachment.type === "skill" ? "Read and follow this skill" : "Referenced file"}: ${attachment.value}`,
      })
      continue
    }
    if (!images) throw new Error("This Cursor release does not advertise image input.")
    if (attachment.type === "localImage") {
      const mime = (
        {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".gif": "image/gif",
        } as Record<string, string>
      )[extname(attachment.value).toLowerCase()]
      if (!mime) throw new Error("Unsupported Cursor image format.")
      prompt.push({
        type: "image",
        mimeType: mime,
        data: (await readFile(attachment.value)).toString("base64"),
      })
    } else {
      const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
        attachment.value,
      )
      if (!match) throw new Error("Cursor image attachments must contain image data.")
      prompt.push({ type: "image", mimeType: match[1]!, data: match[2]! })
    }
  }
  return prompt
}

export function interactionResponse(
  method: "session/request_permission",
  params: RecordValue,
  decision: string,
  answers?: Readonly<Record<string, ReadonlyArray<string>>>,
  optionId?: string,
): RequestPermissionResponse
export function interactionResponse(
  method: string,
  params: RecordValue,
  decision: string,
  answers?: Readonly<Record<string, ReadonlyArray<string>>>,
  optionId?: string,
): RecordValue
export function interactionResponse(
  method: string,
  params: RecordValue,
  decision: string,
  answers?: Readonly<Record<string, ReadonlyArray<string>>>,
  optionId?: string,
): RecordValue {
  if (method === "session/request_permission") {
    if (decision === "cancel") return { outcome: { outcome: "cancelled" } }
    const option = records(params.options).find((entry) => entry.optionId === optionId)
    if (!option) throw new Error("Choose one of Cursor's advertised permission options.")
    return { outcome: { outcome: "selected", optionId: option.optionId } }
  }
  if (method === "cursor/create_plan")
    return {
      outcome: {
        outcome:
          decision === "accept" ? "accepted" : decision === "cancel" ? "cancelled" : "rejected",
      },
    }
  if (decision !== "accept")
    return { outcome: { outcome: decision === "cancel" ? "cancelled" : "skipped" } }
  const selected = records(params.questions).map((question) => {
    const values = [...new Set(answers?.[text(question.id)] ?? [])]
    if (
      !values.length ||
      (!question.allowMultiple && values.length !== 1) ||
      values.some((value) => !records(question.options).some((option) => option.id === value))
    )
      throw new Error("Choose valid answers for each Cursor question.")
    return { questionId: question.id, selectedOptionIds: values }
  })
  return { outcome: { outcome: "answered", answers: selected } }
}

export const nativeMethod = (method: string): string =>
  method.startsWith("cursor/") ? method : `cursor/acp/${method}`

export const knownNotification = (method: string, params: unknown): boolean => {
  const p = record(params)
  if (method.startsWith("cursor/"))
    return (
      ["cursor/update_todos", "cursor/task", "cursor/generate_image"].includes(method) &&
      typeof p.toolCallId === "string"
    )
  if (method !== "session/update" || typeof p.sessionId !== "string") return false
  const update = record(p.update)
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
    case "agent_thought_chunk":
    case "user_message_chunk":
      return typeof record(update.content).type === "string"
    case "tool_call":
    case "tool_call_update":
      return typeof update.toolCallId === "string"
    case "plan":
      return Array.isArray(update.entries)
    case "available_commands_update":
      return Array.isArray(update.availableCommands)
    case "current_mode_update":
      return typeof update.currentModeId === "string"
    case "config_option_update":
      return Array.isArray(update.configOptions)
    case "session_info_update":
      return true
    case "usage_update":
      return typeof update.used === "number" && typeof update.size === "number"
    default:
      return false
  }
}
