import assert from "node:assert/strict"
import { test } from "node:test"
import { Schema } from "effect"
import {
  GitDiffInput,
  GitSnapshotInput,
  SearchWorkspacePathsInput,
  WorkspaceFileActionInput,
} from "../packages/contracts/src/workspace-inputs"

test("workspace search preserves query and result limits", () => {
  const decode = Schema.decodeUnknownSync(SearchWorkspacePathsInput)
  const input = { workspaceId: "workspace", query: "a".repeat(1024) }
  assert.equal(decode({ ...input, limit: 200 }).limit, 200)
  assert.equal(decode({ ...input, limit: 1 }).limit, 1)
  for (const limit of [0, 201, 1.5, NaN, Infinity]) assert.throws(() => decode({ ...input, limit }))
  assert.throws(() => decode({ ...input, query: "a".repeat(1025) }))
  assert.doesNotThrow(() => decode({ ...input, threadId: undefined, limit: undefined }))
})

test("Git history retains its distinct required limit", () => {
  const decode = Schema.decodeUnknownSync(GitSnapshotInput)
  assert.equal(decode({ workspaceId: "workspace", limit: 2000 }).limit, 2000)
  for (const limit of [undefined, 0, 2001, 1.5])
    assert.throws(() => decode({ workspaceId: "workspace", limit }))
})

test("file and diff decoders retain optional wire fields and action restrictions", () => {
  const file = Schema.decodeUnknownSync(WorkspaceFileActionInput)
  const input = { workspaceId: "workspace", path: "file.txt", threadId: undefined }
  for (const action of ["create-file", "create-folder", "rename", "delete"])
    assert.doesNotThrow(() => file({ ...input, action, name: undefined }))
  assert.throws(() => file({ ...input, action: "stage" }))
  const diff = Schema.decodeUnknownSync(GitDiffInput)
  assert.doesNotThrow(() => diff({ ...input, side: undefined, context: undefined }))
  for (const side of ["staged", "unstaged"])
    assert.doesNotThrow(() => diff({ ...input, side, context: "full" }))
  assert.throws(() => diff({ ...input, side: "both" }))
  assert.throws(() => diff({ ...input, context: "partial" }))
})
