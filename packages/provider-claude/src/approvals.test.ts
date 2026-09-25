import assert from "node:assert/strict"
import { test } from "node:test"
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk"
import { answerProblem, permissionResult, toolApproval } from "./approvals"

const suggestion: PermissionUpdate = {
  type: "addRules",
  rules: [{ toolName: "Bash" }],
  behavior: "allow",
  destination: "localSettings",
}

test("tool calls raise the interaction that matches the tool", () => {
  const method = (toolName: string, input: Record<string, unknown> = {}) =>
    toolApproval(toolName, input, [], "default").method
  assert.equal(method("Bash"), "item/commandExecution/requestApproval")
  assert.equal(method("Write"), "item/fileChange/requestApproval")
  assert.equal(method("ExitPlanMode"), "claude/exit_plan_mode")
  assert.equal(
    method("AskUserQuestion", { questions: [{ question: "Which?" }] }),
    "item/tool/requestUserInput",
  )
  assert.equal(method("WebFetch"), "item/permissions/requestApproval")
})

test("session approval keeps suggested rules in the session, never in settings", () => {
  const { pending } = toolApproval("Bash", { command: "ls" }, [suggestion], "default")
  assert.deepEqual(permissionResult(pending, "acceptForSession", undefined), {
    behavior: "allow",
    updatedInput: { command: "ls" },
    updatedPermissions: [{ ...suggestion, destination: "session" }],
  })
  assert.deepEqual(permissionResult(pending, "accept", undefined), {
    behavior: "allow",
    updatedInput: { command: "ls" },
  })
})

test("an approved plan switches Claude to the thread's working mode", () => {
  const { pending, params } = toolApproval("ExitPlanMode", { plan: "1. Do it" }, [], "acceptEdits")
  assert.equal(params.plan, "1. Do it")
  assert.deepEqual(permissionResult(pending, "accept", undefined), {
    behavior: "allow",
    updatedInput: { plan: "1. Do it" },
    updatedPermissions: [{ type: "setMode", mode: "acceptEdits", destination: "session" }],
  })
})

test("questions need every answer, which Claude receives by question text", () => {
  const { pending } = toolApproval(
    "AskUserQuestion",
    { questions: [{ question: "Which?", options: [{ label: "A" }] }] },
    [],
    "default",
  )
  assert.equal(answerProblem(pending, { "0": [" "] }), "Answer each question before continuing.")
  assert.equal(answerProblem(pending, { "0": ["A"] }), null)
  const result = permissionResult(pending, "accept", { "0": ["A", "B"] })
  assert.equal(result.behavior, "allow")
  assert.deepEqual(result.behavior === "allow" ? result.updatedInput?.answers : undefined, {
    "Which?": "A, B",
  })
})

test("declining denies the tool, and cancelling also interrupts the turn", () => {
  const { pending } = toolApproval("Bash", {}, [], "default")
  assert.deepEqual(permissionResult(pending, "decline", undefined), {
    behavior: "deny",
    message: "The user declined this request.",
    interrupt: false,
  })
  assert.equal(permissionResult(pending, "cancel", undefined).behavior, "deny")
})
