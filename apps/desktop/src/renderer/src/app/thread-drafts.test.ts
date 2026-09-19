import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import { useTabStore } from "./tab-store"
import { emptyDraft, useThreadDrafts } from "./thread-drafts"

beforeEach(() => {
  useTabStore.setState({
    openThreadIds: [],
    selectedThreadId: null,
    selectedFileId: null,
    files: [],
  })
  useThreadDrafts.setState({ drafts: {} })
})

test("drafts and sending state stay with their thread during tab changes", () => {
  const store = useTabStore.getState()
  const drafts = useThreadDrafts.getState()
  const attachment = {
    type: "image" as const,
    value: "data:image/png;base64,example",
    name: "a.png",
  }
  drafts.update("a", { text: "Message A", attachments: [attachment], sending: true })
  drafts.update("b", { text: "Message B" })
  store.openThread("a")
  store.openThread("b")
  store.closeThread("a")
  store.openThread("a")
  assert.equal(useThreadDrafts.getState().drafts.a!.sending, true)
  const sent = useThreadDrafts.getState().drafts.a!
  drafts.finish("a", sent)
  assert.deepEqual(useThreadDrafts.getState().drafts.a, emptyDraft)
  assert.equal(useThreadDrafts.getState().drafts.b!.text, "Message B")
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
