import assert from "node:assert/strict"
import { test } from "node:test"
import { resizeSplit, splitPane, threadLeaf } from "./thread-layout.ts"

function paneShares(layout, share = 1, result = {}) {
  if (layout.kind === "thread") {
    result[layout.threadId] = share
    return result
  }
  paneShares(layout.first, share * (layout.ratio / 100), result)
  paneShares(layout.second, share * ((100 - layout.ratio) / 100), result)
  return result
}

test("adding a pane to an aligned split gives every pane an equal share", () => {
  const pair = splitPane(threadLeaf("a"), "a", "b", "bottom", "first")
  const three = splitPane(pair, "b", "c", "bottom", "second")

  const shares = paneShares(three)
  assert.ok(Math.abs(shares.a - 1 / 3) < 0.000_001)
  assert.ok(Math.abs(shares.b - 1 / 3) < 0.000_001)
  assert.ok(Math.abs(shares.c - 1 / 3) < 0.000_001)
})

test("balancing an aligned run preserves a resized group across the other axis", () => {
  const column = splitPane(threadLeaf("a"), "a", "b", "bottom", "column")
  const resizedColumn = resizeSplit(column, "column", 70)
  const grid = splitPane(resizedColumn, "b", "c", "right", "row")
  const withFourthPane = splitPane(grid, "c", "d", "bottom", "other-column")

  assert.equal(withFourthPane.ratio, 70)
  assert.equal(withFourthPane.second.second.ratio, 50)
})
