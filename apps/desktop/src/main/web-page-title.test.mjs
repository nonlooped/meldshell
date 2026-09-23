import assert from "node:assert/strict"
import { test } from "node:test"
import { titleParser, publicAddress } from "./web-page-title.ts"

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

test("public address policy covers IPv4, IPv6 and embedded IPv4", () => {
  for (const address of [
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
    "::ffff:808:808",
    "64:ff9b::808:808",
  ])
    assert.equal(publicAddress(address), true, address)
  for (const address of [
    "invalid",
    "8.8.8.8/24",
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2001::1",
    "2002:808:808::1",
    "4000::1",
    "::ffff:127.0.0.1",
    "::ffff:a00:1",
    "64:ff9b::7f00:1",
    "64:ff9b::a00:1",
    "64:ff9b:1::808:808",
  ])
    assert.equal(publicAddress(address), false, address)
})
