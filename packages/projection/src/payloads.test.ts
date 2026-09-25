import assert from "node:assert/strict"
import { test } from "node:test"
import { decodeCursorPayload, decodeNativePayload, type CanonicalEvent } from "@meldshell/contracts"
import { Either } from "effect"
import { prepareTranscriptEvents } from "./transcript"

const event = (payload: unknown): CanonicalEvent => ({
  id: "e",
  threadId: "thread",
  turnId: "turn",
  sequence: 1,
  kind: "assistant",
  method: "item/completed",
  text: "Answer",
  payload,
  createdAt: "2026-09-25",
})

test("native decoders retain extensions and report the nested path for malformed fields", () => {
  const native = {
    item: { id: "item", type: "agentMessage", text: "Answer", future: { value: 1 } },
    extension: [1, 2],
  }
  const decoded = decodeNativePayload(native)
  assert.ok(Either.isRight(decoded))
  assert.deepEqual(decoded.right, native)
  assert.deepEqual(prepareTranscriptEvents([event(native)])[0]?.payload, native)
  const invalid = decodeCursorPayload({
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: 42 } },
  })
  assert.ok(Either.isLeft(invalid))
  assert.match(invalid.left.message, /content/)
  assert.match(invalid.left.message, /text/)
})

test("malformed history is visible with its native payload instead of an empty object", () => {
  const native = { item: { id: "item", type: "agentMessage", text: 42 } }
  const prepared = prepareTranscriptEvents([event(native)])
  assert.equal(prepared[0]?.kind, "error")
  assert.match(prepared[0]?.text ?? "", /text/)
  assert.equal(prepared[0]?.payload, native)
})
