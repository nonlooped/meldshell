import assert from "node:assert/strict"
import { test } from "node:test"
import { MAX_FRAME_BYTES } from "@meldshell/contracts"
import { frameText } from "./remote-connection"

test("oversized results return a bounded error correlated to the original request", () => {
  const text = frameText({
    type: "result",
    id: "command",
    clientId: "client",
    ok: true,
    value: "x".repeat(MAX_FRAME_BYTES),
  } as never)
  const result = JSON.parse(text)
  assert.equal(result.id, "command")
  assert.equal(result.clientId, "client")
  assert.equal(result.ok, false)
  assert.ok(text.length < 1024)
})
