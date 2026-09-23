import assert from "node:assert/strict"
import { test } from "node:test"
import { snapshotRpc } from "../../../apps/site/src/remote/rpc"
import { executeRemoteRpc } from "./remote-rpc"

// Exercise the real Effect client/server codecs through the same relay envelope.
test("snapshot RPC refuses mutation tags before executing host work", async () => {
  let calls = 0
  const result = await executeRemoteRpc(
    {
      v: 1,
      id: "rpc_0000000000000001",
      method: "meldshell:rpc-snapshot",
      args: [{ _tag: "Request", id: "1", tag: "SubmitTurn", payload: {}, headers: [] }],
    },
    async () => {
      calls++
      throw new Error("must not run")
    },
  )
  assert.equal(result.ok, false)
  assert.equal(calls, 0)
})

test("snapshot RPC decodes successful snapshots", async () => {
  const snapshot = {
    workspaces: [],
    threads: [],
    providers: [],
    models: [],
    threadSettings: [],
    approvals: [],
    settings: { titleModelId: "current" },
  }
  const rpc = snapshotRpc((text) => {
    void executeRemoteRpc(JSON.parse(text), async (raw) => ({
      type: "result",
      id: (raw as { id: string }).id,
      ok: true,
      value: snapshot,
    })).then(rpc.receive)
    return true
  })
  try {
    assert.deepEqual(await rpc.getSnapshot(), snapshot)
  } finally {
    await rpc.dispose()
  }
})
