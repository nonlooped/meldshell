import assert from "node:assert/strict"
import { test } from "node:test"
import { nativeThreadIdOf, nativeTurnIdOf } from "./messages"
import { requestCodex } from "./client"
import type { TurnStartResponse } from "./generated/v2/TurnStartResponse"

test("validated Codex responses retain extensions and return the generated protocol type", async () => {
  const response: TurnStartResponse = {
    turn: { id: "turn", items: [], status: "inProgress" },
    future: { native: true },
  }
  const result = await requestCodex({ request: async () => response }, "turn/start", {})
  const id: string = result.turn.id
  assert.equal(id, "turn")
  assert.equal(result, response)
})

test("Codex response validation rejects nested protocol drift", async () => {
  await assert.rejects(
    requestCodex(
      { request: async () => ({ turn: { id: 42, items: [], status: "inProgress" } }) },
      "turn/start",
      {},
    ),
    /turn\/id/,
  )
})

test("unknown notification content cannot prevent routing its untouched native payload", () => {
  const message = {
    method: "future/notification",
    params: { threadId: "thread", turnId: "turn", plan: { future: true }, item: 42 },
  }
  assert.equal(nativeThreadIdOf(message), "thread")
  assert.equal(nativeTurnIdOf(message), "turn")
})
