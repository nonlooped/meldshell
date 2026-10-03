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

/** Pi's text and thinking deltas; the latest cumulative usage replaces earlier readings. */
const piDelta = (
  input: RuntimeEventInput,
): { text: string; fields: unknown; replace: (text: string) => unknown } | undefined => {
  if (input.method !== "pi/message_update") return
  const params = input.params as {
    usage?: unknown
    assistantMessageEvent?: { type?: string; delta?: unknown }
  } | null
  const update = params?.assistantMessageEvent
  if (
    !update ||
    !["text_delta", "thinking_delta"].includes(update.type ?? "") ||
    typeof update.delta !== "string"
  )
    return
  const { delta: text, ...eventFields } = update
  const { usage: _usage, ...fields } = params
  return {
    text,
    fields: { ...fields, assistantMessageEvent: eventFields },
    replace: (next) => ({ ...params, assistantMessageEvent: { ...update, delta: next } }),
  }
}

const nativeDelta = (input: RuntimeEventInput) => cursorDelta(input) ?? piDelta(input)

export const isRuntimeDelta = (input: RuntimeEventInput): boolean =>
  input.validated === true &&
  input.requestId === undefined &&
  (nativeDelta(input) !== undefined ||
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
  const native = nativeDelta(input),
    previousNative = nativeDelta(previous)
  if (Boolean(native) !== Boolean(previousNative)) return
  if (native && previousNative) {
    if (
      native.text.length + previousNative.text.length > 65_536 ||
      !isDeepStrictEqual(envelope, previousEnvelope) ||
      !isDeepStrictEqual(native.fields, previousNative.fields)
    )
      return
    return { ...input, params: native.replace(previousNative.text + native.text) }
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
