import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { browseHostFolders, workspaceFolder } from "./host-folders"

test("remote folder browsing returns host paths and rejects files and relative workspace paths", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meldshell-folders-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, "project"))
  await writeFile(join(root, "file"), "text")
  const result = await browseHostFolders(root)
  assert.equal(result.path, await realpath(root))
  assert.deepEqual(
    result.folders.map((folder) => folder.name),
    ["project"],
  )
  assert.equal(
    await workspaceFolder(result.folders[0]!.path),
    await realpath(join(root, "project")),
  )
  await assert.rejects(workspaceFolder("relative/path"), /absolute/)
  await assert.rejects(workspaceFolder(join(root, "file")), /folder/)
  await assert.rejects(workspaceFolder(join(root, "missing")))
})
