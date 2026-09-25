import { asRecord } from "@meldshell/contracts"
import type { JsonRpcNotification } from "./client"

/** The Codex thread a notification or server request belongs to. */
export const nativeThreadIdOf = (message: JsonRpcNotification): string | null => {
  const params = asRecord(message.params)
  if (typeof params.threadId === "string") return params.threadId
  const thread = asRecord(params.thread)
  return "id" in thread ? String(thread.id) : null
}

/** The Codex turn a notification or server request belongs to, when it names one. */
export const nativeTurnIdOf = (message: JsonRpcNotification): string | undefined => {
  const params = asRecord(message.params)
  if (typeof params.turnId === "string") return params.turnId
  const turn = asRecord(params.turn)
  return "id" in turn ? String(turn.id) : undefined
}

export const agentMessageText = (item: unknown): string | null => {
  const record = asRecord(item)
  return record.type === "agentMessage" && typeof record.text === "string" ? record.text : null
}

/** The completed turn repeats its items, so a dropped `item/completed` still yields its answer. */
export const finalMessageText = (params: unknown): string | null => {
  const items = asRecord(asRecord(params).turn).items
  if (!Array.isArray(items)) return null
  for (const item of items.toReversed()) {
    const text = agentMessageText(item)
    if (text !== null) return text
  }
  return null
}
