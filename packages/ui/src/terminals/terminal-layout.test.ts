import assert from "node:assert/strict"
import { test } from "node:test"
import {
  removeTerminal,
  resizeTerminalSplit,
  splitTerminal,
  terminalIds,
  type TerminalLayout,
} from "./terminal-layout"

const leaf = (id: string): TerminalLayout => ({ kind: "terminal", id })

test("splitting opens the new shell after its target and keeps the rest of the tree", () => {
  const two = splitTerminal(leaf("a"), "a", "b", "horizontal", "s1")
  const three = splitTerminal(two, "a", "c", "vertical", "s2")
  assert.deepEqual(terminalIds(three), ["a", "c", "b"])
  assert.equal(three.kind === "split" && three.orientation, "horizontal")
  assert.equal(three.kind === "split" && three.first.kind === "split" && three.first.id, "s2")
  assert.equal(splitTerminal(three, "missing", "d", "vertical", "s3"), three)
})

test("closing a shell collapses its split into the surviving sibling", () => {
  const layout = splitTerminal(
    splitTerminal(leaf("a"), "a", "b", "horizontal", "s1"),
    "b",
    "c",
    "vertical",
    "s2",
  )
  const without = removeTerminal(layout, "b")
  assert.deepEqual(terminalIds(without), ["a", "c"])
  assert.equal(without?.kind === "split" && without.id, "s1")
  assert.equal(removeTerminal(leaf("a"), "a"), null)
})

test("resizing clamps the ratio and leaves other splits alone", () => {
  const layout = splitTerminal(
    splitTerminal(leaf("a"), "a", "b", "horizontal", "s1"),
    "b",
    "c",
    "vertical",
    "s2",
  )
  const resized = resizeTerminalSplit(layout, "s2", 99)
  assert.equal(resized.kind === "split" && resized.ratio, 50)
  assert.equal(
    resized.kind === "split" && resized.second.kind === "split" && resized.second.ratio,
    95,
  )
})
