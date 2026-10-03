import { useLayoutEffect, useState, useSyncExternalStore } from "react"

/**
 * How much room the window gives the app: a phone-sized column, a compact window where the
 * sidebars take turns, or a regular desktop layout. Widths are measured in app pixels, so zooming
 * the app in narrows the window the same way resizing it does.
 */
export type ViewportTier = "phone" | "compact" | "regular"

const PHONE_BELOW = 640
const COMPACT_BELOW = 960

const tierFor = (width: number): ViewportTier => {
  if (width < PHONE_BELOW) return "phone"
  return width < COMPACT_BELOW ? "compact" : "regular"
}

const currentTier = () => {
  const scale =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-scale")) ||
    1
  return tierFor(window.innerWidth / scale)
}

let tier: ViewportTier | undefined
let observer: ResizeObserver | undefined
const listeners = new Set<() => void>()

const measure = () => {
  const next = currentTier()
  if (next === tier) return
  tier = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    // The body resizes with the window and with the app scale, which sizes it.
    observer = new ResizeObserver(measure)
    observer.observe(document.body)
    measure()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      observer?.disconnect()
      observer = undefined
    }
  }
}

const getSnapshot = () => {
  tier ??= currentTier()
  return tier
}

export const useViewportTier = () => useSyncExternalStore(subscribe, getSnapshot)

/** The element's width in pixels, or undefined until it has been measured. */
export function useElementWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number>()
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const resize = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width))
    resize.observe(element)
    return () => resize.disconnect()
  }, [ref])
  return width
}
