// Conservative gate, not a second Markdown parser. False positives (currency,
// escaped dollars, or code) are harmless; the native plugins decide the syntax.
export function mayContainMath(text: string): boolean {
  return text.includes("$") || /(?:`{3,}|~{3,})[ \t]*math(?:\s|$)/.test(text)
}
