export function copyableText(content: HTMLElement | null, fallback: string): string {
  if (!content) return fallback
  const clone = content.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll(
      "button:not(.reference-chip):not(.markdown-image-button), .markdown-toolbar, .markdown-code > header, [aria-hidden=true]",
    )
    .forEach((node) => node.remove())
  clone
    .querySelectorAll("math")
    .forEach((node) =>
      node.replaceWith(
        document.createTextNode(
          node.querySelector("annotation")?.textContent ?? node.textContent ?? "",
        ),
      ),
    )
  clone
    .querySelectorAll("img")
    .forEach((node) => node.replaceWith(document.createTextNode(node.alt)))
  clone
    .querySelectorAll("p,pre,blockquote,h1,h2,h3,h4,h5,h6,li,tr")
    .forEach((node) => node.after(document.createTextNode("\n")))
  clone.querySelectorAll("td,th").forEach((node) => node.after(document.createTextNode("\t")))
  return (clone.textContent ?? fallback).replace(/\n{3,}/g, "\n\n").trim()
}
