import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test } from "node:test"
import { Effect, Exit } from "effect"
import type { HostProcess } from "./platform"
import { deliverCommand, requestUsage } from "./worker-channel"

/** A worker that answers each posted message with `reply`. */
const worker = (reply: (message: Record<string, unknown>, events: EventEmitter) => unknown) => {
  const events = new EventEmitter()
  const child = {
    pid: 1,
    stdout: null,
    stderr: null,
    postMessage: (message: unknown) => {
      const answer = reply(message as Record<string, unknown>, events)
      if (answer !== undefined) queueMicrotask(() => events.emit("message", answer))
    },
    kill: () => true,
    on: (event: string, listener: (...args: unknown[]) => void) => events.on(event, listener),
    once: (event: string, listener: (...args: unknown[]) => void) => events.once(event, listener),
    off: (event: string, listener: (...args: unknown[]) => void) => events.off(event, listener),
  } as unknown as HostProcess
  return { child }
}

test("a command settles with the worker's acknowledgment", async () => {
  const accepting = worker((message) => ({ type: "command-ack", commandId: message.commandId }))
  await Effect.runPromise(deliverCommand(accepting.child, { type: "shutdown" }, "Test"))
  const refusing = worker((message) => ({
    type: "command-ack",
    commandId: message.commandId,
    error: "Busy.",
  }))
  const exit = await Effect.runPromiseExit(
    deliverCommand(refusing.child, { type: "shutdown" }, "Test"),
  )
  assert.ok(Exit.isFailure(exit))
  assert.match(String(exit.cause), /Busy\./)
})

test("a malformed usage reply fails the request at once", async () => {
  const { child } = worker((message) => ({
    type: "usage-result",
    requestId: message.requestId,
    usage: { limits: "not a list" },
  }))
  const started = Date.now()
  const exit = await Effect.runPromiseExit(requestUsage(child, "Test"))
  assert.ok(Exit.isFailure(exit))
  assert.match(String(exit.cause), /invalid usage response/)
  assert.ok(Date.now() - started < 1_000)
})

test("a worker that exits fails its pending request", async () => {
  const { child } = worker((_message, events) => {
    queueMicrotask(() => events.emit("exit", 1))
  })
  const exit = await Effect.runPromiseExit(requestUsage(child, "Test"))
  assert.ok(Exit.isFailure(exit))
  assert.match(String(exit.cause), /disconnected/)
})
