import assert from "node:assert/strict"
import { test } from "node:test"
import { asRecord, asRecords, asText, errorMessage, nonEmptyText, toError } from "./unknown"

test("record accessors read only plain objects", () => {
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 })
  assert.deepEqual(asRecord(null), {})
  assert.deepEqual(asRecord(["a"]), {})
  assert.deepEqual(asRecords([{ a: 1 }, "b"]), [{ a: 1 }, {}])
  assert.deepEqual(asRecords({ a: 1 }), [])
})

test("text accessors distinguish missing from empty", () => {
  assert.equal(asText(1), "")
  assert.equal(asText("a"), "a")
  assert.equal(nonEmptyText(""), null)
  assert.equal(nonEmptyText("a"), "a")
})

test("rejections keep their message whatever shape they take", () => {
  assert.equal(errorMessage(new Error("failed")), "failed")
  assert.equal(errorMessage({ _tag: "CoreProtocolError", message: "tagged" }), "tagged")
  assert.equal(errorMessage("plain"), "plain")
  assert.equal(errorMessage(42, "Something went wrong."), "Something went wrong.")
  const original = new Error("kept")
  assert.equal(toError(original), original)
  assert.equal(toError({ message: "wrapped" }).message, "wrapped")
})
