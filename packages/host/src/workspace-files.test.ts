import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { workspaceFileAction } from "./workspace-files"

test("workspace file actions create, rename, and delete entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "meldshell-files-"))
  try {
    await workspaceFileAction(root, { path: "", action: "create-folder", name: "src" })
    await workspaceFileAction(root, { path: "src", action: "create-file", name: "one.ts" })
    assert.equal(await readFile(join(root, "src", "one.ts"), "utf8"), "")
    await workspaceFileAction(root, { path: "src/one.ts", action: "rename", name: "two.ts" })
    assert.deepEqual(await readdir(join(root, "src")), ["two.ts"])
    await workspaceFileAction(root, { path: "src", action: "delete" })
    assert.deepEqual(await readdir(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("workspace file actions reject traversal and symlinked parents", async () => {
  const root = await mkdtemp(join(tmpdir(), "meldshell-files-"))
  const outside = await mkdtemp(join(tmpdir(), "meldshell-outside-"))
  try {
    await symlink(outside, join(root, "outside"))
    await assert.rejects(
      workspaceFileAction(root, { path: "outside", action: "create-file", name: "bad" }),
      /outside the workspace/,
    )
    await assert.rejects(
      workspaceFileAction(root, { path: "..", action: "create-file", name: "bad" }),
      /outside the workspace/,
    )
    await assert.rejects(
      workspaceFileAction(root, { path: "", action: "create-file", name: "../bad" }),
      /without path separators/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
