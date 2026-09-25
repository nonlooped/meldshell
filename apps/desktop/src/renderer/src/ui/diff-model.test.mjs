import assert from "node:assert/strict"
import { test } from "node:test"
import { diffLineCounts, foldDiff, parseFileDiffs } from "./diff-model.ts"
import { fileChangePatches } from "../threads/file-change-diffs.ts"

test("provider additions retain zero old lines and newline markers after the lazy split", () => {
  const [{ patch }] = fileChangePatches({
    payload: { item: { changes: [{ path: "src/new.ts", diff: "hello", kind: { type: "add" } }] } },
  })
  const files = parseFileDiffs(patch)
  assert.equal(files.length, 1)
  assert.equal(files[0].type, "add")
  assert.equal(files[0].newPath, "src/new.ts")
  assert.equal(files[0].hunks[0].oldLines, 0)
  assert.equal(files[0].newEndingNewLine, false)
  assert.deepEqual(diffLineCounts(files), { insertions: 1, deletions: 0 })
})

test("provider deletions and non-ASCII paths parse back to their file", () => {
  const [{ patch }] = fileChangePatches({
    payload: {
      item: { changes: [{ path: "docs/café.md", diff: "one\ntwo\n", kind: { type: "delete" } }] },
    },
  })
  const files = parseFileDiffs(patch)
  assert.equal(files.length, 1)
  assert.equal(files[0].type, "delete")
  assert.equal(files[0].oldPath, "docs/café.md")
  assert.deepEqual(diffLineCounts(files), { insertions: 0, deletions: 2 })
})

test("incomplete streamed patches retain the raw-text fallback", () => {
  assert.deepEqual(parseFileDiffs("--- src/a.ts\n+++ src/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n"), [])
})

const fullContextPatch = (lines, changedAt) =>
  [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    `@@ -1,${lines} +1,${lines} @@`,
    ...Array.from({ length: lines }, (_, index) =>
      index + 1 === changedAt ? `-old ${changedAt}\n+new ${changedAt}` : ` line ${index + 1}`,
    ),
    "",
  ].join("\n")

test("long unchanged runs fold around a change and keep their line numbers", () => {
  const [file] = parseFileDiffs(fullContextPatch(30, 15))
  const segments = foldDiff(file.hunks, new Set())
  assert.deepEqual(
    segments.map((segment) => (segment.kind === "gap" ? `gap ${segment.lines}` : "hunk")),
    ["gap 11", "hunk", "gap 12"],
  )
  const hunk = segments[1].hunk
  assert.equal(hunk.oldStart, 12)
  assert.equal(hunk.newStart, 12)
  assert.equal(hunk.changes[0].oldLineNumber, 12)
  assert.equal(hunk.changes.length, 8)
  assert.equal(hunk.content, "@@ -12,7 +12,7 @@")
})

test("an expanded gap shows its lines in place", () => {
  const [file] = parseFileDiffs(fullContextPatch(30, 15))
  const [top] = foldDiff(file.hunks, new Set())
  const segments = foldDiff(file.hunks, new Set([top.key]))
  assert.equal(segments[0].kind, "hunk")
  assert.equal(segments[0].hunk.oldStart, 1)
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ["hunk", "gap"],
  )
})

test("lines between patch hunks become fixed gaps", () => {
  const [file] = parseFileDiffs(
    [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -5,3 +5,3 @@",
      " a",
      "-b",
      "+c",
      " d",
      "@@ -40,2 +40,3 @@",
      " e",
      "+f",
      " g",
      "",
    ].join("\n"),
  )
  const segments = foldDiff(file.hunks, new Set())
  assert.deepEqual(
    segments.map((segment) => (segment.kind === "gap" ? [segment.lines, segment.key] : "hunk")),
    [[4, null], "hunk", [32, null], "hunk"],
  )
})
