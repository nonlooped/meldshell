/** A fenced code block whose contents cannot close the fence early. */
export function fencedCode(language: string, body: string) {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length))
  const fence = "`".repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${body}\n${fence}`
}
