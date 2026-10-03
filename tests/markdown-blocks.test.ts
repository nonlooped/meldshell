import assert from "node:assert/strict"
import test from "node:test"
import { markdownBlocks } from "../packages/ui/src/ui/markdown-model.ts"

const split = (text: string) => {
  const blocks = markdownBlocks(text)
  assert.equal(blocks.join(""), text)
  return blocks
}

test("splits top-level runs at blank lines", () => {
  assert.deepEqual(split("# Title\n\nFirst\nline\n\n\nSecond\n\n---\n\n| a |\n| - |"), [
    "# Title\n\n",
    "First\nline\n\n\n",
    "Second\n\n",
    "---\n\n",
    "| a |\n| - |",
  ])
})

test("finished blocks keep their text as a reply streams", () => {
  const reply = "Intro\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\nDone."
  const final = split(reply)
  for (let length = 1; length <= reply.length; length++) {
    const partial = split(reply.slice(0, length))
    for (const [index, block] of partial.slice(0, -1).entries())
      assert.equal(block, final[index], `chunk ${length}, block ${index}`)
  }
})

test("keeps fenced code and math whole, and stops splitting at raw HTML", () => {
  assert.deepEqual(split("```\na\n\nb\n```\n\nafter"), ["```\na\n\nb\n```\n\n", "after"])
  assert.deepEqual(split("~~~~md\n```\n\nx\n~~~~\n\nafter"), [
    "~~~~md\n```\n\nx\n~~~~\n\n",
    "after",
  ])
  assert.deepEqual(split("$$\nx\n\ny\n$$\n\nafter"), ["$$\nx\n\ny\n$$\n\n", "after"])
  assert.deepEqual(split("$$x$$\n\nafter"), ["$$x$$\n\n", "after"])
  assert.deepEqual(split("Intro\n\n<!--\n\nhidden\n-->\n\nafter"), [
    "Intro\n\n",
    "<!--\n\nhidden\n-->\n\nafter",
  ])
  assert.deepEqual(split("```\nunclosed\n\nstill code"), ["```\nunclosed\n\nstill code"])
  assert.deepEqual(split("<div>\n```\n\n```\na\n\nb\n```"), ["<div>\n```\n\n```\na\n\nb\n```"])
})

test("keeps lists, list fences, and indented continuations together", () => {
  assert.deepEqual(split("1. a\n\n2. b\n\n- c\n\n  more\n\nafter"), [
    "1. a\n\n2. b\n\n- c\n\n  more\n\n",
    "after",
  ])
  assert.deepEqual(split("- item\n\n  ```\n  a\n\n  b\n  ```\n\nafter"), [
    "- item\n\n  ```\n  a\n\n  b\n  ```\n\n",
    "after",
  ])
  assert.deepEqual(split("- ```\n  a\n\n  b\n  ```\n\nafter"), [
    "- ```\n  a\n\n  b\n  ```\n\n",
    "after",
  ])
  // A fence in an item ends with the item; one indented less than the item's content is not in it.
  assert.deepEqual(split("- a\n\n  ```\n\n````md\n```\n\n```\n````\n\nafter"), [
    "- a\n\n  ```\n\n````md\n```\n\n```\n````\n\n",
    "after",
  ])
  assert.deepEqual(split("1. a\n\n  ```\n\nstill code\n\nafter"), [
    "1. a\n\n  ```\n\nstill code\n\nafter",
  ])
  assert.deepEqual(split("Para\n\n    indented code\n\nafter"), [
    "Para\n\n    indented code\n\n",
    "after",
  ])
})

test("keeps messages with reference or footnote definitions whole", () => {
  for (const text of [
    "See [a].\n\n[a]: https://example.com",
    "Note[^1]\n\n[^1]: Detail",
    "[Foo\n  bar]: /url\n\n[Baz][Foo bar]",
    "[a\\]b]: /url\n\n[x][a\\]b]",
  ])
    assert.deepEqual(split(text), [text])
})
