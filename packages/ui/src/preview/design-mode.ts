import type { ComposerAttachment, PickedElement } from "@meldshell/contracts/ipc"

import { fencedCode } from "../ui/markdown-code"

const shorten = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text

/** What the agent reads about an element picked in the preview. */
export function elementContext(element: PickedElement): string {
  const lines = [
    `Selected element \`${element.label}\` on ${element.url}${element.screenshot ? " (screenshot attached)" : ""}:`,
    `- Selector: \`${element.selector}\``,
    `- Size: ${element.width}×${element.height}`,
  ]
  if (element.text) lines.push(`- Text: ${JSON.stringify(element.text)}`)
  const parts = [lines.join("\n"), fencedCode("html", element.html)]
  if (element.styles.length > 0)
    parts.push(
      `Computed styles:\n${fencedCode("css", element.styles.map(([name, value]) => `${name}: ${value};`).join("\n"))}`,
    )
  return parts.join("\n\n")
}

/** The composer attachment for a picked element: its screenshot, carrying its details. */
export function elementAttachment(element: PickedElement): ComposerAttachment | null {
  if (element.screenshot === null) return null
  return {
    type: "image",
    value: element.screenshot,
    name: element.text ? `<${element.label}> ${shorten(element.text, 32)}` : `<${element.label}>`,
    context: elementContext(element),
  }
}

/** The message text with the details of any picked elements after it. */
export function messageWithContext(
  text: string,
  attachments: ReadonlyArray<ComposerAttachment>,
): string {
  const contexts = attachments.flatMap((attachment) =>
    attachment.context ? [attachment.context] : [],
  )
  if (contexts.length === 0) return text
  return [text.trimEnd(), ...contexts].filter(Boolean).join("\n\n")
}
