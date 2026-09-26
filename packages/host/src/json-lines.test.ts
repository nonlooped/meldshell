import assert from "node:assert/strict"
import { test } from "node:test"
import { JsonLines } from "./json-lines"

test("pipe frames survive arbitrary chunk boundaries, including UTF-8", () => {
  const values: unknown[] = []
  const parser = new JsonLines((value) => values.push(value))
  const input = Buffer.from('\n{"text":"日本語🙂"}\n{"next":true}\n')
  for (const byte of input) parser.push(Buffer.from([byte]))
  assert.deepEqual(values, [{ text: "日本語🙂" }, { next: true }])
})

test("malformed and oversized frames fail instead of accumulating unbounded data", () => {
  assert.throws(() => new JsonLines(() => undefined).push(Buffer.from("a log line\n")))
  assert.throws(
    () => new JsonLines(() => undefined, 8).push(Buffer.from('"01234567"\n')),
    /size limit/,
  )
  const parser = new JsonLines(() => undefined, 8)
  parser.push(Buffer.from("1234"))
  assert.throws(() => parser.push(Buffer.from("56789")), /size limit/)
})
