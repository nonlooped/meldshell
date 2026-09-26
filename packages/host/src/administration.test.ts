import assert from "node:assert/strict"
import { test } from "node:test"
import { IPC } from "@meldshell/contracts/ipc"
import { administrationBridge } from "./administration"

test("administration answers correlate over the private pipe and shutdown rejects pending requests", async () => {
  const received: unknown[][] = []
  const bridge = administrationBridge((channel, args) => {
    assert.equal(channel, "host:administration")
    received.push([...args])
  })
  const first = bridge.call(IPC.getUpdateStatus, [])
  const second = bridge.call(IPC.checkForUpdates, [])
  await bridge.result(String(received[1]![0]), false, "update failed")
  await assert.rejects(second, /update failed/)
  await bridge.result(String(received[0]![0]), true, { state: "ready" })
  assert.deepEqual(await first, { state: "ready" })
  const last = bridge.call(IPC.installUpdate, [])
  bridge.close()
  await assert.rejects(last, /closed/)
  assert.equal(bridge.handles("arbitrary:channel"), false)
})
