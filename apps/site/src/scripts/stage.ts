/* A stage keeps a product fragment at a fixed layout width and scales it to fit its container,
   the way a capture would, instead of reflowing the interface. `data-stage` is the smallest
   layout width; a stage with `data-compact-at` switches to `data-compact-width` below that
   container width so small screens get a single-pane layout at readable size. */

const fit = (stage: HTMLElement) => {
  const child = stage.firstElementChild as HTMLElement | null
  if (!child) return
  const available = stage.clientWidth
  const compactAt = Number(stage.dataset.compactAt ?? 0)
  const compact = compactAt > 0 && available < compactAt
  stage.toggleAttribute("data-compact", compact)
  const minimum = Number(compact ? stage.dataset.compactWidth : stage.dataset.stage)
  const width = Math.max(available, minimum)
  const scale = available / width
  child.style.width = `${width}px`
  child.style.transform = `scale(${scale})`
  stage.style.height = `${child.offsetHeight * scale}px`
  stage.style.setProperty("--scale", String(scale))
}

/* Both the container and the fragment are observed: the fragment's own height changes as fonts
   load, and the stage must follow it. */
const observer = new ResizeObserver((entries) => {
  entries.forEach(({ target }) => {
    const stage = target.hasAttribute("data-stage") ? target : target.parentElement
    if (stage) fit(stage as HTMLElement)
  })
})
document.querySelectorAll<HTMLElement>("[data-stage]").forEach((stage) => {
  stage.dataset.ready = "true"
  fit(stage)
  observer.observe(stage)
  if (stage.firstElementChild) observer.observe(stage.firstElementChild)
})

export {}
