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
  changeKeys: ["I3"],
  startLine: 3,
  line: 3,
  side: "new",
  snippet: "+const answer = 42",
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
    note({ id: "b", path: "src/z.ts", startLine: 1, line: 1, body: "Third" }),
    note({
      id: "a",
      startLine: 9,
      line: 9,
      side: "old",
      changeKeys: ["D9"],
      snippet: "-legacy()",
      body: "Second",
    }),
    note({
      id: "c",
      startLine: 2,
      line: 2,
      changeKeys: ["N2"],
      snippet: " keep()",
      body: "First",
    }),
  ])
  assert.match(message, /^I left 3 review notes on your changes\. Please address each one\./)
  assert.ok(message.indexOf("First") < message.indexOf("Second"))
  assert.ok(message.indexOf("Second") < message.indexOf("Third"))
  assert.match(message, /\*\*src\/app\.ts:9 \(removed line\)\*\*\n```diff\n-legacy\(\)\n```/)
  assert.match(message, /```diff\n keep\(\)\n```/)
})

test("a run of lines names its range and quotes every line", () => {
  const message = reviewNotesMessage([
    note({
      startLine: 4,
      line: 6,
      changeKeys: ["D4", "I4", "N5", "I6"],
      snippet: "-old()\n+fresh()\n keep()\n+more()",
    }),
  ])
  assert.match(
    message,
    /\*\*src\/app\.ts:4-6\*\*\n```diff\n-old\(\)\n\+fresh\(\)\n keep\(\)\n\+more\(\)\n```/,
  )
  const removed = reviewNotesMessage([
    note({ startLine: 7, line: 8, side: "old", snippet: "-a\n-b" }),
  ])
  assert.match(removed, /\*\*src\/app\.ts:7-8 \(removed lines\)\*\*/)
})

test("quoted code with backticks gets a longer fence", () => {
  const message = reviewNotesMessage([note({ snippet: "+const fence = '```'" })])
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
