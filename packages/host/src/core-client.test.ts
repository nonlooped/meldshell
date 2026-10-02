import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { Effect, Layer, ManagedRuntime, Result } from "effect"
import { TurnSubmissionError } from "@meldshell/contracts"
import { CoreClient } from "./core-client"
import { startCore } from "./core-server"
import { HostPlatform, type HostProcess } from "./platform"

/** The same structured-clone boundary as the desktop and headless core workers. */
const coreWorker = (databasePath: string) => {
  const child = new EventEmitter()
  const parent = new EventEmitter()
  const core = startCore(
    {
      postMessage: (message) =>
        queueMicrotask(() => child.emit("message", structuredClone(message))),
      on: (event, listener) => parent.on(event, listener),
      off: (event, listener) => parent.off(event, listener),
    },
    databasePath,
  )
  void core.ready.catch(() => child.emit("exit", 1))
  const process: HostProcess = {
    pid: 1,
    stdout: null,
    stderr: null,
    postMessage: (message) =>
      queueMicrotask(() => parent.emit("message", { data: structuredClone(message) })),
    kill: () => {
      void core.dispose().then(() => child.emit("exit", 0))
      return true
    },
    on: (event, listener) => child.on(event, listener),
    once: (event, listener) => child.once(event, listener),
    off: (event, listener) => child.off(event, listener),
  }
  return { process, child, parent }
}

test("recreated core clients route RPC replies, preserve typed errors, and release their transport", {
  timeout: 15_000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-core-rpc-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const databasePath = join(directory, "core.sqlite")
  // v4 allocates a new client ID for each client, even after the previous runtime closes.
  for (let attempt = 0; attempt < 2; attempt++) {
    let worker: ReturnType<typeof coreWorker> | undefined
    const runtime = ManagedRuntime.make(
      CoreClient.layer.pipe(
        Layer.provide(
          Layer.succeed(HostPlatform, {
            databasePath,
            fork: () => (worker = coreWorker(databasePath)).process,
            notify: () => undefined,
          }),
        ),
      ),
    )
    try {
      const client = await runtime.runPromise(CoreClient)
      const snapshot = await runtime.runPromise(client.GetSnapshot())
      assert.equal(snapshot.workspaces.length, attempt)
      if (attempt === 0) await runtime.runPromise(client.AddWorkspace({ path: directory }))
      const invalid = await runtime.runPromise(
        client.SubmitTurn({ threadId: "unused", text: " " }).pipe(Effect.result),
      )
      assert.ok(Result.isFailure(invalid))
      assert.ok(invalid.failure instanceof TurnSubmissionError)
      assert.equal(invalid.failure.reason, "empty")
      assert.match(invalid.failure.message, /text or an attachment/)
    } finally {
      await runtime.dispose()
    }
    assert.equal(worker?.child.listenerCount("message"), 0)
    assert.equal(worker?.child.listenerCount("exit"), 0)
    assert.equal(worker?.parent.listenerCount("message"), 0)
  }
})
