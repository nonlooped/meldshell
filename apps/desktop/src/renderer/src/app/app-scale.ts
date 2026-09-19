export function scaleShortcut(event: KeyboardEvent): -1 | 0 | 1 {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    !event.shiftKey ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  )
    return 0
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))
  )
    return 0
  if (event.key === "+" || event.code === "NumpadAdd") return 1
  if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") return -1
  return 0
}

export function nextScale(current: number, direction: number): number {
  return Math.min(150, Math.max(70, current + direction * 10))
}
