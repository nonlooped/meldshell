import assert from "node:assert/strict"
import { test } from "node:test"
import { IPC } from "@meldshell/contracts/ipc"
import { browserTerminals } from "./terminals"

test("the browser reconnects at its last output offset and closes shells dismissed while offline", async () => {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const calls: { method: string; input: Record<string, unknown> }[] = []
  let active: string[] = []
  const emit = (channel: string, args: readonly unknown[]) => {
    for (const listener of listeners.get(channel) ?? []) listener(...args)
  }
  const terminals = browserTerminals(
    async (method, args) => {
      calls.push({ method, input: args[0] as Record<string, unknown> })
      if (method === "meldshell:terminal-attach") return active
      if (method === IPC.terminalOpen) return { cwd: "/host", shell: "bash" }
      return null
    },
    (channel, listener) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener])
      return () => undefined
    },
    emit,
  )
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  terminals.connected()
  await settle()
  await terminals.api.open({ id: "terminal", workspaceId: "w", threadId: "t", cols: 80, rows: 24 })
  active = ["terminal"]
  emit(IPC.terminalData, ["terminal", "output", 6])
  terminals.disconnected()
  terminals.connected()
  await settle()
  assert.deepEqual(calls.at(-1)?.input.offsets, { terminal: 6 })
  assert.equal(calls.filter((call) => call.method === IPC.terminalOpen).length, 1)
  terminals.disconnected()
  terminals.api.close("terminal")
  calls.length = 0
  terminals.connected()
  await settle()
  assert.equal(calls[1]?.method, IPC.terminalClose)
  assert.equal(calls[1]?.input.id, "terminal")
})
