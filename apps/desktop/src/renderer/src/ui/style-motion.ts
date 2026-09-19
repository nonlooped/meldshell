import { animate } from "motion/mini"

// Tailwind owns each state. Motion interpolates between its resolved values so
// hover, focus, Base UI attributes, and theme changes share the same color tokens.
// Opt in on individual elements; virtualized row positions are never animated.
type StyledElement = HTMLElement | SVGElement
interface Entry {
  element: StyledElement
  properties: string[]
  values: Record<string, string>
  animation?: ReturnType<typeof animate>
  entrance?: ReturnType<typeof animate>
}
const read = ({ element, properties }: Pick<Entry, "element" | "properties">) => {
  const style = getComputedStyle(element)
  return Object.fromEntries(
    properties.map((property) => [property, style.getPropertyValue(property)]),
  )
}

export function installStyleMotion(root: HTMLElement) {
  const entries = new Map<Element, Entry>()
  const pending = new Set<Entry>()
  let frame = 0

  const register = (element: Element) => {
    if (!(element instanceof HTMLElement || element instanceof SVGElement) || entries.has(element))
      return
    const properties = element.dataset.motion?.split(" ").filter(Boolean)
    if (!properties?.length) return
    const entry: Entry = { element, properties, values: {} }
    entry.values = read(entry)
    entries.set(element, entry)
    if (element.hasAttribute("data-motion-enter")) {
      entry.entrance = animate(
        element,
        { opacity: [0, 1] },
        {
          duration: 0.2,
          ease: [0.2, 0.7, 0.2, 1],
          onComplete: () => {
            element.style.removeProperty("opacity")
            entry.entrance = undefined
          },
        },
      )
    }
  }
  const scan = (element: Element) => {
    register(element)
    for (const child of element.querySelectorAll("[data-motion]")) register(child)
  }
  const update = (entry: Entry) => {
    const { element } = entry
    if (!element.isConnected) {
      entry.animation?.cancel()
      entry.entrance?.cancel()
      entries.delete(element)
      return
    }
    const current = read(entry)
    const wasRunning = Boolean(entry.animation)
    entry.animation?.cancel()
    entry.animation = undefined
    const target = read(entry)
    const properties = entry.properties.filter(
      (property) => entry.values[property] !== target[property],
    )
    // Preserve an interrupted animation if its target is unchanged.
    const moving = entry.properties.filter((property) => current[property] !== target[property])
    const changed = [...new Set([...properties, ...moving])]
    if (!changed.length) return
    const from = wasRunning ? current : entry.values
    entry.values = target
    const inline = changed.map(
      (property) =>
        [
          property,
          element.style.getPropertyValue(property),
          element.style.getPropertyPriority(property),
        ] as const,
    )
    const duration = Number(element.dataset.motionDuration ?? "0.12")
    // Resizable panels follow the pointer directly while the separator is active.
    if (
      element.hasAttribute("data-panel") &&
      element.parentElement?.querySelector('[data-separator="active"]')
    )
      return
    entry.animation = animate(
      element,
      Object.fromEntries(
        changed.map((property) => [
          property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
          [from[property], target[property]],
        ]),
      ),
      {
        duration,
        ease: [0.2, 0.7, 0.2, 1],
        onComplete: () => {
          // Motion commits its final keyframe. Release it so Tailwind remains the source of truth.
          for (const [property, value, priority] of inline) {
            if (value) element.style.setProperty(property, value, priority)
            else element.style.removeProperty(property)
          }
          entry.animation = undefined
        },
      },
    )
  }
  const schedule = (target: Element) => {
    for (const entry of entries.values()) {
      if (target.contains(entry.element) || entry.element.contains(target)) pending.add(entry)
    }
    if (frame || pending.size === 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      for (const entry of pending) update(entry)
      pending.clear()
    })
  }
  const onInteraction = (event: Event) => {
    if (event.target instanceof Element) schedule(event.target)
  }
  const events = ["pointerenter", "pointerleave", "pointerdown", "pointerup", "focusin", "focusout"]
  scan(root)
  for (const event of events) root.addEventListener(event, onInteraction, true)
  const removeDetached = () => {
    for (const [element, entry] of entries) {
      if (element.isConnected) continue
      entry.animation?.cancel()
      entry.entrance?.cancel()
      entries.delete(element)
      pending.delete(entry)
    }
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        Array.from(record.addedNodes)
          .filter((node): node is Element => node instanceof Element)
          .forEach(scan)
        if (record.removedNodes.length) removeDetached()
      } else if (record.target instanceof Element) {
        schedule(record.target)
      }
    }
  })
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "class",
      "style",
      "disabled",
      "data-selected",
      "data-active",
      "data-status",
      "data-attention",
      "data-focused",
      "data-variant",
      "data-checked",
      "data-highlighted",
      "data-disabled",
      "data-popup-open",
      "data-panel-open",
      "data-revealed",
      "data-pressed",
      "data-separator",
      "aria-expanded",
      "aria-selected",
      "data-theme",
    ],
  })
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    for (const event of events) root.removeEventListener(event, onInteraction, true)
    for (const entry of entries.values()) {
      entry.animation?.cancel()
      entry.entrance?.cancel()
    }
  }
}
