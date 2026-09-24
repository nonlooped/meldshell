import assert from "node:assert/strict"
import { test } from "node:test"
import { buildIndex, searchIndex } from "./workspace-search"

const index = buildIndex([
  "README.md",
  "src/main.ts",
  "src/ui/Composer.tsx",
  "src/ui/composer-completion.ts",
  ".github/workflows/ci.yml",
])

test("an empty query or trailing slash browses one directory level", () => {
  assert.deepEqual(
    searchIndex(index, "", 10).map((match) => match.path),
    ["src/", ".github/", "README.md"],
  )
  assert.deepEqual(
    searchIndex(index, "src/", 10).map((match) => match.path),
    ["src/ui/", "src/main.ts"],
  )
})

test("basename matches outrank path and fuzzy matches", () => {
  assert.deepEqual(
    searchIndex(index, "composer", 10).map((match) => match.path),
    ["src/ui/Composer.tsx", "src/ui/composer-completion.ts"],
  )
  assert.equal(searchIndex(index, "ui", 1)[0]?.path, "src/ui/")
  assert.equal(searchIndex(index, "srcmain", 1)[0]?.path, "src/main.ts")
})
