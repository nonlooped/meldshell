import { decodeNativePayload, NativeItem } from "@meldshell/contracts"
import { Result, Schema } from "effect"
import type { JsonRpcNotification } from "./client"

const decodeThreadReference = Schema.decodeUnknownResult(
  Schema.Struct({
    threadId: Schema.optional(Schema.String),
    thread: Schema.optional(Schema.Struct({ id: Schema.String })),
  }),
)
const decodeTurnReference = Schema.decodeUnknownResult(
  Schema.Struct({
    turnId: Schema.optional(Schema.String),
    turn: Schema.optional(Schema.Struct({ id: Schema.optional(Schema.String) })),
  }),
)

export const nativeThreadIdOf = (message: JsonRpcNotification): string | null => {
  const decoded = decodeThreadReference(message.params)
  if (Result.isFailure(decoded)) return null
  return decoded.success.threadId ?? decoded.success.thread?.id ?? null
}

export const nativeTurnIdOf = (message: JsonRpcNotification): string | undefined => {
  const decoded = decodeTurnReference(message.params)
  if (Result.isFailure(decoded)) return undefined
  return decoded.success.turnId ?? decoded.success.turn?.id ?? undefined
}

export const agentMessageText = (item: unknown): string | null => {
  const decoded = Schema.decodeUnknownResult(NativeItem)(item)
  if (Result.isFailure(decoded)) return null
  return decoded.success.type === "agentMessage" && typeof decoded.success.text === "string"
    ? decoded.success.text
    : null
}

/** Completed turns repeat their items, so a dropped item/completed still yields its answer. */
export const finalMessageText = (params: unknown): string | null => {
  const decoded = decodeNativePayload(params)
  if (Result.isFailure(decoded)) return null
  for (const item of decoded.success.turn?.items?.toReversed() ?? []) {
    if (item.type === "agentMessage" && typeof item.text === "string") return item.text
  }
  return null
}
