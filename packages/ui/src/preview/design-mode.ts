import type { ComposerAttachment, PickedElement } from "@meldshell/contracts/ipc"

/** A fence longer than any run of backticks inside the text it wraps. */
const fence = (body: string): string => {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length))
  return "`".repeat(Math.max(3, longest + 1))
}

const block = (language: string, body: string): string => {
  const marks = fence(body)
  return `${marks}${language}\n${body}\n${marks}`
}

/** What the agent reads about an element picked in the preview. */
export function elementContext(element: PickedElement): string {
  const lines = [
    `Selected element \`${element.label}\` on ${element.url}${element.screenshot ? " (screenshot attached)" : ""}:`,
    `- Selector: \`${element.selector}\``,
    `- Size: ${element.width}×${element.height}`,
  ]
  if (element.text) lines.push(`- Text: ${JSON.stringify(element.text)}`)
  const parts = [lines.join("\n"), block("html", element.html)]
  if (element.styles.length > 0)
    parts.push(
      `Computed styles:\n${block("css", element.styles.map(([name, value]) => `${name}: ${value};`).join("\n"))}`,
    )
  return parts.join("\n\n")
}

/** The composer attachment for a picked element: its screenshot, carrying its details. */
export function elementAttachment(element: PickedElement): ComposerAttachment | null {
  if (element.screenshot === null) return null
  return {
    type: "image",
    value: element.screenshot,
    name: `<${element.label}>`,
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
