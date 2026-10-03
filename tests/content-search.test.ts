import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { Schema } from "effect"
import { SearchWorkspaceContentsInput } from "../packages/contracts/src/workspace-inputs"
import { contentPattern, searchWorkspaceContents } from "../packages/host/src/content-search"

let root = ""

before(async () => {
  root = await mkdtemp(join(tmpdir(), "meldshell-content-search-"))
  await mkdir(join(root, "src"))
  await mkdir(join(root, "node_modules"))
  await writeFile(
    join(root, "src/app.ts"),
    "const Total = 1\n  let total = Total + 2\r\nexport { total }\n",
  )
  await writeFile(join(root, "src/notes.md"), `${"x".repeat(300)} needle (here)\n`)
  await writeFile(join(root, "image.bin"), Buffer.from([0x74, 0x6f, 0x74, 0x61, 0x6c, 0, 1, 2]))
  await writeFile(join(root, "node_modules/dep.js"), "total\n")
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})

test("literal search ignores case unless asked, skipping binaries and dependencies", async () => {
  const loose = await searchWorkspaceContents(root, {
    query: "total",
    caseSensitive: false,
    regex: false,
  })
  assert.deepEqual(
    loose.files.map((file) => file.path),
    ["src/app.ts"],
  )
  assert.deepEqual(
    loose.files[0]!.lines.map((line) => [line.line, line.text, line.ranges]),
    [
      [1, "const Total = 1", [[6, 11]]],
      [
        2,
        "let total = Total + 2",
        [
          [4, 9],
          [12, 17],
        ],
      ],
      [3, "export { total }", [[9, 14]]],
    ],
  )
  assert.equal(loose.lineCount, 3)
  assert.equal(loose.truncated, false)

  const exact = await searchWorkspaceContents(root, {
    query: "Total",
    caseSensitive: true,
    regex: false,
  })
  assert.equal(exact.lineCount, 2)
})

test("literal search treats pattern characters as text", async () => {
  const result = await searchWorkspaceContents(root, {
    query: "(here)",
    caseSensitive: false,
    regex: false,
  })
  const line = result.files[0]!.lines[0]!
  assert.equal(result.files[0]!.path, "src/notes.md")
  // A match far into a long line is shown with a little context before it.
  assert.equal(line.clipped, true)
  assert.equal(line.text, `${"x".repeat(4)} needle (here)`)
  assert.deepEqual(line.ranges, [[12, 18]])
})

test("regular expressions match per line and stop at the limit", async () => {
  const result = await searchWorkspaceContents(root, {
    query: "^\\s*(const|let) \\w+",
    caseSensitive: true,
    regex: true,
    limit: 1,
  })
  assert.equal(result.lineCount, 1)
  assert.equal(result.truncated, true)
  assert.deepEqual(result.files[0]!.lines[0]!.ranges, [[0, 11]])
})

test("an invalid expression is reported before searching", () => {
  assert.throws(
    () => contentPattern({ query: "(unclosed", caseSensitive: false, regex: true }),
    /^Error: Invalid regular expression: /,
  )
  assert.doesNotThrow(() =>
    contentPattern({ query: "(unclosed", caseSensitive: false, regex: false }),
  )
})

test("content search input requires a query and bounds its limit", () => {
  const decode = Schema.decodeUnknownSync(SearchWorkspaceContentsInput)
  const input = { workspaceId: "workspace", query: "a", caseSensitive: false, regex: true }
  assert.equal(decode({ ...input, limit: 5000 }).limit, 5000)
  for (const limit of [0, 5001, 1.5]) assert.throws(() => decode({ ...input, limit }))
  assert.throws(() => decode({ ...input, query: "" }))
  assert.throws(() => decode({ ...input, query: "a".repeat(1025) }))
})

test("a newer search in the same workspace replaces the running one", async () => {
  const options = { query: "total", caseSensitive: false, regex: false }
  const first = searchWorkspaceContents(root, options)
  const second = searchWorkspaceContents(root, options)
  await assert.rejects(first, /replaced by a newer one/)
  assert.equal((await second).lineCount, 3)
})
