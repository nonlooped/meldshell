import assert from "node:assert/strict"
import { test } from "node:test"
import type { CanonicalEvent, TranscriptQuery } from "@meldshell/contracts"
import { mergeTranscript, refreshTranscript } from "./transcript"

const event = (sequence: number, turnId: string, method = "user/message"): CanonicalEvent => ({
  id: String(sequence),
  threadId: "thread",
  turnId,
  sequence,
  kind: method === "user/message" ? "user" : method === "turn/completed" ? "status" : "assistant",
  method,
  text: "chunk",
  payload: method.includes("delta") ? { itemId: turnId, delta: "chunk" } : {},
  createdAt: "2026-09-01T00:00:00.000Z",
})

test("initial load reads every page; invalidation fetches only new events", async () => {
  const calls: TranscriptQuery[] = []
  const read = async (input: TranscriptQuery) => {
    calls.push(input)
    if (input.afterSequence === 0) return { events: [event(1, "old")], nextCursor: 1 }
    if (input.afterSequence === 1)
      return {
        events: [event(2, "old", "assistant/message"), event(50, "recent")],
        nextCursor: null,
      }
    if (input.afterSequence === 50) return { events: [event(51, "live")], nextCursor: 51 }
    return { events: [event(52, "live", "item/agentMessage/delta")], nextCursor: null }
  }
  const initial = await refreshTranscript(read, "thread")
  assert.deepEqual(
    calls.map((call) => call.afterSequence),
    [0, 1],
  )
  assert.deepEqual(
    initial.turns.map((turn) => turn.id),
    ["old", "recent"],
  )
  assert.equal(initial.turns[0]?.userMessages.length, 1)
  assert.equal(initial.turns[0]?.workingEvents[0]?.text, "chunk")
  const next = await refreshTranscript(read, "thread", initial)
  assert.deepEqual(
    calls.slice(2).map((call) => call.afterSequence),
    [50, 51],
  )
  assert.equal(next.latestSequence, 52)
})

test("concurrent cache writes survive a forward refresh", async () => {
  const initial = mergeTranscript(undefined, [event(10, "recent")])
  let current = initial
  const next = await refreshTranscript(
    async () => {
      current = mergeTranscript(current, [event(11, "recent")])
      return { events: [event(11, "recent")], nextCursor: null }
    },
    "thread",
    initial,
    () => current,
  )
  assert.equal(next.groups.get("recent")?.length, 2)
  assert.deepEqual(
    next.turns.map((turn) => turn.id),
    ["recent"],
  )
})

test("failed or nonadvancing catch-up never commits a partial cursor", async () => {
  const initial = mergeTranscript(undefined, [event(10, "recent")])
  await assert.rejects(
    refreshTranscript(async () => ({ events: [], nextCursor: 10 }), "thread", initial),
    /did not advance/,
  )
  assert.equal(initial.latestSequence, 10)
})

test("initial load rejects a stalled cursor without returning partial history", async () => {
  await assert.rejects(
    refreshTranscript(async () => ({ events: [event(1, "old")], nextCursor: 0 }), "thread"),
    /did not advance/,
  )
})
