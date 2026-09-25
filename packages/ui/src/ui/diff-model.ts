import { parseDiff, type ChangeData, type FileData, type HunkData } from "react-diff-view"

export type FileDiff = FileData & { patch: string }

export function diffLineCounts(files: ReadonlyArray<FileDiff>) {
  let insertions = 0
  let deletions = 0
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const change of hunk.changes) {
        if (change.type === "insert") insertions++
        if (change.type === "delete") deletions++
      }
    }
  }
  return { insertions, deletions }
}

function gitHeaderPath(path: string): string {
  // Git quotes UTF-8 bytes with octal escapes; decode before dropping a/b.
  const decoded = path.startsWith('"')
    ? decodeURIComponent(
        JSON.parse(
          path
            .replace(/%/g, "%25")
            .replace(
              /\\([0-7]{3})/g,
              (_, octal: string) => `%${Number.parseInt(octal, 8).toString(16).padStart(2, "0")}`,
            ),
        ),
      )
    : path
  return decoded.replace(/^[ab]\//, "")
}

/** A provider path with Git's side prefix, inside the quotes of a quoted name. */
const prefixedPath = (side: "a" | "b", path: string): string => {
  if (path === "/dev/null") return path
  return path.startsWith('"') ? `"${side}/${path.slice(1)}` : `${side}/${path}`
}

function parseFilePatch(patch: string): FileDiff {
  let source = patch
  // Provider patches have no Git preamble or a/b prefixes. The library's
  // unidiff adapter expects timestamps, so normalize these headers ourselves.
  if (source.startsWith("--- ")) {
    const header = /^--- (.+)\n\+\+\+ (.+)\n/.exec(source)
    if (!header) throw new Error("Missing file headers")
    const [, oldPath, newPath] = header
    const oldHeader = prefixedPath("a", oldPath!)
    const newHeader = prefixedPath("b", newPath!)
    source = `diff --git a/file b/file\n--- ${oldHeader}\n+++ ${newHeader}\n${source.slice(header[0].length)}`
  }
  if (!source.startsWith("diff --git ")) throw new Error("Missing Git headers")
  const [file] = parseDiff(source)
  if (!file) throw new Error("Missing file diff")
  const headers = /^--- (.+)\n\+\+\+ (.+)\n/m.exec(source)
  if (headers) {
    file.oldPath = gitHeaderPath(headers[1]!)
    file.newPath = gitHeaderPath(headers[2]!)
  }
  for (const hunk of file.hunks) {
    const range = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(hunk.content)
    if (!range) throw new Error("Invalid hunk header")
    // gitdiff-parser treats an explicit zero count as one.
    hunk.oldLines = Number(range[2] ?? 1)
    hunk.newLines = Number(range[4] ?? 1)
    const oldCount = hunk.changes.filter((change) => change.type !== "insert").length
    const newCount = hunk.changes.filter((change) => change.type !== "delete").length
    if (oldCount !== hunk.oldLines || newCount !== hunk.newLines) {
      throw new Error("Incomplete hunk")
    }
  }
  return { ...file, patch }
}

export function parseFileDiffs(patch: string): FileDiff[] {
  try {
    if (!patch.trim()) return []
    return patch
      .trimStart()
      .split(/(?=^diff --git )/m)
      .map(parseFilePatch)
  } catch {
    return []
  }
}

/** Unchanged lines left out of a rendered diff. A key means the lines are present and can be shown. */
export type DiffSegment =
  | { readonly kind: "hunk"; readonly hunk: HunkData }
  | { readonly kind: "gap"; readonly lines: number; readonly key: string | null }

// Folding fewer lines than this saves no space over showing them.
const MIN_FOLD = 4

// A zero-length side starts after the line its header names.
const firstLine = (start: number, lines: number): number => (lines === 0 ? start + 1 : start)

/**
 * Splits hunks into visible hunks and gaps. Runs of unchanged lines inside a hunk keep `context`
 * lines beside each change and fold the rest behind an expandable key; lines between hunks that the
 * patch never included become fixed gaps.
 */
export function foldDiff(
  hunks: ReadonlyArray<HunkData>,
  expanded: ReadonlySet<string>,
  context = 3,
): DiffSegment[] {
  const segments: DiffSegment[] = []
  let current: ChangeData[] = []
  let oldStart = 0
  let newStart = 0
  let nextOld = 0
  let nextNew = 0
  const flush = () => {
    if (current.length === 0) return
    const oldLines = current.filter((change) => change.type !== "insert").length
    const newLines = current.filter((change) => change.type !== "delete").length
    segments.push({
      kind: "hunk",
      hunk: {
        content: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`,
        oldStart,
        newStart,
        oldLines,
        newLines,
        changes: current,
      },
    })
    current = []
  }
  const advance = (change: ChangeData) => {
    if (change.type !== "insert") nextOld++
    if (change.type !== "delete") nextNew++
  }
  const keep = (change: ChangeData) => {
    if (current.length === 0) {
      oldStart = nextOld
      newStart = nextNew
    }
    current.push(change)
    advance(change)
  }
  const gap = (lines: number, key: string | null) => {
    flush()
    segments.push({ kind: "gap", lines, key })
  }
  /** Keeps `head` and `tail` lines of an unchanged run and folds the middle unless it is expanded. */
  const foldRun = (
    run: ReadonlyArray<ChangeData>,
    edges: { head: number; tail: number; key: (hiddenFrom: number) => string },
  ) => {
    const hidden = run.length - edges.head - edges.tail
    const key = edges.key(edges.head)
    if (hidden < MIN_FOLD || expanded.has(key)) {
      run.forEach(keep)
      return
    }
    run.slice(0, edges.head).forEach(keep)
    run.slice(edges.head, run.length - edges.tail).forEach(advance)
    gap(hidden, key)
    run.slice(run.length - edges.tail).forEach(keep)
  }

  hunks.forEach((hunk, hunkIndex) => {
    const first = firstLine(hunk.oldStart, hunk.oldLines)
    const previous = hunks[hunkIndex - 1]
    const omitted =
      previous === undefined
        ? first - 1
        : first - (firstLine(previous.oldStart, previous.oldLines) + previous.oldLines)
    if (omitted > 0) gap(omitted, null)
    else flush()
    nextOld = first
    nextNew = firstLine(hunk.newStart, hunk.newLines)

    const { changes } = hunk
    let index = 0
    while (index < changes.length) {
      if (changes[index]!.type !== "normal") {
        keep(changes[index]!)
        index++
        continue
      }
      let end = index
      while (end < changes.length && changes[end]!.type === "normal") end++
      foldRun(changes.slice(index, end), {
        head: index === 0 ? 0 : context,
        tail: end === changes.length ? 0 : context,
        key: (hiddenFrom) => `${hunkIndex}:${nextOld + hiddenFrom}`,
      })
      index = end
    }
  })
  flush()
  return segments
}
