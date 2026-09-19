import assert from "node:assert/strict"
import { test } from "node:test"
import { diffLineCounts, parseFileDiffs } from "./diff-model.ts"
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

test("incomplete streamed patches retain the raw-text fallback", () => {
  assert.deepEqual(parseFileDiffs("--- src/a.ts\n+++ src/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n"), [])
})
