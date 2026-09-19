import assert from "node:assert/strict"
import { test } from "node:test"
import { titleParser } from "./web-page-title.ts"

function title(chunks) {
  let result = null
  const parser = titleParser((value) => {
    result = value
  })
  for (const chunk of chunks) parser.write(chunk)
  parser.end()
  return result
}

test("uses the real HTML title rather than descriptive metadata or script text", () => {
  assert.equal(
    title([
      '<script>const x = "<title>Wrong</title>"</script><meta property="og:title" content="Official documentation"><title>Models | ChatGPT Learn</title>',
    ]),
    "Models | ChatGPT Learn",
  )
})

test("decodes entities and handles titles split across response chunks", () => {
  assert.equal(
    title(["<TITLE> Models &am", "p; Tools\n | Chat", "GPT Learn </TITLE>"]),
    "Models & Tools | ChatGPT Learn",
  )
  assert.equal(title(["<title>A &#x2014; B &quot;C&quot;</title>"]), 'A — B "C"')
  assert.equal(title(["<html><body>No title</body></html>"]), null)
})

test("bounds title length and keeps the first title", () => {
  assert.equal(title(["<title>" + "x".repeat(5000) + "</title><title>Wrong</title>"]).length, 1024)
})
