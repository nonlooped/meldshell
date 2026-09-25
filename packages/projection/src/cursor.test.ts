import assert from "node:assert/strict"
import { test } from "node:test"
import { asRecord, type CanonicalEvent } from "@meldshell/contracts"
import { prepareCursorEvents } from "./cursor"
import { eventKind, eventText } from "./normalization"
import { prepareTranscriptTurns } from "./transcript"

const toolUpdate = (content: unknown[]): CanonicalEvent => ({
  id: "event",
  threadId: "thread",
  turnId: "turn",
  sequence: 1,
  kind: "file-change",
  method: "cursor/acp/session/update",
  text: null,
  payload: {
    sessionId: "session",
    update: { sessionUpdate: "tool_call_update", toolCallId: "tool", kind: "edit", content },
  },
  createdAt: "2026-09-01T00:00:00.000Z",
})

const changesOf = (event: CanonicalEvent | undefined) =>
  asRecord(asRecord(event?.payload).item).changes

test("MeldShell's Cursor questions stay approvals throughout transcript projection", () => {
  const method = "cursor/ask_user_question"
  const payload = {
    questions: [
      {
        id: "0",
        header: "Topic",
        question: "Which topic?",
        multiSelect: false,
        isOther: true,
        options: [
          { label: "Science", description: "Explore science" },
          { label: "History", description: "Explore history" },
        ],
      },
    ],
  }
  const event: CanonicalEvent = {
    ...toolUpdate([]),
    method,
    payload,
    kind: eventKind(method, payload),
    text: eventText(method, payload),
  }
  assert.equal(event.kind, "approval")
  assert.equal(event.text, null)
  const [turn] = prepareTranscriptTurns([event])
  assert.deepEqual(turn?.workingEvents, [event])
  assert.equal(turn?.workingEvents[0]?.payload, payload)
})

test("a new Cursor file carries its content and an edit carries only the changed lines", () => {
  const [event] = prepareCursorEvents([
    toolUpdate([
      { type: "diff", path: "new.txt", oldText: null, newText: "hello\n" },
      {
        type: "diff",
        path: "edit.txt",
        oldText: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n",
        newText: "one\ntwo\nthree\nfour\nFIVE\nsix\nseven\neight\n",
      },
    ]),
  ])
  assert.equal(event?.kind, "file-change")
  assert.deepEqual(changesOf(event), [
    { path: "new.txt", kind: { type: "add" }, diff: "hello\n" },
    {
      path: "edit.txt",
      kind: { type: "update" },
      diff: "@@ -2,7 +2,7 @@\n two\n three\n four\n-five\n+FIVE\n six\n seven\n eight\n",
    },
  ])
})
