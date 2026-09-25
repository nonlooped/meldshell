import assert from "node:assert/strict"
import { test } from "node:test"
import { Either } from "effect"
import { decodeNotification } from "./protocol"
import { parseCursorQuestion } from "./extensions"

test("Cursor notifications validate nested fields and preserve native extensions", () => {
  const native = {
    sessionId: "session",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello" },
      future: 1,
    },
  }
  const decoded = decodeNotification("session/update", native)!
  assert.ok(Either.isRight(decoded))
  assert.deepEqual(decoded.right, native)
  const malformed = decodeNotification("session/update", {
    ...native,
    update: { ...native.update, content: { type: "text", text: 4 } },
  })!
  assert.ok(Either.isLeft(malformed))
  assert.match(malformed.left.message, /text/)
  assert.equal(decodeNotification("cursor/future", { native: true }), undefined)
  assert.equal(
    decodeNotification("session/update", {
      sessionId: "session",
      update: { sessionUpdate: "future_update", data: [1] },
    }),
    undefined,
  )
})

test("Cursor question errors identify invalid nested options", () => {
  assert.throws(
    () =>
      parseCursorQuestion({
        toolCallId: "call",
        questions: [{ id: "q", prompt: "Choose", options: [{ id: 42, label: "Option" }] }],
      }),
    /options/,
  )
})
