import assert from "node:assert/strict"
import { test } from "node:test"
import { threadTransitions } from "./thread-signals"

test("first observations seed state without signals", () => {
  assert.deepEqual(threadTransitions(new Map(), [{ id: "a", activity: "completed" }]), [])
})

test("finishing, failing, and approval requests each signal once", () => {
  const previous = new Map([
    ["done", "running"],
    ["failed", "running"],
    ["asks", "running"],
    ["quiet", "idle"],
  ] as const)
  assert.deepEqual(
    threadTransitions(previous, [
      { id: "done", activity: "completed" },
      { id: "failed", activity: "failed" },
      { id: "asks", activity: "approval" },
      { id: "quiet", activity: "completed" },
    ]),
    [
      { threadId: "done", chime: "done" },
      { threadId: "failed", chime: "failed" },
      { threadId: "asks", chime: "attention" },
    ],
  )
  assert.deepEqual(threadTransitions(previous, [{ id: "done", activity: "running" }]), [])
})
