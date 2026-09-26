import assert from "node:assert/strict"
import { test } from "node:test"
import { commandLabel } from "./command-summary"

test("a Claude shell command is labeled with its command", () => {
  const payload = { item: { type: "commandExecution", tool: "Bash", command: "git diff --stat" } }
  assert.equal(commandLabel(payload, "Command"), "git diff --stat")
})
