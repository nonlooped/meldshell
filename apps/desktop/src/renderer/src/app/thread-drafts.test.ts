import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import { useThreadDrafts } from "./thread-drafts"

beforeEach(() => {
  useThreadDrafts.setState({ drafts: {} })
})

test("a send completing after draft changes preserves edits and new attachments", () => {
  const drafts = useThreadDrafts.getState()
  const attachment = { type: "image" as const, value: "data:image/png;base64,new", name: "new.png" }
  drafts.update("a", { text: "First message" })
  const sent = useThreadDrafts.getState().drafts.a!
  drafts.update("a", { text: "Next message", attachments: [attachment], sending: true })
  drafts.finish("a", sent)
  assert.equal(useThreadDrafts.getState().drafts.a!.text, "Next message")
  assert.deepEqual(useThreadDrafts.getState().drafts.a!.attachments, [attachment])
  assert.equal(useThreadDrafts.getState().drafts.a!.sending, false)
  drafts.forget("a")
  drafts.finish("a", sent)
  assert.equal(useThreadDrafts.getState().drafts.a, undefined)
})
