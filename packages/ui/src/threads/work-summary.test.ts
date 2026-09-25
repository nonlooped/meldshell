import assert from "node:assert/strict"
import { test } from "node:test"
import type { CanonicalEvent } from "@meldshell/contracts"
import { workSummary } from "./work-summary"

let sequence = 0
const event = (kind: CanonicalEvent["kind"], item: Record<string, unknown> = {}): CanonicalEvent =>
  ({
    id: `event-${++sequence}`,
    threadId: "thread",
    turnId: "turn",
    sequence,
    kind,
    method: "item/completed",
    text: null,
    payload: { item },
    createdAt: new Date(0).toISOString(),
  }) as unknown as CanonicalEvent

test("summarizes a turn's work in reading order", () => {
  assert.equal(
    workSummary([
      event("command", { command: "npm test" }),
      event("command", { command: "git status" }),
      event("file-change", { changes: [{ path: "a.ts" }, { path: "b.ts" }] }),
      event("file-change", { changes: [{ path: "a.ts" }] }),
      event("tool", { tool: "Read" }),
      event("tool", { tool: "Grep" }),
      event("reasoning"),
    ]),
    "Thought · ran 2 commands · edited 2 files · read 1 file · searched once",
  )
})

test("counts described read-only commands by what they did", () => {
  assert.equal(
    workSummary([
      event("command", {
        commandActions: [
          { type: "read", path: "a.ts" },
          { type: "search", query: "x" },
        ],
      }),
      event("command", { commandActions: [{ type: "unknown", command: "make" }] }),
    ]),
    "Ran 1 command · read 1 file · searched once",
  )
})

test("ignores the aggregate turn diff and messages", () => {
  const diff = { ...event("file-change"), method: "turn/diff/updated" }
  assert.equal(
    workSummary([diff, event("assistant"), event("tool", { tool: "mcp__x" })]),
    "Used 1 tool",
  )
  assert.equal(workSummary([event("assistant")]), "")
})
