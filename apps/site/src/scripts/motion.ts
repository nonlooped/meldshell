import { animate, hover } from "motion"

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
hover("[data-motion-link]", (element) => {
  const kind = element.getAttribute("data-motion-link")
  const duration = reducedMotion.matches ? 0 : 0.15
  const resting =
    kind === "download"
      ? { backgroundColor: "var(--color-ink)" }
      : kind === "taskbar"
        ? { color: "var(--color-ink-2)", backgroundColor: "rgba(0, 0, 0, 0)" }
        : { color: "var(--color-ink-2)" }
  const active =
    kind === "download"
      ? { backgroundColor: "var(--color-white)" }
      : kind === "taskbar"
        ? { color: "var(--color-ink)", backgroundColor: "var(--color-hover)" }
        : { color: "var(--color-ink)" }
  animate(element, active, { duration })
  return () => {
    animate(element, resting, { duration: reducedMotion.matches ? 0 : 0.15 })
  }
})
