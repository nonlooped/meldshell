/*
 * Development servers print where they listen, as in `Local: http://localhost:5173/`. The preview
 * offers the addresses a thread's terminals printed, newest first.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI escape sequences.
const ansi = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g

const localAddress =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[a-z0-9-]+\.localhost)(?::\d{2,5})?(?:\/[^\s"'<>`]*)?/gi

/** Local addresses in terminal output, in the order printed, without duplicates. */
export function detectServerUrls(output: string): string[] {
  const found: string[] = []
  for (const match of output.replace(ansi, "").matchAll(localAddress)) {
    const url = match[0]
      // Sentence punctuation and closing brackets after an address are not part of it.
      .replace(/[.,;:!?)\]}]+$/, "")
      // A server bound to every interface is reached through localhost.
      .replace(/^(https?:\/\/)(?:0\.0\.0\.0|\[::\])/i, "$1localhost")
    if (!found.includes(url)) found.push(url)
  }
  return found
}

/**
 * The address a typed location opens: a bare host such as `localhost:3000` gets `http://`. Null
 * for anything that is not an http or https address.
 */
export function previewAddress(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === "") return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}
