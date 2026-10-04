import assert from "node:assert/strict"
import { test } from "node:test"
import { messageImages } from "../packages/ui/src/threads/message-images"

test("extracts pasted images from a saved user message", () => {
  assert.deepEqual(
    messageImages({
      text: "What is this?",
      attachments: [
        { type: "mention", value: "src/app.ts" },
        { type: "image", value: "data:image/png;base64,YWJj", name: "Pasted image" },
        { type: "skill", value: "review" },
      ],
    }),
    [{ src: "data:image/png;base64,YWJj", alt: "Pasted image" }],
  )
})

test("ignores malformed and non-image attachments", () => {
  assert.deepEqual(
    messageImages({
      attachments: [
        null,
        { type: "image", value: "javascript:alert(1)" },
        { type: "localImage", value: "/tmp/photo.png" },
        { type: "image", value: "https://example.com/photo.png" },
      ],
    }),
    [{ src: "https://example.com/photo.png", alt: "Attached image 4" }],
  )
  assert.deepEqual(messageImages(null), [])
})
