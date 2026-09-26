import assert from "node:assert/strict"
import { test } from "node:test"
import { createConnectionManager, type Connection } from "./connection"

function stub(
  generation: number,
  log: [number, string][],
  onRequest: () => void = () => undefined,
): Connection {
  const request = async (method: string) => {
    onRequest()
    log.push([generation, method])
    return 0
  }
  return {
    request: request as Connection["request"],
    notify: () => undefined,
    close: async () => {
      log.push([generation, "close"])
    },
    pickerPath: undefined,
  }
}

test("one startup is shared by concurrent callers and retried after failure", async () => {
  let starts = 0
  const manager = createConnectionManager({
    connect: async () => {
      if (++starts === 1) throw new Error("WSL missing")
      return stub(starts, [])
    },
    disconnected: () => assert.fail("nothing disconnected"),
  })
  await assert.rejects(manager.connection(), /WSL missing/)
  const [first, second] = await Promise.all([manager.connection(), manager.connection()])
  assert.equal(first, second)
  assert.equal(starts, 2)
  assert.equal(manager.current(), first)
})

test("a disconnected request is not replayed; the next caller reconnects", async () => {
  const log: [number, string][] = []
  let starts = 0
  let disconnects = 0
  const manager = createConnectionManager({
    connect: async (disconnected) => {
      const generation = ++starts
      return stub(generation, log, () => {
        if (generation !== 1) return
        disconnected()
        throw new Error("uncertain outcome")
      })
    },
    disconnected: () => {
      disconnects++
    },
  })
  await assert.rejects((await manager.connection()).request("activeTurns"), /uncertain outcome/)
  assert.equal(disconnects, 1)
  assert.equal(manager.current(), undefined)
  assert.equal(await (await manager.connection()).request("activeTurns"), 0)
  assert.deepEqual(log, [[2, "activeTurns"]])
})

test("stopping never waits for a startup in progress and closes what it produces", async () => {
  const log: [number, string][] = []
  const startup = Promise.withResolvers<Connection>()
  const manager = createConnectionManager({
    connect: () => startup.promise,
    disconnected: () => undefined,
  })
  const pending = manager.connection()
  await manager.stop()
  assert.equal(manager.stopped(), true)
  await assert.rejects(manager.connection(), /closing/)
  startup.resolve(stub(1, log))
  await pending
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(log, [[1, "close"]])
})

test("stopping closes the live connection once", async () => {
  const log: [number, string][] = []
  const manager = createConnectionManager({
    connect: async () => stub(1, log),
    disconnected: () => undefined,
  })
  await manager.connection()
  await Promise.all([manager.stop(), manager.stop()])
  assert.deepEqual(log, [[1, "close"]])
})
