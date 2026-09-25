import { decodeNativePayload, NativeItem } from "@meldshell/contracts"
import { Either, Schema } from "effect"
import type { JsonRpcNotification } from "./client"

const decodeThreadReference = Schema.decodeUnknownEither(
  Schema.Struct({
    threadId: Schema.optional(Schema.String),
    thread: Schema.optional(Schema.Struct({ id: Schema.String })),
  }),
)
const decodeTurnReference = Schema.decodeUnknownEither(
  Schema.Struct({
    turnId: Schema.optional(Schema.String),
    turn: Schema.optional(Schema.Struct({ id: Schema.optional(Schema.String) })),
  }),
)

export const nativeThreadIdOf = (message: JsonRpcNotification): string | null => {
  const decoded = decodeThreadReference(message.params)
  if (Either.isLeft(decoded)) return null
  return decoded.right.threadId ?? decoded.right.thread?.id ?? null
}

export const nativeTurnIdOf = (message: JsonRpcNotification): string | undefined => {
  const decoded = decodeTurnReference(message.params)
  if (Either.isLeft(decoded)) return undefined
  return decoded.right.turnId ?? decoded.right.turn?.id ?? undefined
}

export const agentMessageText = (item: unknown): string | null => {
  const decoded = Schema.decodeUnknownEither(NativeItem)(item)
  if (Either.isLeft(decoded)) return null
  return decoded.right.type === "agentMessage" && typeof decoded.right.text === "string"
    ? decoded.right.text
    : null
}

/** Completed turns repeat their items, so a dropped item/completed still yields its answer. */
export const finalMessageText = (params: unknown): string | null => {
  const decoded = decodeNativePayload(params)
  if (Either.isLeft(decoded)) return null
  for (const item of decoded.right.turn?.items?.toReversed() ?? []) {
    if (item.type === "agentMessage" && typeof item.text === "string") return item.text
  }
  return null
}
