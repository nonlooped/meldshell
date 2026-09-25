import assert from "node:assert/strict"
import { test } from "node:test"
import { Schema } from "effect"
import { Harness, ProviderStatus, probingStatus, supportsMode } from "./models"

test("each harness accepts only the modes it takes from MeldShell", () => {
  assert.equal(supportsMode("codex", "default"), true)
  assert.equal(supportsMode("codex", "plan"), false)
  assert.equal(supportsMode("claude-code", "plan"), true)
  assert.equal(supportsMode("claude-code", "ask"), false)
  assert.equal(supportsMode("cursor", "ask"), true)
  assert.equal(supportsMode("retired-harness", "default"), true)
  assert.equal(supportsMode(undefined, "plan"), false)
})

test("a probing placeholder is a valid status for every harness", () => {
  for (const harness of Harness.literals)
    assert.ok(Schema.is(ProviderStatus)(probingStatus(harness)), harness)
})
