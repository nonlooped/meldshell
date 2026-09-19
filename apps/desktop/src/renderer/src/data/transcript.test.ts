import assert from "node:assert/strict"
import { test } from "node:test"
import type { CanonicalEvent, TranscriptQuery } from "@meldshell/contracts"
import { prepareTranscriptTurns } from "@meldshell/projection"
import { mergeTranscript, refreshTranscript, transcriptMetrics } from "./transcript"

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

test("streaming projects only the changed turn and matches full projection", () => {
  const history = Array.from({ length: 1000 }, (_, i) => event(i + 1, `old-${i}`))
  const initial = mergeTranscript(undefined, [...history, event(1001, "live")])
  const before = transcriptMetrics.eventsProjected
  const deltas = [
    event(1002, "live", "item/agentMessage/delta"),
    event(1003, "live", "turn/completed"),
  ]
  const next = mergeTranscript(initial, deltas)
  assert.equal(transcriptMetrics.eventsProjected - before, 3)
  assert.equal(next.turns[0], initial.turns[0])
  assert.deepEqual(next.turns, prepareTranscriptTurns([...history, event(1001, "live"), ...deltas]))
  assert.equal(mergeTranscript(next, []), next)
})

test("initial load reads one window; invalidation follows only forward cursors", async () => {
  const calls: TranscriptQuery[] = []
  const read = async (input: TranscriptQuery) => {
    calls.push(input)
    if (input.afterSequence === undefined) return { events: [event(50, "old")], nextCursor: 50 }
    if (input.afterSequence === 50) return { events: [event(51, "live")], nextCursor: 51 }
    return { events: [event(52, "live", "item/agentMessage/delta")], nextCursor: null }
  }
  const initial = await refreshTranscript(read, "thread")
  assert.equal(calls.length, 1)
  const next = await refreshTranscript(read, "thread", initial)
  assert.deepEqual(
    calls.slice(1).map((call) => call.afterSequence),
    [50, 51],
  )
  assert.equal(next.olderCursor, 50)
  assert.equal(next.latestSequence, 52)
})

test("older windows deduplicate overlap and survive concurrent forward refresh", async () => {
  const initial = mergeTranscript(undefined, [event(10, "recent")], 10)
  let current = initial
  const next = await refreshTranscript(
    async () => {
      current = mergeTranscript(current, [event(1, "old"), event(10, "recent")], null)
      return { events: [event(11, "recent")], nextCursor: null }
    },
    "thread",
    initial,
    () => current,
  )
  assert.equal(next.olderCursor, null)
  assert.equal(next.groups.get("recent")?.length, 2)
  assert.deepEqual(
    next.turns.map((turn) => turn.id),
    ["old", "recent"],
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
