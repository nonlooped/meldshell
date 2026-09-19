import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { Effect } from "effect"
import type { CodexStatus } from "@meldshell/contracts"
import type { AppServerCallbacks } from "./client"
import { runCodexWorker } from "./worker-runtime"

const until = async (predicate: () => boolean): Promise<void> => {
  for (let i = 0; i < 1000; i++) {
    if (predicate()) return
    await setImmediate()
  }
  throw new Error("Timed out waiting for Codex worker")
}
const setup = (beforeProbe?: () => Promise<void>) => {
  const output: Record<string, unknown>[] = []
  const instances: FakeServer[] = []
  let probes = 0
  let availability: CodexStatus["availability"] = "ready"
  let receive!: (event: { data: unknown }) => void
  class FakeServer {
    readonly requests: string[] = []
    stopped = false
    constructor(
      _path: string,
      readonly callbacks: AppServerCallbacks,
    ) {
      instances.push(this)
    }
    async start() {
      this.callbacks.onSpawn?.(123)
    }
    async stop() {
      this.stopped = true
    }
    respond() {
      throw new Error("Unexpected interaction response")
    }
    rejectRequest() {
      throw new Error("Unexpected interaction rejection")
    }
    async request(method: string): Promise<unknown> {
      this.requests.push(method)
      if (method === "model/list")
        return {
          data: [
            {
              id: "model",
              model: "model",
              displayName: "Model",
              description: "Test",
              hidden: false,
              isDefault: true,
              defaultReasoningEffort: "medium",
              supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
            },
          ],
          nextCursor: null,
        }
      if (method === "account/rateLimits/read") return { rateLimits: {} }
      return {}
    }
  }
  const worker = runCodexWorker(
    {
      postMessage: (message) => output.push(message as Record<string, unknown>),
      on: (_event, listener) => {
        receive = listener
      },
    },
    {
      Server: FakeServer,
      probe: Effect.promise(async (): Promise<CodexStatus> => {
        probes++
        await beforeProbe?.()
        return {
          provider: "openai",
          harness: "codex",
          availability,
          detail: "Mock discovery",
          executablePath: "mock-codex",
          version: "0.153.0",
          accountEmail: null,
          checkedAt: new Date().toISOString(),
        }
      }),
    },
  )
  return {
    worker,
    output,
    instances,
    probes: () => probes,
    availability: (value: CodexStatus["availability"]) => {
      availability = value
    },
    send: (data: unknown) => receive({ data }),
    ready: () => output.filter((message) => message.type === "provider-ready").length,
  }
}

test("connected idle Codex performs no periodic discovery; explicit bursts coalesce and reuse the server", async (t) => {
  const mock = setup()
  t.after(() => mock.worker.shutdown())
  await until(() => mock.ready() === 1)
  await setImmediate()
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] })
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(30_001)
    await setImmediate()
  }
  assert.equal(mock.probes(), 1)
  assert.deepEqual(mock.instances[0]!.requests, ["model/list"])
  for (let i = 0; i < 20; i++) mock.send("probe-now")
  await until(() => mock.ready() === 2)
  assert.equal(mock.probes(), 2)
  assert.equal(mock.instances.length, 1)
  assert.deepEqual(mock.instances[0]!.requests, ["model/list", "model/list"])
  t.diagnostic(
    "120s connected idle: 0 extra CLI probes / 0 model/list RPCs (previously 4 full probes)",
  )
})

test("validated auth notifications refresh discovery while malformed notifications do not", async (t) => {
  const mock = setup()
  t.after(() => mock.worker.shutdown())
  await until(() => mock.ready() === 1)
  await setImmediate()
  const server = mock.instances[0]!
  server.callbacks.onNotification({ method: "account/updated", params: {} }, "malformed")
  server.callbacks.onNotification({ method: "account/rateLimits/updated", params: {} }, "validated")
  await setImmediate()
  assert.equal(mock.probes(), 1)
  mock.availability("unauthenticated")
  server.callbacks.onNotification(
    { method: "account/updated", params: { authMode: null, planType: null } },
    "validated",
  )
  await until(() => mock.output.some((message) => message.availability === "unauthenticated"))
  await setImmediate()
  assert.equal(server.requests.length, 1)
  mock.availability("ready")
  server.callbacks.onNotification(
    { method: "account/login/completed", params: { success: true } },
    "validated",
  )
  await until(() => mock.ready() === 2)
  assert.equal(mock.probes(), 3)
  assert.equal(mock.instances.length, 1)
})

test("auth changes during discovery trigger one follow-up check instead of being lost", async (t) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let hold = false
  const mock = setup(async () => {
    if (hold) await gate
  })
  t.after(() => mock.worker.shutdown())
  await until(() => mock.ready() === 1)
  await setImmediate()
  hold = true
  mock.send("probe-now")
  await until(() => mock.probes() === 2)
  for (let i = 0; i < 10; i++)
    mock.instances[0]!.callbacks.onNotification({ method: "account/updated" }, "validated")
  release()
  await until(() => mock.ready() === 3)
  assert.equal(mock.probes(), 3)
  assert.equal(mock.instances.length, 1)
})

test("after app-server exit the next request rediscovers and starts a new server", async (t) => {
  const mock = setup()
  t.after(() => mock.worker.shutdown())
  await until(() => mock.ready() === 1)
  await setImmediate()
  mock.instances[0]!.callbacks.onExit(1)
  mock.send({ type: "get-usage", requestId: "usage" })
  await until(() => mock.ready() === 2)
  assert.equal(mock.probes(), 2)
  assert.equal(mock.instances.length, 2)
  assert.equal(mock.instances[1]!.requests[0], "model/list")
})

test("shutdown cancels tracked discovery and ignores refresh requests afterward", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const mock = setup(() => gate)
  await until(() => mock.probes() === 1)
  mock.send("probe-now")
  await mock.worker.shutdown()
  release()
  mock.send("probe-now")
  await setImmediate()
  assert.equal(mock.probes(), 1)
  assert.equal(mock.instances.length, 0)
  assert.equal(mock.ready(), 0)
})
