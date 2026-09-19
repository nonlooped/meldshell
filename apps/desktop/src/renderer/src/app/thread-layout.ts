/*
 * The thread pane holds a binary tree of panes. Every leaf shows one open thread; every split node
 * owns an orientation and the percentage its first child occupies. Keeping the tree here — pure and
 * free of React — lets the drag gestures, the pane menus, and their tests share one set of rules.
 */

export type SplitEdge = "left" | "right" | "top" | "bottom"

/** Where a dragged thread lands: against one edge of a pane, or on top of the pane itself. */
export type DropZone = SplitEdge | "center"

export type ThreadLayout =
  | { readonly kind: "thread"; readonly id: string; readonly threadId: string }
  | {
      readonly kind: "split"
      readonly id: string
      readonly orientation: "horizontal" | "vertical"
      /** Percentage of the split taken by `first`; the rest belongs to `second`. */
      readonly ratio: number
      readonly first: ThreadLayout
      readonly second: ThreadLayout
    }

/** Panel identities are derived from the thread so a pane keeps its size across re-renders. */
export const threadLeaf = (threadId: string): ThreadLayout => ({
  kind: "thread",
  id: `pane:${threadId}`,
  threadId,
})

export function visibleThreads(layout: ThreadLayout | null): string[] {
  if (!layout) return []
  return layout.kind === "thread"
    ? [layout.threadId]
    : [...visibleThreads(layout.first), ...visibleThreads(layout.second)]
}

export function removePane(layout: ThreadLayout | null, threadId: string): ThreadLayout | null {
  if (!layout) return null
  if (layout.kind === "thread") return layout.threadId === threadId ? null : layout
  const first = removePane(layout.first, threadId)
  const second = removePane(layout.second, threadId)
  // A split with one surviving child collapses into that child and keeps the rest of the tree.
  if (!first) return second
  if (!second) return first
  return first === layout.first && second === layout.second ? layout : { ...layout, first, second }
}

function replacePane(
  layout: ThreadLayout,
  target: string,
  replacement: ThreadLayout,
): ThreadLayout {
  if (layout.kind === "thread") return layout.threadId === target ? replacement : layout
  return {
    ...layout,
    first: replacePane(layout.first, target, replacement),
    second: replacePane(layout.second, target, replacement),
  }
}

function alignedPaneCount(layout: ThreadLayout, orientation: "horizontal" | "vertical"): number {
  return layout.kind === "split" && layout.orientation === orientation
    ? alignedPaneCount(layout.first, orientation) + alignedPaneCount(layout.second, orientation)
    : 1
}

function balanceAlignedSplits(
  layout: ThreadLayout,
  orientation: "horizontal" | "vertical",
): ThreadLayout {
  if (layout.kind === "thread" || layout.orientation !== orientation) return layout
  const first = balanceAlignedSplits(layout.first, orientation)
  const second = balanceAlignedSplits(layout.second, orientation)
  const firstCount = alignedPaneCount(first, orientation)
  const secondCount = alignedPaneCount(second, orientation)
  return {
    ...layout,
    ratio: (firstCount / (firstCount + secondCount)) * 100,
    first,
    second,
  }
}

function containsThread(layout: ThreadLayout, threadId: string): boolean {
  return layout.kind === "thread"
    ? layout.threadId === threadId
    : containsThread(layout.first, threadId) || containsThread(layout.second, threadId)
}

function replacePaneAndBalance(
  layout: ThreadLayout,
  target: string,
  replacement: ThreadLayout,
  orientation: "horizontal" | "vertical",
): { readonly layout: ThreadLayout; readonly aligned: boolean } {
  if (layout.kind === "thread") {
    return { layout: layout.threadId === target ? replacement : layout, aligned: true }
  }
  const targetInFirst = containsThread(layout.first, target)
  const changed = replacePaneAndBalance(
    targetInFirst ? layout.first : layout.second,
    target,
    replacement,
    orientation,
  )
  const next = targetInFirst
    ? { ...layout, first: changed.layout }
    : { ...layout, second: changed.layout }
  const aligned = changed.aligned && layout.orientation === orientation
  return {
    layout: aligned ? balanceAlignedSplits(next, orientation) : next,
    aligned,
  }
}

function swapPanes(layout: ThreadLayout, left: string, right: string): ThreadLayout {
  if (layout.kind === "thread") {
    if (layout.threadId === left) return threadLeaf(right)
    return layout.threadId === right ? threadLeaf(left) : layout
  }
  return {
    ...layout,
    first: swapPanes(layout.first, left, right),
    second: swapPanes(layout.second, left, right),
  }
}

export function splitPane(
  layout: ThreadLayout | null,
  target: string,
  threadId: string,
  edge: SplitEdge,
  splitId: string,
): ThreadLayout | null {
  if (!layout || target === threadId || !visibleThreads(layout).includes(target)) return layout
  // Splitting with a thread that is already on screen moves it rather than duplicating it.
  const remaining = removePane(layout, threadId) ?? layout
  const before = edge === "left" || edge === "top"
  const orientation = edge === "left" || edge === "right" ? "horizontal" : "vertical"
  return replacePaneAndBalance(
    remaining,
    target,
    {
      kind: "split",
      id: splitId,
      orientation,
      ratio: 50,
      first: threadLeaf(before ? threadId : target),
      second: threadLeaf(before ? target : threadId),
    },
    orientation,
  ).layout
}

/**
 * Dropping onto the body of a pane keeps the pane count: two visible threads trade places, and a
 * thread from the inbox or the tab strip takes the pane over.
 */
export function movePane(
  layout: ThreadLayout | null,
  target: string,
  threadId: string,
): ThreadLayout | null {
  if (!layout || target === threadId || !visibleThreads(layout).includes(target)) return layout
  return visibleThreads(layout).includes(threadId)
    ? swapPanes(layout, target, threadId)
    : replacePane(layout, target, threadLeaf(threadId))
}

export function resizeSplit(
  layout: ThreadLayout | null,
  id: string,
  ratio: number,
): ThreadLayout | null {
  if (!layout || layout.kind === "thread") return layout
  if (layout.id === id) return { ...layout, ratio: Math.max(5, Math.min(95, ratio)) }
  return {
    ...layout,
    first: resizeSplit(layout.first, id, ratio)!,
    second: resizeSplit(layout.second, id, ratio)!,
  }
}

/** Outer quarter of a pane splits along that edge; the middle takes the thread as it is. */
export function dropZone(fractionX: number, fractionY: number): DropZone {
  const edges: ReadonlyArray<readonly [SplitEdge, number]> = [
    ["left", fractionX],
    ["right", 1 - fractionX],
    ["top", fractionY],
    ["bottom", 1 - fractionY],
  ]
  const nearest = edges.reduce((closest, edge) => (edge[1] < closest[1] ? edge : closest))
  return nearest[1] > 0.25 ? "center" : nearest[0]
}
