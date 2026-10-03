import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, test } from "node:test"
import { createDictation } from "../packages/host/src/dictation"
import type {
  DictationWorkerMessage,
  DictationWorkerRequest,
} from "../packages/host/src/dictation-worker"
import type { HostProcess } from "../packages/host/src/platform"
import {
  encodePcm,
  insertDictation,
  pieceBounds,
} from "../packages/ui/src/threads/dictation-recorder"

let cacheDir = ""

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "meldshell-dictation-"))
})

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true })
})

/** A stand-in worker that answers each request the way `respond` says. */
function fakeWorker(
  respond: (
    request: DictationWorkerRequest,
    post: (message: DictationWorkerMessage) => void,
  ) => void,
) {
  const forks: { entry: string; env?: Record<string, string>; killed: boolean }[] = []
  const fork = (entry: string, _label: string, env?: Record<string, string>): HostProcess => {
    const events = new EventEmitter()
    const record = { entry, ...(env ? { env } : {}), killed: false }
    forks.push(record)
    return {
      pid: 1,
      stdout: null,
      stderr: null,
      postMessage: (message) =>
        setImmediate(() =>
          respond(message as DictationWorkerRequest, (reply) => events.emit("message", reply)),
        ),
      kill: () => {
        record.killed = true
        events.emit("exit", 0)
        return true
      },
      on: (event, listener) => events.on(event, listener),
      once: (event, listener) => events.once(event, listener),
      off: (event, listener) => events.off(event, listener),
    }
  }
  return { fork, forks }
}

test("dictation runs a local model and remembers it once it has loaded", async () => {
  const requests: DictationWorkerRequest[] = []
  const worker = fakeWorker((request, post) => {
    requests.push(request)
    post({ type: "progress", model: request.model, progress: 0.5 })
    post(
      request.type === "transcribe"
        ? { type: "result", id: request.id, text: "add a microphone button" }
        : { type: "ready", id: request.id },
    )
  })
  const dictation = createDictation(worker.fork, cacheDir, 60_000)
  assert.deepEqual(await dictation.status("fast"), {
    model: "fast",
    state: "missing",
    progress: null,
    error: null,
    downloaded: [],
  })

  const result = await dictation.transcribe("fast", { pcm: "AAAA", language: "en" })
  assert.deepEqual(result, { text: "add a microphone button" })
  assert.equal(worker.forks.length, 1)
  assert.equal(worker.forks[0]?.entry, "dictation-worker.js")
  assert.deepEqual(worker.forks[0]?.env, { MELDSHELL_DICTATION_CACHE: cacheDir })
  assert.deepEqual(requests[0], {
    type: "transcribe",
    id: 1,
    model: "Xenova/whisper-base",
    pcm: "AAAA",
    language: "en",
  })
  await stat(join(cacheDir, "Xenova", "whisper-base", ".meldshell-ready"))
  assert.deepEqual(await dictation.status("fast"), {
    model: "fast",
    state: "ready",
    progress: null,
    error: null,
    downloaded: ["fast"],
  })
  dictation.shutdown()
  assert.equal(worker.forks[0]?.killed, true)
})

test("a failed download explains itself and is not taken as installed", async () => {
  const worker = fakeWorker((request, post) =>
    post({ type: "error", id: request.id, message: "fetch failed" }),
  )
  const dictation = createDictation(worker.fork, cacheDir, 60_000)
  await assert.rejects(
    dictation.transcribe("accurate", { pcm: "AAAA" }),
    /Could not download the speech model/,
  )
  const status = await dictation.status("accurate")
  assert.equal(status.state, "error")
  assert.deepEqual(status.downloaded, [])
  dictation.shutdown()
})

test("the worker leaves when dictation goes quiet, and a crash fails what was waiting", async () => {
  const worker = fakeWorker((request, post) => post({ type: "ready", id: request.id }))
  const dictation = createDictation(worker.fork, cacheDir, 20)
  await dictation.prepare("fast")
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(worker.forks[0]?.killed, true)

  const silent = fakeWorker(() => undefined)
  const crashing = createDictation(silent.fork, cacheDir, 60_000)
  const waiting = crashing.transcribe("fast", { pcm: "AAAA" })
  await new Promise((resolve) => setTimeout(resolve, 10))
  crashing.shutdown()
  await assert.rejects(waiting, /stopped unexpectedly/)
})

test("long recordings split at their quietest moment near fifty seconds", () => {
  const rate = 100
  const samples = new Float32Array(rate * 120).fill(0.5)
  // A pause at 47 seconds, inside the search window before the 50 second limit.
  samples.fill(0, rate * 47, rate * 47 + 10)
  const bounds = pieceBounds(samples, rate)
  assert.equal(bounds.length, 3)
  assert.equal(bounds[0], rate * 47 + 5)
  assert.ok(bounds[1]! - bounds[0]! <= rate * 50)
  assert.equal(bounds[2], samples.length)
  assert.deepEqual(pieceBounds(new Float32Array(rate * 10), rate), [rate * 10])
})

test("speech is sent as little-endian 16-bit PCM", () => {
  const bytes = Buffer.from(encodePcm(new Float32Array([0, 1, -1, 0.5, 2])), "base64")
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2)
  assert.deepEqual([...samples], [0, 32767, -32768, 16383, 32767])
})

test("dictated text is spaced from the words around the caret", () => {
  assert.deepEqual(insertDictation("", 0, 0, "Hello"), {
    draft: "Hello",
    insert: "Hello",
    caret: 5,
  })
  assert.deepEqual(insertDictation("Fix the", 7, 7, "tests"), {
    draft: "Fix the tests",
    insert: " tests",
    caret: 13,
  })
  assert.equal(insertDictation("Fix  bug", 4, 4, "the").draft, "Fix the bug")
  assert.equal(insertDictation("Fix bug.", 3, 3, "the").draft, "Fix the bug.")
  assert.equal(insertDictation("Run it.", 6, 6, "again").draft, "Run it again.")
  assert.equal(insertDictation("Replace this", 8, 12, "that").draft, "Replace that")
})
