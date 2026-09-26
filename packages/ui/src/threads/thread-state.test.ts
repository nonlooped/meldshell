import assert from "node:assert/strict"
import { test } from "node:test"
import { glanceLabel, threadGlance, threadMonogram } from "./thread-state"

test("marks a thread by what it is doing before whether it was seen", () => {
  assert.equal(threadGlance("running", true), "running")
  assert.equal(threadGlance("approval", false), "approval")
  assert.equal(threadGlance("queued", false), "queued")
  assert.equal(threadGlance("failed", true), "failed")
})

test("marks a finished thread done until it is opened", () => {
  assert.equal(threadGlance("completed", true), "done")
  assert.equal(threadGlance("interrupted", true), "done")
  assert.equal(threadGlance("completed", false), "idle")
  assert.equal(threadGlance("idle", false), "idle")
})

test("names every state but idle", () => {
  assert.equal(glanceLabel("approval"), "Needs approval")
  assert.equal(glanceLabel("done"), "Done")
  assert.equal(glanceLabel("idle"), null)
})

test("stands for a thread by the initials of its first significant words", () => {
  assert.equal(threadMonogram("Fix the login redirect"), "FL")
  assert.equal(threadMonogram("add dark mode to settings"), "AD")
  assert.equal(threadMonogram("Refactor"), "Re")
  assert.equal(threadMonogram("The"), "Th")
  assert.equal(threadMonogram("  ~~ "), "#")
  assert.equal(threadMonogram("Écrire les tests"), "ÉL")
})
