import { animate } from "motion/react"

// Something that moves between places flies there. Its destination is often in a
// clipped scroller, so a copy flies above the page while the real element stays
// hidden until the copy lands.
interface Launch {
  readonly match: string
  /** Viewport position the copy starts from. */
  readonly x: number
  readonly y: number
  readonly at: number
}

// A destination that appears later than this (such as a queued prompt) does not fly.
const launchLifetimeMs = 5_000
const launches = new Map<string, Launch>()
const ease = [0.16, 1, 0.3, 1] as const

/** Rects are in viewport pixels; elements are positioned inside the zoomed body. */
const zoomOf = (element: HTMLElement) =>
  element.getBoundingClientRect().width / element.offsetWidth || 1

export function launchFlight(key: string, x: number, y: number, match = ""): void {
  launches.set(key, { match, x, y, at: performance.now() })
}

/** Starts a flight from the first line of a text field's contents. */
export function launchFromText(key: string, field: HTMLTextAreaElement): void {
  const rect = field.getBoundingClientRect()
  const scale = zoomOf(field)
  const style = getComputedStyle(field)
  launchFlight(
    key,
    rect.left + Number.parseFloat(style.paddingLeft) * scale,
    rect.top + (Number.parseFloat(style.paddingTop) - field.scrollTop) * scale,
    field.value.trim(),
  )
}

// The copy leaves the page, so it carries the element's resolved appearance with it.
const copiedProperties = [
  "box-sizing",
  "padding",
  "border-width",
  "border-style",
  "border-radius",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "white-space",
  "overflow-wrap",
] as const

function copyOf(element: HTMLElement, style: CSSStyleDeclaration): HTMLElement {
  const ghost = element.cloneNode(true) as HTMLElement
  for (const property of copiedProperties)
    ghost.style.setProperty(property, style.getPropertyValue(property))
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    margin: "0px",
    width: `${element.offsetWidth}px`,
    zIndex: "40",
    pointerEvents: "none",
    willChange: "transform",
  })
  ghost.setAttribute("aria-hidden", "true")
  ghost.removeAttribute("id")
  return ghost
}

/**
 * Flies a pending launch into `target`. `content` aligns the launch point with the
 * target's text instead of its edge, and fades in the target's background and border.
 * Returns cleanup.
 */
export function landFlight(
  key: string,
  target: HTMLElement,
  { match = "", content = false }: { match?: string; content?: boolean } = {},
): () => void {
  const launch = launches.get(key)
  launches.delete(key)
  if (
    launch === undefined ||
    performance.now() - launch.at > launchLifetimeMs ||
    launch.match !== match.trim()
  )
    return () => undefined

  const style = getComputedStyle(target)
  const ghost = copyOf(target, style)
  const background = style.backgroundColor
  const border = style.borderTopColor
  const scale = zoomOf(target)
  const insetX = content
    ? Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth)
    : 0
  const insetY = content
    ? Number.parseFloat(style.paddingTop) + Number.parseFloat(style.borderTopWidth)
    : 0
  const fromX = launch.x / scale - insetX
  const fromY = launch.y / scale - insetY

  const place = (progress: number) => {
    // A scroller may still settle, so follow the target's live position.
    const rect = target.getBoundingClientRect()
    const x = fromX + (rect.left / scale - fromX) * progress
    const y = fromY + (rect.top / scale - fromY) * progress
    ghost.style.transform = `translate(${x}px, ${y}px)`
    if (!content) return
    const chrome = `${Math.round(Math.min(1, progress * 1.4) * 100)}%`
    ghost.style.backgroundColor = `color-mix(in srgb, ${background} ${chrome}, transparent)`
    ghost.style.borderColor = `color-mix(in srgb, ${border} ${chrome}, transparent)`
  }

  target.style.visibility = "hidden"
  place(0)
  document.body.append(ghost)
  const finish = () => {
    ghost.remove()
    target.style.removeProperty("visibility")
  }
  const flight = animate(0, 1, { duration: 0.46, ease, onUpdate: place, onComplete: finish })
  return () => {
    flight.stop()
    finish()
  }
}

/** A text field's contents shrink into `target`, e.g. a prompt joining the queue. */
export function dropText(field: HTMLTextAreaElement, target: HTMLElement): void {
  const style = getComputedStyle(field)
  const ghost = document.createElement("div")
  ghost.textContent = field.value
  for (const property of copiedProperties)
    ghost.style.setProperty(property, style.getPropertyValue(property))
  const scale = zoomOf(field)
  const from = field.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const x = from.left / scale
  const y = from.top / scale
  const dx = (to.left + to.width / 2 - (from.left + from.width / 2)) / scale
  const dy = (to.top + to.height / 2 - (from.top + from.height / 2)) / scale
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    margin: "0px",
    width: `${field.offsetWidth}px`,
    height: `${field.offsetHeight}px`,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    borderColor: "transparent",
    zIndex: "40",
    pointerEvents: "none",
  })
  ghost.setAttribute("aria-hidden", "true")
  document.body.append(ghost)
  // The draft clears once the queue accepts it; until then only the copy shows the text.
  field.style.color = "transparent"
  const flight = ghost.animate(
    [
      { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${x + dx}px, ${y + dy}px) scale(0.08)`, opacity: 0 },
    ],
    { duration: 380, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  )
  flight.onfinish = flight.oncancel = () => {
    ghost.remove()
    field.style.removeProperty("color")
  }
}
