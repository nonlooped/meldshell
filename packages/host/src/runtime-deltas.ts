import type { RuntimeEventInput } from "@meldshell/contracts"
import { isDeepStrictEqual } from "node:util"

const cursorDelta = (
  input: RuntimeEventInput,
): { text: string; fields: unknown; replace: (text: string) => unknown } | undefined => {
  if (input.method !== "cursor/acp/session/update") return
  const params = input.params as {
    sessionId?: string
    update?: { sessionUpdate?: string; content?: { type?: string; text?: unknown } }
  } | null
  const update = params?.update
  if (
    !update ||
    !["agent_message_chunk", "agent_thought_chunk"].includes(update.sessionUpdate ?? "") ||
    update.content?.type !== "text" ||
    typeof update.content.text !== "string"
  )
    return
  const { text, ...contentFields } = update.content
  return {
    text,
    fields: { ...params, update: { ...update, content: contentFields } },
    replace: (next) => ({
      ...params,
      update: { ...update, content: { ...contentFields, text: next } },
    }),
  }
}

export const isRuntimeDelta = (input: RuntimeEventInput): boolean =>
  input.validated === true &&
  input.requestId === undefined &&
  (cursorDelta(input) !== undefined ||
    ((input.method.endsWith("/delta") || input.method.endsWith("/outputDelta")) &&
      typeof input.params === "object" &&
      input.params !== null &&
      "delta" in input.params &&
      typeof input.params.delta === "string"))

export const mergeRuntimeDelta = (
  previous: RuntimeEventInput | undefined,
  input: RuntimeEventInput,
): RuntimeEventInput | undefined => {
  if (previous === undefined || !isRuntimeDelta(previous) || !isRuntimeDelta(input)) return
  const { params: previousParams, ...previousEnvelope } = previous
  const { params, ...envelope } = input
  const cursor = cursorDelta(input),
    previousCursor = cursorDelta(previous)
  if (Boolean(cursor) !== Boolean(previousCursor)) return
  if (cursor && previousCursor) {
    if (
      cursor.text.length + previousCursor.text.length > 65_536 ||
      !isDeepStrictEqual(envelope, previousEnvelope) ||
      !isDeepStrictEqual(cursor.fields, previousCursor.fields)
    )
      return
    return { ...input, params: cursor.replace(previousCursor.text + cursor.text) }
  }
  const { delta: previousText, ...previousFields } = previousParams as Record<string, unknown> & {
    delta: string
  }
  const { delta: text, ...fields } = params as Record<string, unknown> & { delta: string }
  // Keep routing, indexes, and all other native metadata intact. Bound each database write.
  if (
    previousText.length + text.length > 65_536 ||
    !isDeepStrictEqual(previousEnvelope, envelope) ||
    !isDeepStrictEqual(previousFields, fields)
  )
    return
  return { ...input, params: { ...fields, delta: previousText + text } }
}
