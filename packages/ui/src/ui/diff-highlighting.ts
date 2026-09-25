import { markEdits, tokenize, type HunkData } from "react-diff-view"
import { refractor, sourceLanguage } from "./syntax-highlighting"

export function diffTokens(hunks: HunkData[], path: string) {
  const changes = hunks.flatMap((hunk) => hunk.changes)
  // Tokenization allocates through the largest source line number. Bound that
  // work as well as long/minified lines; the plain diff remains fully readable.
  if (
    hunks.some(
      (hunk) => Math.max(hunk.oldStart + hunk.oldLines, hunk.newStart + hunk.newLines) > 20_000,
    ) ||
    changes.some((change) => change.content.length > 2_000) ||
    changes.reduce((size, change) => size + change.content.length, 0) > 100_000
  )
    return undefined
  const language = sourceLanguage(path)
  const enhancers = [markEdits(hunks, { type: "line" })]
  try {
    return refractor.registered(language)
      ? tokenize(hunks, {
          highlight: true,
          language,
          // react-diff-view expects the pre-v4 array API, rather than a HAST root.
          refractor: {
            highlight: (text: string, grammar: string) =>
              refractor.highlight(text, grammar).children,
          },
          enhancers,
        })
      : tokenize(hunks, { enhancers })
  } catch {
    return undefined
  }
}

export function visibleDiffHunks(hunks: HunkData[], limit: number): HunkData[] {
  const visible: HunkData[] = []
  let remaining = limit
  for (const hunk of hunks) {
    if (remaining <= 0) break
    const changes = hunk.changes.slice(0, remaining)
    visible.push({
      ...hunk,
      changes,
      oldLines: changes.filter((change) => change.type !== "insert").length,
      newLines: changes.filter((change) => change.type !== "delete").length,
    })
    remaining -= changes.length
  }
  return visible
}
