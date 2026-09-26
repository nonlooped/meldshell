import assert from "node:assert/strict"
import { test } from "node:test"
import { IPC, unknownUpdateStatus } from "@meldshell/contracts"
import { eventFrames } from "./events"

test("streamed deltas collapse into one change per thread", () => {
  const frames = eventFrames([
    { _tag: "RuntimeChanged", threadId: "a", snapshotChanged: false },
    { _tag: "RuntimeChanged", threadId: "a", snapshotChanged: false },
    { _tag: "RuntimeChanged", threadId: "b", snapshotChanged: false },
    { _tag: "RuntimeChanged", threadId: "b" },
    { _tag: "ProviderUpdateChanged", status: unknownUpdateStatus("codex") },
  ])
  assert.deepEqual(frames, [
    { type: "event", channel: IPC.providerUpdateChanged, args: [unknownUpdateStatus("codex")] },
    { type: "event", channel: IPC.runtimeChanged, args: ["a", false] },
    { type: "event", channel: IPC.runtimeChanged, args: ["b", true] },
  ])
})
