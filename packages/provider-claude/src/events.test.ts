import assert from "node:assert/strict"
import { test } from "node:test"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeEvents } from "./events"

const record = () => {
  const items: Record<string, unknown>[] = []
  const events = new ClaudeEvents((_method, params) => {
    const item = (params as { item?: Record<string, unknown> }).item
    if (item) items.push(item)
  })
  return { items, accept: (message: unknown) => events.accept(message as SDKMessage) }
}

const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({
  type: "assistant",
  parent_tool_use_id: null,
  message: { id: `message-${id}`, content: [{ type: "tool_use", id, name, input }] },
})

test("shell tools become command executions that carry their command", () => {
  const { items, accept } = record()
  accept(toolUse("bash", "Bash", { command: "git status" }))
  accept(toolUse("pwsh", "PowerShell", { command: "Get-ChildItem" }))
  assert.deepEqual(
    items.map((item) => [item.type, item.command]),
    [
      ["commandExecution", "git status"],
      ["commandExecution", "Get-ChildItem"],
    ],
  )
})

test("a foreground shell task does not repeat its command row", () => {
  const { items, accept } = record()
  const task = (subtype: string, fields: Record<string, unknown>) =>
    accept({ type: "system", subtype, task_id: "task", ...fields })
  task("task_started", {
    tool_use_id: "bash",
    description: "npm test",
    task_type: "local_bash",
    is_backgrounded: false,
  })
  task("task_notification", { tool_use_id: "bash", status: "completed" })
  assert.deepEqual(items, [])
})

test("a background shell task is not labeled as a subagent", () => {
  const { items, accept } = record()
  accept({
    type: "system",
    subtype: "task_started",
    task_id: "shell",
    tool_use_id: "bash",
    description: "npm run dev",
    task_type: "local_bash",
    is_backgrounded: true,
  })
  accept({
    type: "system",
    subtype: "task_started",
    task_id: "agent",
    tool_use_id: "spawn",
    description: "Explore the renderer",
    task_type: "local_agent",
    is_backgrounded: true,
  })
  assert.deepEqual(
    items.map((item) => [item.text, item.parentToolUseId]),
    [
      ["npm run dev", undefined],
      ["Explore the renderer", "spawn"],
    ],
  )
})
