import assert from "node:assert/strict"
import { test } from "node:test"
import { LineFramer } from "../packages/provider-runtime/src/line-framer"
import { JsonLines } from "../packages/host/src/json-lines"
import { PiRpc } from "../packages/provider-pi/src/rpc"

const LIMIT_MESSAGE = "Record too large."

test("frames LF and CRLF records across every byte boundary without splitting Unicode separators", () => {
  const input = Buffer.from('first\r\n\n{"text":"é😀\u2028\u2029"}\nlast\rinside\n')
  const expected = ["first", "", '{"text":"é😀\u2028\u2029"}', "last\rinside"]
  for (let split = 0; split <= input.length; split++) {
    const lines: string[] = []
    const framer = new LineFramer((line) => lines.push(line), 100, LIMIT_MESSAGE)
    framer.push(input.subarray(0, split))
    framer.push(input.subarray(split))
    assert.deepEqual(lines, expected, `split at byte ${split}`)
  }
})

test("retains a partial line across many chunks until LF arrives", () => {
  const lines: string[] = []
  const framer = new LineFramer((line) => lines.push(line), 100, LIMIT_MESSAGE)
  for (const byte of Buffer.from("é😀")) framer.push(Buffer.from([byte]))
  assert.deepEqual(lines, [])
  framer.push(Buffer.from("\n"))
  assert.deepEqual(lines, ["é😀"])
})

test("bounds each record in bytes, including complete records and buffered fragments", () => {
  for (const chunks of [
    ["12345\n"],
    ["12", "345\n"],
    ["12345"],
    ["12", "345"],
    ["ééx\n"],
    ["é", "éx\n"],
  ]) {
    const framer = new LineFramer(() => assert.fail("oversized record emitted"), 4, LIMIT_MESSAGE)
    assert.throws(
      () => {
        for (const chunk of chunks) framer.push(Buffer.from(chunk))
      },
      { message: LIMIT_MESSAGE },
    )
  }
})

test("accepts the exact limit and resets the byte count between records", () => {
  const lines: string[] = []
  const framer = new LineFramer((line) => lines.push(line), 4, LIMIT_MESSAGE)
  framer.push(Buffer.from("é"))
  framer.push(Buffer.from("é\n1234\nabc\r\n"))
  assert.deepEqual(lines, ["éé", "1234", "abc"])
})

test("host ignores blank lines but rejects malformed JSON with its own size diagnostic", () => {
  const records: unknown[] = []
  const host = new JsonLines((record) => records.push(record), 20)
  host.push(Buffer.from('\n \r\n{"ok":true}\r\n'))
  assert.deepEqual(records, [{ ok: true }])
  assert.throws(() => host.push(Buffer.from("diagnostic\n")), SyntaxError)
  assert.throws(() => host.push(Buffer.from("x".repeat(21))), {
    message: "Host message exceeded the size limit.",
  })
})

test("Pi ignores non-JSON stdout and still delivers native records and command responses", async (t) => {
  const records: unknown[] = []
  // A local protocol fixture, not an installed Pi or a model request.
  const script = `
    process.stdout.write('diagnostic\\n{invalid}\\n\\n');
    process.stdout.write(JSON.stringify({ type: 'message_start', text: 'é😀\\u2028\\u2029' }) + '\\r\\n');
    process.stdin.once('data', (chunk) => {
      const request = JSON.parse(chunk.toString());
      process.stdout.write(JSON.stringify({ type: 'response', id: request.id, success: true, data: { ready: true } }) + '\\n');
    });
    process.stdin.resume();
  `
  const rpc = new PiRpc(
    {
      command: process.execPath,
      args: ["-e", script, "--"],
      executablePath: process.execPath,
      version: "fixture",
    },
    process.cwd(),
    [],
    { record: (record) => records.push(record) },
  )
  t.after(() => rpc.close())
  assert.deepEqual(await rpc.request("get_state", {}, 5_000), { ready: true })
  assert.deepEqual(records, [{ type: "message_start", text: "é😀\u2028\u2029" }])
})
