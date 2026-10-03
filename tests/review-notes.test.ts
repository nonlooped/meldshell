import assert from "node:assert/strict"
import test from "node:test"
import {
  reviewNotesMessage,
  useReviewNotes,
  type ReviewNote,
} from "../packages/ui/src/threads/review-notes.ts"

const note = (patch: Partial<ReviewNote>): ReviewNote => ({
  id: "note",
  anchor: "patch",
  path: "src/app.ts",
  changeKey: "I3",
  line: 3,
  side: "new",
  kind: "insert",
  code: "const answer = 42",
  body: "Name this after what it holds.",
  ...patch,
})

test("one note becomes a follow-up that quotes its line", () => {
  assert.equal(
    reviewNotesMessage([note({})]),
    [
      "I left a review note on your changes. Please address it.",
      "**src/app.ts:3**\n```diff\n+const answer = 42\n```\nName this after what it holds.",
    ].join("\n\n"),
  )
})

test("notes are ordered by file and line, and removed lines say so", () => {
  const message = reviewNotesMessage([
    note({ id: "b", path: "src/z.ts", line: 1, body: "Third" }),
    note({
      id: "a",
      line: 9,
      side: "old",
      kind: "delete",
      changeKey: "D9",
      code: "legacy()",
      body: "Second",
    }),
    note({ id: "c", line: 2, kind: "normal", changeKey: "N2", code: "keep()", body: "First" }),
  ])
  assert.match(message, /^I left 3 review notes on your changes\. Please address each one\./)
  assert.ok(message.indexOf("First") < message.indexOf("Second"))
  assert.ok(message.indexOf("Second") < message.indexOf("Third"))
  assert.match(message, /\*\*src\/app\.ts:9 \(removed line\)\*\*\n```diff\n-legacy\(\)\n```/)
  assert.match(message, /```diff\n keep\(\)\n```/)
})

test("quoted code with backticks gets a longer fence", () => {
  const message = reviewNotesMessage([note({ code: "const fence = '```'" })])
  assert.match(message, /````diff\n\+const fence = '```'\n````/)
})

test("notes are kept per thread and cleared only for what was sent", () => {
  const store = useReviewNotes.getState()
  const { id: _, ...input } = note({})
  store.add("thread-a", input)
  store.add("thread-a", { ...input, line: 4 })
  store.add("thread-b", input)
  const [first, second] = useReviewNotes.getState().notes["thread-a"]!
  store.clear("thread-a", [first!.id])
  assert.deepEqual(
    useReviewNotes.getState().notes["thread-a"]?.map((item) => item.id),
    [second!.id],
  )
  store.remove("thread-a", second!.id)
  assert.equal(useReviewNotes.getState().notes["thread-a"], undefined)
  assert.equal(useReviewNotes.getState().notes["thread-b"]?.length, 1)
})
