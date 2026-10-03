import assert from "node:assert/strict"
import test from "node:test"
import type { CanonicalEvent } from "@meldshell/contracts"
import { nestSubagents, shortPath, toolLabel } from "../packages/ui/src/threads/tool-label.ts"

const event = (id: string, item: Record<string, unknown>, kind = "tool"): CanonicalEvent =>
  ({
    id,
    kind,
    method: "item/completed",
    text: null,
    payload: { item },
    createdAt: "2026-10-03T00:00:00.000Z",
    sequence: 0,
    threadId: "thread",
    turnId: "turn",
  }) as unknown as CanonicalEvent

const claude = (id: string, tool: string, args: Record<string, unknown>, parent?: string) =>
  event(`item:${id}`, {
    id,
    type: "dynamicToolCall",
    tool,
    arguments: args,
    ...(parent === undefined ? {} : { parentToolUseId: parent }),
  })

const title = (value: CanonicalEvent): string | null => {
  const label = toolLabel(value)
  return label === null ? null : [label.verb, label.target].filter(Boolean).join(" ")
}

test("Claude tool rows name the file, pattern, or URL they worked on", () => {
  assert.equal(
    title(claude("1", "Read", { file_path: "/home/me/app/src/threads/Transcript.tsx" })),
    "Read …/src/threads/Transcript.tsx",
  )
  assert.equal(
    title(claude("2", "Read", { file_path: "src/app.ts", offset: 40, limit: 20 })),
    "Read src/app.ts lines 40–59",
  )
  assert.equal(
    title(claude("3", "Grep", { pattern: "toolSummary", path: "packages/ui" })),
    "Searched “toolSummary” in packages/ui",
  )
  assert.equal(title(claude("4", "Glob", { pattern: "**/*.tsx" })), "Found files “**/*.tsx”")
  assert.equal(
    title(claude("5", "WebFetch", { url: "https://docs.example.com/guide?x=1" })),
    "Fetched docs.example.com/guide",
  )
  assert.equal(
    title(claude("6", "WebSearch", { query: "electron multiple windows" })),
    "Searched the web electron multiple windows",
  )
  assert.equal(
    title(claude("7", "Task", { description: "Find approval code", subagent_type: "Explore" })),
    "Explore agent Find approval code",
  )
  assert.equal(
    title(claude("8", "mcp__browser__browser_click", { selector: "#go" })),
    "Browser click",
  )
})

test("the full path stays in the tooltip", () => {
  const label = toolLabel(claude("1", "Read", { file_path: "/a/b/c/d/e.ts" }))
  assert.equal(label?.full, "/a/b/c/d/e.ts")
  assert.equal(shortPath("src/e.ts"), "src/e.ts")
})

test("Codex web searches describe the search instead of the item type", () => {
  const search = (action: Record<string, unknown>) =>
    title(event("w", { id: "w", type: "webSearch", query: "", action }))
  assert.equal(
    search({ type: "search", query: "zed acp sessions" }),
    "Searched the web zed acp sessions",
  )
  assert.equal(
    search({ type: "search", queries: ["one", "two", "three"] }),
    "Searched the web one (+2 more)",
  )
  assert.equal(search({ type: "openPage", url: "https://zed.dev/docs" }), "Opened zed.dev/docs")
  assert.equal(
    search({ type: "findInPage", pattern: "import", url: "https://zed.dev/docs" }),
    "Searched page “import” in zed.dev/docs",
  )
  assert.equal(
    title(event("w", { id: "w", type: "webSearch", query: "legacy query" })),
    "Searched the web legacy query",
  )
})

test("background tasks and unknown events keep their own text", () => {
  assert.equal(title(claude("t", "Background task", { description: "x" })), null)
  assert.equal(title(event("c", { id: "c", type: "commandExecution" }, "command")), null)
})

test("a subagent's work nests under the call that started it", () => {
  const agent = claude("agent", "Task", { description: "Explore" })
  const read = claude("read", "Read", { file_path: "a.ts" }, "agent")
  const note = event("item:note", { id: "note", type: "agentMessage", parentToolUseId: "agent" })
  const after = claude("after", "Read", { file_path: "b.ts" })
  const orphan = claude("orphan", "Read", { file_path: "c.ts" }, "earlier-turn")
  const nodes = nestSubagents([agent, read, note, after, orphan])
  assert.deepEqual(
    nodes.map((node) => [node.event.id, node.children.map((child) => child.event.id)]),
    [
      ["item:agent", ["item:read", "item:note"]],
      ["item:after", []],
      ["item:orphan", []],
    ],
  )
})
