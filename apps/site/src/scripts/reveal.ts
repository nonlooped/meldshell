/* Elements marked `data-reveal` rise into place the first time they enter the viewport. */
const revealer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      ;(entry.target as HTMLElement).dataset.in = "true"
      revealer.unobserve(entry.target)
    })
  },
  { rootMargin: "0px 0px -10% 0px" },
)
document
  .querySelectorAll<HTMLElement>("[data-reveal]")
  .forEach((element) => revealer.observe(element))

export {}
