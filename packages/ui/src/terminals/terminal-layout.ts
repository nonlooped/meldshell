/*
 * A thread's terminal panel holds a binary tree of panes, like the thread workbench: every leaf is
 * one shell, every split owns an orientation and the percentage its first child occupies.
 */

export type TerminalLayout =
  | { readonly kind: "terminal"; readonly id: string }
  | {
      readonly kind: "split"
      readonly id: string
      readonly orientation: "horizontal" | "vertical"
      /** Percentage of the split taken by `first`; the rest belongs to `second`. */
      readonly ratio: number
      readonly first: TerminalLayout
      readonly second: TerminalLayout
    }

export function terminalIds(layout: TerminalLayout | null): string[] {
  if (!layout) return []
  return layout.kind === "terminal"
    ? [layout.id]
    : [...terminalIds(layout.first), ...terminalIds(layout.second)]
}

/** Opens `terminalId` beside `target`: to its right when horizontal, below it when vertical. */
export function splitTerminal(
  layout: TerminalLayout,
  target: string,
  terminalId: string,
  orientation: "horizontal" | "vertical",
  splitId: string,
): TerminalLayout {
  if (layout.kind === "terminal")
    return layout.id === target
      ? {
          kind: "split",
          id: splitId,
          orientation,
          ratio: 50,
          first: layout,
          second: { kind: "terminal", id: terminalId },
        }
      : layout
  const first = splitTerminal(layout.first, target, terminalId, orientation, splitId)
  const second = splitTerminal(layout.second, target, terminalId, orientation, splitId)
  return first === layout.first && second === layout.second ? layout : { ...layout, first, second }
}

export function removeTerminal(layout: TerminalLayout | null, id: string): TerminalLayout | null {
  if (!layout) return null
  if (layout.kind === "terminal") return layout.id === id ? null : layout
  const first = removeTerminal(layout.first, id)
  const second = removeTerminal(layout.second, id)
  // A split with one surviving child collapses into that child.
  if (!first) return second
  if (!second) return first
  return first === layout.first && second === layout.second ? layout : { ...layout, first, second }
}

export function resizeTerminalSplit(
  layout: TerminalLayout,
  id: string,
  ratio: number,
): TerminalLayout {
  if (layout.kind === "terminal") return layout
  if (layout.id === id) return { ...layout, ratio: Math.max(5, Math.min(95, ratio)) }
  const first = resizeTerminalSplit(layout.first, id, ratio)
  const second = resizeTerminalSplit(layout.second, id, ratio)
  return first === layout.first && second === layout.second ? layout : { ...layout, first, second }
}
