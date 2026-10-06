import assert from "node:assert/strict"
import test from "node:test"
import type { CanonicalEvent, CanonicalEventKind } from "@meldshell/contracts"
import { prepareTranscriptTurns, TranscriptProjector } from "@meldshell/projection"

let sequence = 0
const event = (
  turnId: string | null,
  method: string,
  payload: unknown,
  kind: CanonicalEventKind = "unknown",
  text: string | null = null,
): CanonicalEvent => {
  sequence++
  return {
    id: `event-${sequence}`,
    threadId: "thread",
    turnId,
    sequence,
    kind,
    method,
    text,
    payload,
    createdAt: new Date(Date.UTC(2026, 9, 5, 0, 0, sequence)).toISOString(),
  }
}

const times = <A>(count: number, make: (index: number) => A): A[] =>
  Array.from({ length: count }, (_, index) => make(index))

const codexTurn = (turn: string): CanonicalEvent[] => [
  event(turn, "user/message", {}, "user", "Fix the parser"),
  event(turn, "turn/started", { turn: { id: "native", status: "inProgress" } }),
  event(turn, "item/started", {
    item: { id: "c1", type: "commandExecution", command: "npm test" },
  }),
  // The core stores a delta's text on the event, as it arrived.
  ...times(5, (index) =>
    event(
      turn,
      "item/commandExecution/outputDelta",
      { itemId: "c1", delta: `line ${index}\n` },
      "command",
      `line ${index}\n`,
    ),
  ),
  event(turn, "item/completed", {
    item: { id: "c1", type: "commandExecution", command: "npm test", aggregatedOutput: "ok\n" },
  }),
  event(turn, "turn/plan/updated", { plan: [{ step: "Read", status: "completed" }] }),
  event(turn, "turn/diff/updated", { diff: "diff --git a/x.ts b/x.ts\n" }),
  event(turn, "mcpServer/startupStatus/updated", { status: 7 }),
  event(turn, "item/completed", {
    item: {
      id: "q1",
      type: "agentMessage",
      text: "Which one?",
      delivery: "async",
      questions: [{ title: "Which parser?", options: ["Old", "New"] }],
    },
  }),
  event(turn, "item/completed", {
    item: { id: "u1", type: "userMessage", content: [{ type: "text", text: "New" }] },
  }),
  event(turn, "item/started", { item: { id: "a1", type: "agentMessage" } }),
  ...times(20, (index) =>
    event(
      turn,
      "item/agentMessage/delta",
      { itemId: "a1", delta: `${index} ` },
      "assistant",
      `${index} `,
    ),
  ),
  event(turn, "item/completed", {
    item: { id: "a1", type: "agentMessage", text: "Fixed.", phase: "final_answer" },
  }),
  event(turn, "item/started", { itemId: 5 }),
  event(turn, "turn/plan/updated", {
    plan: [{ step: "Read", status: "completed" }, { step: "Fix" }],
  }),
  event(turn, "turn/completed", { turn: { status: "completed" } }),
]

const piTurn = (turn: string): CanonicalEvent[] => {
  const update = (assistantMessageEvent: unknown) =>
    event(turn, "pi/message_update", { type: "message_update", assistantMessageEvent })
  return [
    event(turn, "user/message", {}, "user", "List the files"),
    event(turn, "turn/started", { turn: { status: "inProgress" } }),
    event(turn, "pi/message_start", { type: "message_start", message: { role: "assistant" } }),
    ...times(6, () => update({ type: "thinking_delta", contentIndex: 0, delta: "hm " })),
    ...times(6, (index) => update({ type: "text_delta", contentIndex: 1, delta: `${index} ` })),
    update({
      type: "toolcall_end",
      toolCall: { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
    }),
    event(turn, "pi/tool_execution_start", {
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "bash",
      args: { command: "ls" },
    }),
    ...times(3, (index) =>
      event(turn, "pi/tool_execution_update", {
        type: "tool_execution_update",
        toolCallId: "t1",
        toolName: "bash",
        partialResult: { content: [{ type: "text", text: `file ${index}` }] },
      }),
    ),
    event(turn, "pi/message_end", {
      type: "message_end",
      message: {
        role: "toolResult",
        toolCallId: "t1",
        toolName: "bash",
        content: [{ type: "text", text: "a.ts\nb.ts" }],
      },
    }),
    event(turn, "pi/message_start", { type: "message_start", message: { role: "assistant" } }),
    ...times(4, (index) => update({ type: "text_delta", contentIndex: 0, delta: `${index} ` })),
    event(turn, "pi/message_end", {
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "Two files." }] },
    }),
    event(turn, "pi/compaction_end", { type: "compaction_end" }),
    event(turn, "turn/completed", { turn: { status: "completed" } }),
  ]
}

const cursorTurn = (turn: string): CanonicalEvent[] => {
  const update = (value: unknown) =>
    event(turn, "cursor/acp/session/update", { sessionId: "s", update: value })
  const chunk = (sessionUpdate: string, text: string) =>
    update({ sessionUpdate, content: { type: "text", text } })
  return [
    event(turn, "user/message", {}, "user", "Edit the file"),
    event(turn, "turn/started", { turn: { status: "inProgress" } }),
    ...times(5, (index) => chunk("agent_thought_chunk", `thought ${index} `)),
    ...times(5, (index) => chunk("agent_message_chunk", `reply ${index} `)),
    update({ sessionUpdate: "tool_call", toolCallId: "k1", kind: "execute", title: "ls" }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "k1",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "a.ts" } }],
    }),
    update({ sessionUpdate: "tool_call", toolCallId: "k2", kind: "edit", title: "Edit a.ts" }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "k2",
      status: "completed",
      content: [{ type: "diff", path: "a.ts", oldText: "a", newText: "b" }],
    }),
    update({ sessionUpdate: "plan", entries: [{ content: "Edit", status: "pending" }] }),
    event(turn, "cursor/update_todos", {
      merge: true,
      todos: [{ id: "0", content: "Edit", status: "completed" }],
    }),
    ...times(5, (index) => chunk("agent_message_chunk", `done ${index} `)),
    event(turn, "cursor/acp/session/prompt/result", { stopReason: "end_turn" }),
    event(turn, "turn/completed", { turn: { status: "completed" } }),
  ]
}

const history = (): CanonicalEvent[] => [
  ...codexTurn("codex"),
  event(null, "error", { error: { message: "Disconnected" } }, "error", "Disconnected"),
  ...piTurn("pi"),
  ...cursorTurn("cursor"),
]

/** Deterministic chunk sizes, so a failure reproduces. */
const chunks = (events: readonly CanonicalEvent[], seed: number): CanonicalEvent[][] => {
  const result: CanonicalEvent[][] = []
  let state = seed
  for (let index = 0; index < events.length; ) {
    state = (state * 1103515245 + 12345) % 2147483648
    const size = 1 + (state % 7)
    result.push(events.slice(index, index + size))
    index += size
  }
  return result
}

test("events streamed in any batches project as reading them all at once does", () => {
  const events = history()
  const expected = prepareTranscriptTurns(events)
  for (const seed of [1, 2, 3, 4, 5]) {
    const projector = new TranscriptProjector()
    for (const batch of chunks(events, seed)) {
      projector.update(batch)
      // Reading turns between batches must not disturb what later batches add.
      projector.turns()
    }
    assert.deepEqual(projector.turns(), expected, `seed ${seed}`)
  }
})

test("an older page or a repeated event projects the whole history again", () => {
  const events = history()
  const projector = new TranscriptProjector(events.slice(40))
  projector.update(events.slice(0, 40))
  projector.update(events.slice(10, 20))
  assert.deepEqual(projector.turns(), prepareTranscriptTurns(events))
  assert.deepEqual(projector.events, events)
})

test("a streaming update keeps the items it does not change", () => {
  const turn = codexTurn("codex")
  const streaming = turn.findIndex((entry) => entry.method === "item/agentMessage/delta")
  const projector = new TranscriptProjector(turn.slice(0, streaming + 1))
  const command = (): CanonicalEvent | undefined =>
    projector.turns()[0]!.workingEvents.find((entry) => entry.kind === "command")
  const before = command()
  const reply = projector.turns()[0]!.workingEvents.at(-1)
  projector.update(turn.slice(streaming + 1, streaming + 3))
  assert.ok(before)
  assert.equal(command(), before)
  assert.notEqual(projector.turns()[0]!.workingEvents.at(-1), reply)
})
