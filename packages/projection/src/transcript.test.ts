import assert from "node:assert/strict"
import { test } from "node:test"
import type { CanonicalEvent } from "@meldshell/contracts"
import { approvalCopy } from "./normalization"
import { prepareTranscriptTurns } from "./transcript"

const event = (
  sequence: number,
  method: string,
  params: unknown,
  kind: CanonicalEvent["kind"] = method === "turn/completed" ? "status" : "assistant",
): CanonicalEvent => ({
  id: String(sequence),
  threadId: "thread",
  turnId: "turn",
  sequence,
  kind,
  method,
  text: null,
  payload: params,
  createdAt: `2026-09-01T00:00:0${sequence}.000Z`,
})

const agentMessage = (sequence: number, id: string, text: string, extra: object = {}) =>
  event(sequence, "item/completed", {
    item: { type: "agentMessage", id, text, phase: "final_answer", ...extra },
  })

test("Codex's asynchronous questions become the turn's questions", () => {
  const [turn] = prepareTranscriptTurns([
    agentMessage(1, "ask", "Which topic?\n- Science\n- History", {
      delivery: "async",
      questions: [{ title: "Which topic?", options: ["Science", "History"] }],
    }),
    agentMessage(2, "closing", "You can choose an option or type your own answer."),
    event(3, "turn/completed", { turn: { status: "completed" } }),
  ])
  assert.deepEqual(turn?.questions, [{ title: "Which topic?", options: ["Science", "History"] }])
  assert.equal(turn?.finalResponse?.text, "You can choose an option or type your own answer.")
  assert.equal(turn?.workingEvents.filter((entry) => entry.kind === "assistant").length, 0)
})

test("earlier final answers stay in the working log in order", () => {
  const [turn] = prepareTranscriptTurns([
    agentMessage(1, "first", "First answer."),
    event(
      2,
      "item/completed",
      { item: { type: "commandExecution", id: "cmd", command: "ls" } },
      "command",
    ),
    agentMessage(3, "second", "Second answer."),
    event(4, "turn/completed", { turn: { status: "completed" } }),
  ])
  assert.equal(turn?.finalResponse?.text, "Second answer.")
  assert.deepEqual(
    turn?.workingEvents.filter((entry) => entry.kind !== "status").map((entry) => entry.text),
    ["First answer.", "ls"],
  )
  assert.deepEqual(turn?.questions, [])
})

test("question requests name the provider instead of repeating the tool input", () => {
  const questions = [{ id: "0", header: "Task", question: "Next?", options: [] }]
  assert.deepEqual(
    approvalCopy("item/tool/requestUserInput", {
      toolName: "AskUserQuestion",
      reason: 'Claude Code wants to use AskUserQuestion.\n{"questions": []}',
      questions,
    }),
    { title: "Claude Code has a question", detail: "" },
  )
  assert.equal(
    approvalCopy("item/tool/requestUserInput", { questions: [...questions, ...questions] }).title,
    "Codex has 2 questions",
  )
  assert.equal(
    approvalCopy("cursor/ask_user_question", { questions }).title,
    "Cursor has a question",
  )
})
