import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { RuntimeEventInput, TurnDispatch } from "@meldshell/contracts"
import { Effect, Fiber, Layer } from "effect"
import { CoreClient } from "../src/core-client"
import { HostEvents, type HostEvent } from "../src/events"
import { HostPlatform, type HostProcess } from "../src/platform"
import { CodexProvider, codexProviderLive } from "../src/worker-provider"

/** A worker that acknowledges every command and records what it was sent. */
class FakeWorker extends EventEmitter {
  readonly pid = undefined
  readonly stdout = null
  readonly stderr = null
  constructor(private readonly log: string[]) {
    super()
  }
  postMessage(message: unknown): void {
    const command = message as { type?: string; commandId?: string; dispatch?: TurnDispatch }
    if (command.type === "start-turn") this.log.push(`delivered ${command.dispatch!.turnId}`)
    if (command.commandId !== undefined)
      setImmediate(() =>
        this.emit("message", { type: "command-ack", commandId: command.commandId }),
      )
  }
  kill(): boolean {
    setImmediate(() => this.emit("exit", 0))
    return true
  }
}

const until = async (condition: () => boolean, what: string) => {
  const deadline = Date.now() + 5_000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test("a finished turn's snapshot holds back only its own thread's announcements and next turn", async () => {
  // A folder outside Git makes each snapshot itself a no-op; the core's location lookup for
  // thread A stands in for a slow capture, since it runs while the thread's capture lock is held.
  const folder = await mkdtemp(join(tmpdir(), "meldshell-provider-"))
  const log: string[] = []
  let releaseCapture!: () => void
  const capture = new Promise<void>((resolve) => {
    releaseCapture = resolve
  })
  const dispatch = (threadId: string, turnId: string) =>
    ({
      harness: "codex",
      threadId,
      turnId,
      nativeThreadId: null,
      workspacePath: folder,
      text: "",
      attachments: [],
    }) as unknown as TurnDispatch
  const workers: FakeWorker[] = []

  const core = {
    RecordRuntimeEvent: (input: RuntimeEventInput) =>
      Effect.sync(() => {
        log.push(`recorded ${input.threadId} ${input.method}`)
        return {
          changed: true,
          snapshotChanged: true,
          nextDispatch:
            input.threadId === "a" && input.method === "turn/completed"
              ? dispatch("a", "a-2")
              : null,
        }
      }),
    GetThreadLocation: ({ threadId }: { threadId: string }) =>
      Effect.promise(() => (threadId === "a" ? capture : Promise.resolve())).pipe(
        Effect.tap(() => Effect.sync(() => log.push(`captured ${threadId}`))),
        Effect.as({
          threadId,
          workspaceId: "workspace",
          workspacePath: folder,
          worktree: null,
          issue: null,
          busy: false,
        }),
      ),
    GetSnapshot: () => Effect.succeed({ threads: [], approvals: [] }),
    BindTurnWorker: () => Effect.void,
    ReconcileWorker: () => Effect.void,
  }
  const events = {
    publish: (event: HostEvent) =>
      Effect.sync(() => {
        if (event._tag === "RuntimeChanged") log.push(`announced ${event.threadId}`)
      }),
  }
  const platform = {
    databasePath: "",
    fork: () => {
      const worker = new FakeWorker(log)
      workers.push(worker)
      return worker as unknown as HostProcess
    },
    notify: () => undefined,
  }
  const services = Layer.mergeAll(
    Layer.succeed(CoreClient, core as never),
    Layer.succeed(HostEvents, events as never),
    Layer.succeed(HostPlatform, platform as never),
  )
  const event = (threadId: string, turnId: string, method: string) => ({
    type: "runtime-event",
    input: { threadId, turnId, method, params: {} },
  })

  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const provider = yield* CodexProvider
          yield* Effect.promise(() => until(() => workers.length > 0, "the worker"))
          const worker = workers[0]!
          worker.emit("message", event("a", "a-1", "turn/completed"))
          worker.emit("message", event("b", "b-1", "item/completed"))
          // Thread B's event is stored and announced while thread A's capture is still running.
          yield* Effect.promise(() => until(() => log.includes("announced b"), "thread B"))
          // Thread B's turns are delivered meanwhile; thread A's are not.
          yield* provider.send({ type: "start-turn", dispatch: dispatch("b", "b-2") })
          assert.ok(log.includes("delivered b-2"))
          assert.ok(!log.includes("announced a"))
          assert.ok(!log.includes("delivered a-2"))
          // A turn submitted to thread A meanwhile waits for the finished turn's files.
          const submitted = yield* Effect.forkChild(
            provider.send({ type: "start-turn", dispatch: dispatch("a", "a-3") }),
          )
          yield* Effect.sleep("50 millis")
          assert.ok(!log.includes("delivered a-3"))

          releaseCapture()
          yield* Fiber.join(submitted)
          yield* Effect.promise(() => until(() => log.includes("delivered a-2"), "thread A"))
          const order = (entry: string) => log.indexOf(entry)
          assert.ok(order("recorded a turn/completed") < order("captured a"))
          assert.ok(order("captured a") < order("announced a"))
          assert.ok(order("announced a") < order("delivered a-2"))
          assert.ok(order("captured a") < order("delivered a-3"))
        }).pipe(Effect.provide(codexProviderLive), Effect.provide(services)),
      ),
    )
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
