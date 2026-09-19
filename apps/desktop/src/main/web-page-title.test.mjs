import assert from "node:assert/strict"
import { test } from "node:test"
import { titleParser, publicAddress, pageUrl, getWebPageTitle } from "./web-page-title.ts"

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

test("rejects local network and mapped addresses before fetching", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.1.2",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001::1",
    "2002:7f00:1::",
  ])
    assert.equal(publicAddress(address), false, address)
  assert.equal(publicAddress("1.1.1.1"), true)
  assert.equal(publicAddress("2606:4700:4700::1111"), true)
})

test("validates schemes and credentials and normalizes cache URLs", async () => {
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com:8443",
    "invalid",
  ])
    assert.equal(pageUrl(url), null)
  assert.equal(pageUrl("https://example.com/page#section").href, "https://example.com/page")
  assert.equal(await getWebPageTitle("http://127.0.0.1/"), null)
})
