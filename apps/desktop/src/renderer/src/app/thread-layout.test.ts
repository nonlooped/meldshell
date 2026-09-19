import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import {
  dropZone,
  movePane,
  removePane,
  resizeSplit,
  selectPane,
  splitPane,
  threadLeaf,
  visibleThreads,
} from "./thread-layout"
import { useTabStore } from "./tab-store"

beforeEach(() => {
  useTabStore.setState({
    threadTabs: [],
    selectedThreadTabId: null,
    layout: null,
    openThreadIds: [],
    selectedThreadId: null,
    selectedFileId: null,
    files: [],
  })
})

test("each edge places the dropped thread on that side of its target", () => {
  for (const edge of ["left", "right", "top", "bottom"] as const) {
    const layout = splitPane(threadLeaf("a"), "a", "b", edge, "split")!
    assert.equal(layout.kind, "split")
    if (layout.kind !== "split") return
    assert.equal(
      layout.orientation,
      edge === "left" || edge === "right" ? "horizontal" : "vertical",
    )
    assert.deepEqual(
      visibleThreads(layout),
      edge === "left" || edge === "top" ? ["b", "a"] : ["a", "b"],
    )
  }
})

test("splitting with a thread that is already on screen moves it instead of duplicating it", () => {
  const pair = splitPane(threadLeaf("a"), "a", "b", "right", "row")!
  const nested = splitPane(pair, "b", "c", "bottom", "column")!
  const moved = splitPane(nested, "a", "c", "left", "moved")!
  assert.deepEqual(visibleThreads(moved), ["c", "a", "b"])
  // The source tree is untouched, so an aborted drag cannot leave a half-applied layout behind.
  assert.deepEqual(visibleThreads(nested), ["a", "b", "c"])
  assert.equal(moved.kind === "split" && moved.second.kind, "thread")
})

test("a split ignores a target that is not on screen and a thread dropped on itself", () => {
  const pair = splitPane(threadLeaf("a"), "a", "b", "right", "row")!
  assert.equal(splitPane(pair, "a", "a", "bottom", "self"), pair)
  assert.equal(splitPane(pair, "zzz", "c", "bottom", "missing"), pair)
  assert.equal(splitPane(null, "a", "b", "right", "empty"), null)
})

test("dropping on the body of a pane swaps two visible threads and takes over otherwise", () => {
  const pair = splitPane(threadLeaf("a"), "a", "b", "right", "row")!
  const nested = splitPane(pair, "b", "c", "bottom", "column")!
  assert.deepEqual(visibleThreads(movePane(nested, "a", "c")!), ["c", "b", "a"])
  assert.deepEqual(visibleThreads(movePane(nested, "b", "d")!), ["a", "d", "c"])
  assert.equal(movePane(nested, "b", "b"), nested)
})

test("closing nested panes promotes the surviving sibling and preserves its size", () => {
  const pair = splitPane(threadLeaf("a"), "a", "b", "right", "row")!
  const nested = splitPane(pair, "b", "c", "bottom", "column")!
  const resized = resizeSplit(nested, "column", 68)!
  const remaining = removePane(resized, "a")!
  assert.equal(remaining.kind === "split" && remaining.ratio, 68)
  assert.deepEqual(visibleThreads(removePane(remaining, "c")), ["b"])
  assert.equal(removePane(threadLeaf("a"), "a"), null)
})

test("a split keeps a usable size for both panes", () => {
  const pair = splitPane(threadLeaf("a"), "a", "b", "right", "row")!
  const ratioAfter = (ratio: number): number | undefined => {
    const resized = resizeSplit(pair, "row", ratio)
    return resized?.kind === "split" ? resized.ratio : undefined
  }
  assert.equal(ratioAfter(-20), 5)
  assert.equal(ratioAfter(400), 95)
  assert.equal(ratioAfter(62), 62)
})

test("selecting a thread reuses a pane instead of adding one", () => {
  const pair = splitPane(threadLeaf("a"), "a", "b", "right", "row")!
  assert.equal(selectPane(pair, "a", "b"), pair)
  assert.deepEqual(visibleThreads(selectPane(pair, "b", "c")), ["a", "c"])
  // A stale selection — its thread was replaced or deleted — still shows the thread somewhere.
  assert.deepEqual(visibleThreads(selectPane(pair, "gone", "c")), ["c", "b"])
  assert.deepEqual(visibleThreads(selectPane(null, null, "a")), ["a"])
})

test("pointer position picks the edge to split on, and the middle keeps the pane count", () => {
  assert.equal(dropZone(0.05, 0.5), "left")
  assert.equal(dropZone(0.95, 0.5), "right")
  assert.equal(dropZone(0.5, 0.1), "top")
  assert.equal(dropZone(0.5, 0.92), "bottom")
  assert.equal(dropZone(0.5, 0.5), "center")
  assert.equal(dropZone(0.3, 0.7), "center")
})

test("a dropped thread opens as a tab, takes focus, and leaves the tab it replaced open", () => {
  const store = useTabStore.getState()
  store.openThread("a")
  store.openThread("b")
  // Opening never splits: "b" took over the only pane while both threads stay in the tab strip.
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["b"])
  store.dropThread("b", "c", "right")
  assert.deepEqual([...useTabStore.getState().openThreadIds].sort(), ["a", "b", "c"])
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["b", "c"])
  assert.equal(useTabStore.getState().selectedThreadId, "c")
  store.dropThread("c", "a", "center")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["b", "a"])
  assert.deepEqual([...useTabStore.getState().openThreadIds].sort(), ["a", "b", "c"])
})

test("closing a thread removes its pane and leaves the other panes in place", () => {
  const store = useTabStore.getState()
  store.openThread("a")
  store.dropThread("a", "b", "bottom")
  store.dropThread("b", "c", "right")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a", "b", "c"])
  store.closeThread("c")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a", "b"])
  assert.equal(useTabStore.getState().selectedThreadId, "a")
  store.closeThread("a")
  store.closeThread("b")
  assert.equal(useTabStore.getState().layout, null)
  assert.equal(useTabStore.getState().selectedThreadId, null)
})

test("closing the visible pane falls back to a thread that is still open", () => {
  const store = useTabStore.getState()
  store.openThread("a")
  store.openThread("b")
  store.closeThread("b")
  assert.deepEqual(useTabStore.getState().openThreadIds, ["a"])
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a"])
  assert.equal(useTabStore.getState().selectedThreadId, "a")
})

test("opening beside splits against the pane in front and opens plainly without one", () => {
  const store = useTabStore.getState()
  store.openBeside("a", "right")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a"])
  store.openBeside("b", "right")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a", "b"])
  store.maximizeThread("b")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["b"])
  assert.deepEqual(useTabStore.getState().openThreadIds, ["a", "b"])
})

test("new and existing solo threads leave shared layouts and their focus intact", () => {
  const store = useTabStore.getState()
  store.openThread("solo")
  store.openThread("a")
  store.openBeside("b", "right")
  const sharedId = useTabStore.getState().selectedThreadTabId!
  const splitId = useTabStore.getState().layout!.id
  store.resizeSplit(splitId, 65)
  const sharedLayout = useTabStore.getState().layout
  assert.equal(useTabStore.getState().threadTabs.length, 2)
  store.openThread("new")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["new"])
  store.openThread("solo")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["solo"])
  store.selectTab(sharedId)
  assert.equal(useTabStore.getState().layout, sharedLayout)
  assert.equal(useTabStore.getState().selectedThreadId, "b")
  store.openThread("a")
  assert.equal(useTabStore.getState().selectedThreadTabId, sharedId)
  assert.equal(useTabStore.getState().selectedThreadId, "a")
  assert.equal(useTabStore.getState().threadTabs.length, 3)
})

test("cycling and closing operate on shared tabs rather than individual panes", () => {
  const store = useTabStore.getState()
  store.openThread("a")
  store.openBeside("b", "bottom")
  const sharedId = useTabStore.getState().selectedThreadTabId!
  store.openThread("c")
  store.openFile("workspace", "file.ts")
  store.cycle(1)
  assert.equal(useTabStore.getState().selectedThreadTabId, sharedId)
  assert.equal(useTabStore.getState().selectedFileId, null)
  store.cycle(1)
  assert.equal(useTabStore.getState().selectedThreadId, "c")
  store.cycle(-1)
  store.closeTab(sharedId)
  assert.deepEqual(useTabStore.getState().openThreadIds, ["c"])
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["c"])
})

test("moving a thread between shared tabs preserves the other panes in both layouts", () => {
  const store = useTabStore.getState()
  store.openThread("a")
  store.openBeside("b", "right")
  const firstId = useTabStore.getState().selectedThreadTabId!
  store.openThread("c")
  store.openBeside("d", "bottom")
  store.openBeside("b", "right")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["c", "d", "b"])
  store.selectTab(firstId)
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a"])
  assert.deepEqual([...useTabStore.getState().openThreadIds].sort(), ["a", "b", "c", "d"])
  store.removeThread("d")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a"])
  store.openThread("b")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["c", "b"])
  store.closeThread("b")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["c"])
})

test("showing a pane alone preserves the remaining split in its own tab", () => {
  const store = useTabStore.getState()
  store.openThread("a")
  store.openBeside("b", "right")
  store.openBeside("c", "bottom")
  const sharedId = useTabStore.getState().selectedThreadTabId!
  store.maximizeThread("b")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["b"])
  store.selectTab(sharedId)
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a", "c"])
})

test("opening beside from a file tab opens a solo thread without changing the saved split", () => {
  const store = useTabStore.getState()
  store.openThread("a")
  store.openBeside("b", "right")
  const sharedId = useTabStore.getState().selectedThreadTabId!
  store.openFile("workspace", "file.ts")
  store.openBeside("c", "right")
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["c"])
  store.selectTab(sharedId)
  assert.deepEqual(visibleThreads(useTabStore.getState().layout), ["a", "b"])
})
