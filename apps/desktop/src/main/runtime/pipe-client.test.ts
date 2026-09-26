import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { PassThrough, Writable } from "node:stream"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { test } from "node:test"
import { PipeClient } from "./pipe-client"

function fixture(timeout = 1000) {
  const requests: { type: string; id?: string; method: string; args: unknown[] }[] = []
  const events: unknown[] = []
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new Writable({
      write(chunk, _encoding, done) {
        requests.push(JSON.parse(String(chunk)))
        done()
      },
    }),
    kill: () => true,
  })
  let disconnected = 0
  const client = new PipeClient(
    child as unknown as ChildProcessWithoutNullStreams,
    (channel, args) => events.push([channel, args]),
    () => {
      disconnected++
    },
    timeout,
  )
  const send = (value: unknown) => child.stdout.write(`${JSON.stringify(value)}\n`)
  return { client, child, requests, events, send, disconnected: () => disconnected }
}

test("host readiness is distinct from startup stderr and events", async () => {
  const f = fixture()
  const ready = f.client.waitUntilReady()
  f.child.stderr.write("installing dependencies\n")
  assert.equal(f.requests.length, 0)
  f.send({ type: "event", channel: "host:ready", args: [] })
  await ready
  f.child.emit("close")
})

test("responses correlate out of order and preserve native nested payloads", async () => {
  const f = fixture()
  const first = f.client.request("call", "first", [{ opaque: { foo: [1, "日本語"] } }])
  const second = f.client.request("activeTurns")
  f.send({ type: "result", id: f.requests[1]!.id, ok: true, value: 3 })
  f.send({ type: "event", channel: "meldshell:runtime-changed", args: ["thread", false] })
  f.send({ type: "result", id: f.requests[0]!.id, ok: true, value: f.requests[0]!.args })
  assert.equal(await second, 3)
  assert.deepEqual(await first, ["first", [{ opaque: { foo: [1, "日本語"] } }]])
  assert.deepEqual(f.events, [["meldshell:runtime-changed", ["thread", false]]])
  f.child.emit("close")
})

test("disconnect rejects unconfirmed writes and never resends them", async () => {
  const f = fixture()
  const pending = f.client.request("call", "submit", ["hello"])
  f.child.stderr.write("WSL stopped")
  f.child.emit("close")
  await assert.rejects(pending, /not retried.*\nWSL stopped/)
  await assert.rejects(f.client.request("activeTurns"), /disconnected/)
  assert.equal(f.requests.length, 1)
  assert.equal(f.disconnected(), 1)
})

test("a command error does not disconnect the host; malformed stdout does", async () => {
  const f = fixture()
  const pending = f.client.request("activeTurns")
  f.send({ type: "result", id: f.requests[0]!.id, ok: false, error: "operation refused" })
  await assert.rejects(pending, /operation refused/)
  assert.equal(f.client.connected, true)
  const next = f.client.request("activeTurns")
  f.child.stdout.write("shell startup noise\n")
  await assert.rejects(next, /invalid response/)
  assert.equal(f.disconnected(), 1)
  f.child.emit("close")
})

test("a timeout rejects only its own request and keeps the connection", async () => {
  const f = fixture(15)
  const slow = f.client.request("activeTurns")
  const other = f.client.request("call", "x", [])
  f.send({ type: "result", id: f.requests[1]!.id, ok: true, value: "answered" })
  await assert.rejects(slow, /not respond in time/)
  assert.equal(await other, "answered")
  assert.equal(f.client.connected, true)
  assert.equal(f.disconnected(), 0)
  assert.equal(f.requests.length, 2)
  f.child.emit("close")
})

test("notifications are written without a pending entry and dropped after failure", async () => {
  const f = fixture()
  f.client.notify("terminal.write", "t", "ls\r")
  f.client.notify("terminal.resize", "t", 80, 24)
  assert.deepEqual(f.requests, [
    { type: "notify", method: "terminal.write", args: ["t", "ls\r"] },
    { type: "notify", method: "terminal.resize", args: ["t", 80, 24] },
  ])
  f.child.emit("close")
  f.client.notify("terminal.write", "t", "x")
  assert.equal(f.requests.length, 2)
})

test("interactive Bash job-control noise is kept out of diagnostics", async () => {
  const f = fixture()
  const pending = f.client.request("activeTurns")
  f.child.stderr.write(
    "bash: cannot set terminal process group (150170): Inappropriate ioctl for device\nbash: no job control in this shell\nreal problem\n",
  )
  f.child.emit("close")
  await assert.rejects(pending, (error: Error) => {
    assert.match(error.message, /not retried\.\nreal problem$/)
    return true
  })
})
