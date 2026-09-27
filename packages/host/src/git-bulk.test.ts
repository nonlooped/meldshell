import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { test } from "node:test"
import { gitBulkAction } from "./git"

const run = promisify(execFile)

test("bulk Git actions stage and unstage workspace changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "meldshell-git-"))
  const git = (...args: string[]) => run("git", args, { cwd: root })
  try {
    await git("init")
    await git("config", "user.name", "Test")
    await git("config", "user.email", "test@example.com")
    await writeFile(join(root, "old.txt"), "old")
    await git("add", "old.txt")
    await git("commit", "-m", "Initial")
    await writeFile(join(root, "old.txt"), "changed")
    await writeFile(join(root, "new.txt"), "new")
    await gitBulkAction(root, "stage")
    const staged = (await git("status", "--porcelain")).stdout
    assert.match(staged, /A {2}new\.txt/)
    assert.match(staged, /M {2}old\.txt/)
    await gitBulkAction(root, "unstage")
    const unstaged = (await git("status", "--porcelain")).stdout
    assert.match(unstaged, /\?\? new\.txt/)
    assert.match(unstaged, / M old\.txt/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
