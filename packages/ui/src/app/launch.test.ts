import assert from "node:assert/strict"
import { test } from "node:test"
import { probingStatus, type Provider } from "@meldshell/contracts"
import { harnessSettled, launchHarnesses } from "./launch"

const provider = (id: string, harness: string, sortOrder: number, enabled = true): Provider => ({
  id,
  key: id,
  harness,
  displayName: id,
  enabled,
  sortOrder,
  builtIn: true,
})

test("each enabled harness appears once, in catalog order", () => {
  const harnesses = launchHarnesses([
    provider("cursor", "cursor", 2),
    provider("openai", "codex", 0),
    provider("github", "codex", 1),
    provider("anthropic", "claude-code", 3, false),
  ])
  assert.deepEqual(
    harnesses.map(({ harness, provider }) => [harness, provider.id]),
    [
      ["codex", "openai"],
      ["cursor", "cursor"],
    ],
  )
})

test("an unknown harness waits on Codex", () => {
  assert.deepEqual(
    launchHarnesses([provider("custom", "future", 0)]).map(({ harness }) => harness),
    ["codex"],
  )
})

test("a harness settles once it reports or its status fails", () => {
  const probing = probingStatus("codex")
  assert.equal(harnessSettled(undefined, false), false)
  assert.equal(harnessSettled(probing, false), false)
  assert.equal(harnessSettled({ ...probing, availability: "missing" }, false), true)
  assert.equal(harnessSettled({ ...probing, availability: "ready" }, false), true)
  assert.equal(harnessSettled(undefined, true), true)
})
