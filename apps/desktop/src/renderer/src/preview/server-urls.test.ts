import assert from "node:assert/strict"
import { test } from "node:test"
import { detectServerUrls, previewAddress } from "./server-urls"

test("finds local addresses printed by development servers", () => {
  const output =
    "\x1b[32m  ➜  Local:\x1b[39m   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\r\n" +
    "ready - started server on 0.0.0.0:3000, url: http://0.0.0.0:3000.\r\n" +
    "Docs at https://vitejs.dev and (http://127.0.0.1:8080/app)\r\n"
  assert.deepEqual(detectServerUrls(output), [
    "http://localhost:5173/",
    "http://localhost:3000",
    "http://127.0.0.1:8080/app",
  ])
})

test("repeated addresses are reported once", () => {
  assert.deepEqual(detectServerUrls("http://localhost:4000 http://localhost:4000"), [
    "http://localhost:4000",
  ])
})

test("typed locations become web addresses", () => {
  assert.equal(previewAddress("localhost:3000"), "http://localhost:3000/")
  assert.equal(previewAddress(" https://example.com/a "), "https://example.com/a")
  assert.equal(previewAddress("file:///etc/passwd"), null)
  assert.equal(previewAddress("javascript:alert(1)"), null)
  assert.equal(previewAddress(""), null)
})
