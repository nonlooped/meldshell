import "../packages/host/tests/side-question-prompt.test.ts"
import assert from "node:assert/strict"
import test from "node:test"
import type { CanonicalEvent } from "../packages/contracts/src/index.ts"
import { buildSideQuestionPrompt, digestTurn } from "../packages/core/src/handoff.ts"
import {
  SIDE_QUESTION_COMMAND,
  sideQuestionText,
  withSideQuestionCommand,
} from "../packages/ui/src/threads/side-questions.ts"

let sequence = 0
const event = (turnId: string, kind: string, text: string): CanonicalEvent => ({
  id: `event-${++sequence}`,
  threadId: "thread",
  turnId,
  sequence,
  kind: kind as CanonicalEvent["kind"],
  method: kind === "user" ? "user/message" : "item/completed",
  text,
  payload: {},
  createdAt: new Date(Date.UTC(2026, 9, 3, 12, 0, sequence)).toISOString(),
})

test("only a message that opens with /btw is a side question", () => {
  assert.equal(sideQuestionText("/btw what does parse() do?"), "what does parse() do?")
  assert.equal(sideQuestionText("  /btw\n  why\nthis way?  "), "why\nthis way?")
  assert.equal(sideQuestionText("/btw"), "")
  assert.equal(sideQuestionText("/btw   "), "")
  assert.equal(sideQuestionText("/btwx hello"), null)
  assert.equal(sideQuestionText("please /btw hello"), null)
  assert.equal(sideQuestionText("/review"), null)
})

test("/btw leads the command list and replaces a harness command of the same name", () => {
  const listed = withSideQuestionCommand([
    { kind: "command", name: "btw", description: "Native" },
    { kind: "command", name: "review", description: "Review" },
    { kind: "skill", name: "btw", description: "A skill" },
  ])
  assert.deepEqual(
    listed.map((command) => `${command.kind}:${command.name}:${command.description}`),
    [
      `command:btw:${SIDE_QUESTION_COMMAND.description}`,
      "command:review:Review",
      "skill:btw:A skill",
    ],
  )
  assert.deepEqual(withSideQuestionCommand(undefined), [SIDE_QUESTION_COMMAND])
})

test("the side question prompt carries the conversation, including a running turn", () => {
  const prompt = buildSideQuestionPrompt(
    "claude-code",
    [
      {
        id: "one",
        harness: "codex",
        status: "completed",
        events: [
          event("one", "user", "Add a parser for the config file."),
          event("one", "assistant", "Added parseConfig in src/config.ts."),
        ],
      },
      {
        id: "two",
        harness: "claude-code",
        status: "running",
        events: [
          event("two", "user", "Now validate the ports."),
          event("two", "assistant", "Checking how ports are read."),
        ],
      },
    ].flatMap((turn) => digestTurn(turn) ?? []),
    "  What does parseConfig return?  ",
  )
  assert.match(prompt, /^The user is working with Claude Code/)
  assert.match(prompt, /Claude Code will not see the question or your answer/)
  assert.match(prompt, /Add a parser for the config file\./)
  assert.match(prompt, /Added parseConfig in src\/config\.ts\./)
  assert.match(prompt, /Now validate the ports\./)
  assert.match(prompt, /_This turn is still running\._/)
  assert.match(prompt, /<side_question>\nWhat does parseConfig return\?\n<\/side_question>$/)
})

test("a thread with no work yet still gets a prompt", () => {
  const prompt = buildSideQuestionPrompt("pi", [], "What is this repo?")
  assert.match(prompt, /The conversation has no finished work yet\./)
  assert.match(prompt, /<side_question>\nWhat is this repo\?\n<\/side_question>$/)
})
