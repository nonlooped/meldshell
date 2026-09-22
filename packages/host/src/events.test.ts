import assert from "node:assert/strict"
import { test } from "node:test"
import { IPC } from "@meldshell/contracts"
import { eventFrames } from "./events"

test("streamed deltas collapse into one change per thread", () => {
  const frames = eventFrames([
    { _tag: "RuntimeChanged", threadId: "a", snapshotChanged: false },
    { _tag: "RuntimeChanged", threadId: "a", snapshotChanged: false },
    { _tag: "RuntimeChanged", threadId: "b", snapshotChanged: false },
    { _tag: "RuntimeChanged", threadId: "b" },
    { _tag: "AttentionRequested", threadId: "a" },
  ])
  assert.deepEqual(frames, [
    { type: "event", channel: IPC.attentionRequested, args: ["a"] },
    { type: "event", channel: IPC.runtimeChanged, args: ["a", false] },
    { type: "event", channel: IPC.runtimeChanged, args: ["b", true] },
  ])
})
