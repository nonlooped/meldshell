import assert from "node:assert/strict"
import test from "node:test"
import type { CanonicalEvent } from "@meldshell/contracts"
import {
  compareCells,
  isJsonPath,
  jsonCount,
  parseDelimited,
  tableSeparator,
} from "../packages/ui/src/files/preview-model.ts"
import { screenshotTitle, turnImages } from "../packages/ui/src/threads/tool-details.ts"

test("picks a separator from the file extension", () => {
  assert.equal(tableSeparator("data/report.CSV"), ",")
  assert.equal(tableSeparator("export.tsv"), "\t")
  assert.equal(tableSeparator("notes.csv.md"), null)
  assert.equal(isJsonPath("package.json"), true)
  assert.equal(isJsonPath("tsconfig.jsonc"), false)
})

test("parses quoted cells, doubled quotes, and line breaks inside quotes", () => {
  const text = '﻿name,quote\r\n"Smith, Jo","She said ""hi""\nthen left"\r\nAda,\n'
  assert.deepEqual(parseDelimited(text, ","), [
    ["name", "quote"],
    ["Smith, Jo", 'She said "hi"\nthen left'],
    ["Ada", ""],
  ])
})

test("keeps a last row without a line break and splits tabs", () => {
  assert.deepEqual(parseDelimited("a\tb\n1\t2", "\t"), [
    ["a", "b"],
    ["1", "2"],
  ])
  assert.deepEqual(parseDelimited("", ","), [])
})

test("sorts numbers by value, text naturally, and empty cells last", () => {
  const cells = ["10", "", "9", "1,200", "beta", "alpha 10", "alpha 2"]
  assert.deepEqual(cells.toSorted(compareCells), [
    "9",
    "10",
    "1,200",
    "alpha 2",
    "alpha 10",
    "beta",
    "",
  ])
})

test("counts JSON containers", () => {
  assert.equal(jsonCount({ a: 1 }), "1 key")
  assert.equal(jsonCount([1, 2, 3]), "3 items")
})

const tool = (id: string, item: Record<string, unknown>): CanonicalEvent =>
  ({
    id,
    kind: "tool",
    method: "item/completed",
    text: "Tool",
    payload: { item },
    createdAt: "2026-10-03T00:00:00.000Z",
  }) as unknown as CanonicalEvent

test("collects a turn's screenshots with the page title as their caption", () => {
  const screenshot = (title: string, data: string) => ({
    type: "mcpToolCall",
    status: "completed",
    result: {
      content: [
        { type: "image", data, mimeType: "image/jpeg" },
        { type: "text", text: `Page: ${title}\nURL: http://localhost:3000/\nScreenshot 1280x720` },
      ],
    },
  })
  const images = turnImages([
    tool("1", screenshot("Checkout", "AAAA")),
    tool("2", { type: "mcpToolCall", status: "failed", result: { content: [] } }),
    tool("3", screenshot("(untitled)", "BBBB")),
    tool("4", screenshot("Checkout", "AAAA")),
  ])
  assert.deepEqual(images, [
    { src: "data:image/jpeg;base64,AAAA", alt: "Checkout" },
    { src: "data:image/jpeg;base64,BBBB", alt: "Screenshot 2" },
  ])
  assert.equal(screenshotTitle(JSON.stringify('Page: Say "hi" — Home\nURL: x')), 'Say "hi" — Home')
  assert.equal(screenshotTitle("Page: Plain title\nURL: x"), "Plain title")
})
