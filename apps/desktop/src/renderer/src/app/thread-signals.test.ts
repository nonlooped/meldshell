import assert from "node:assert/strict"
import { test } from "node:test"
import { threadTransitions } from "./thread-signals"

test("first observations seed state without signals", () => {
  assert.deepEqual(threadTransitions(new Map(), [{ id: "a", activity: "completed" }]), [])
})
