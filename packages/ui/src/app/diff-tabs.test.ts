import assert from "node:assert/strict"
import { test } from "node:test"
import { useTabStore } from "./tab-store"

test("diff tabs keep file, stage, workspace, and worktree identities separate and reuse repeated opens", () => {
  const store = useTabStore.getState()
  const workspace = { workspaceId: "workspace" }
  store.openThread("conversation")
  store.openFile(workspace, "src/file.ts", 12)
  const sourceId = useTabStore.getState().selectedFileId
  store.openDiff(workspace, "src/file.ts", "unstaged")
  const diffId = useTabStore.getState().selectedFileId
  store.openDiff(workspace, "src\\file.ts", "unstaged")
  assert.equal(useTabStore.getState().selectedFileId, diffId)
  assert.equal(useTabStore.getState().files.length, 2)
  store.openDiff(workspace, "src/file.ts", "staged")
  store.openDiff({ workspaceId: "other" }, "src/file.ts", "unstaged")
  store.openDiff({ workspaceId: "workspace", threadId: "isolated" }, "src/file.ts", "unstaged")
  assert.equal(useTabStore.getState().files.length, 5)
  assert.equal(useTabStore.getState().files.find((file) => file.id === sourceId)?.line, 12)
  store.selectTab(diffId!)
  assert.equal(useTabStore.getState().selectedFileId, diffId)
  store.closeTab(diffId!)
  assert.ok(!useTabStore.getState().files.some((file) => file.id === diffId))
  store.openThread("conversation")
  assert.equal(useTabStore.getState().selectedFileId, null)
  assert.equal(useTabStore.getState().selectedThreadId, "conversation")
})
