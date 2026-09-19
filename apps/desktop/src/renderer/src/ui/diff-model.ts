import { parseDiff, type FileData } from "react-diff-view"

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

function parseFilePatch(patch: string): FileDiff {
  let source = patch
  // Provider patches have no Git preamble or a/b prefixes. The library's
  // unidiff adapter expects timestamps, so normalize these headers ourselves.
  if (source.startsWith("--- ")) {
    const header = /^--- (.+)\n\+\+\+ (.+)\n/.exec(source)
    if (!header) throw new Error("Missing file headers")
    const [, oldPath, newPath] = header
    const oldHeader = oldPath === "/dev/null" ? oldPath : `a/${oldPath}`
    const newHeader = newPath === "/dev/null" ? newPath : `b/${newPath}`
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
