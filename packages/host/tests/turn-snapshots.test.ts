import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  captureSnapshot,
  deleteThreadSnapshots,
  readTurnSnapshot,
  restoreTurnSnapshot,
  turnSnapshotRef,
  undoSnapshotRestore,
} from "../src/turn-snapshots"

const run = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim()

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "meldshell-snapshots-"))
  run(root, "init", "--quiet")
  run(root, "config", "user.name", "Test")
  run(root, "config", "user.email", "test@example.com")
  await writeFile(join(root, ".gitignore"), "ignored.log\n")
  await writeFile(join(root, "tracked.txt"), "one\n")
  run(root, "add", ".")
  run(root, "commit", "--quiet", "-m", "initial")
  return root
}

const turn = async (root: string, turnId: string, work: () => Promise<void>) => {
  assert.equal(await captureSnapshot(root, turnSnapshotRef("thread", turnId, "before")), true)
  await work()
  assert.equal(await captureSnapshot(root, turnSnapshotRef("thread", turnId, "after")), true)
}

test("a turn's snapshots show every change it made and leave the index alone", async () => {
  const root = await repository()
  try {
    await writeFile(join(root, "staged.txt"), "staged\n")
    run(root, "add", "staged.txt")
    await turn(root, "turn-1", async () => {
      await writeFile(join(root, "tracked.txt"), "two\n")
      await writeFile(join(root, "created.txt"), "new\n")
      await writeFile(join(root, "ignored.log"), "noise\n")
    })
    const snapshot = await readTurnSnapshot(root, "thread", "turn-1")
    assert.equal(snapshot.before, true)
    assert.equal(snapshot.after, true)
    assert.match(snapshot.patch ?? "", /\+two/)
    assert.match(snapshot.patch ?? "", /b\/created\.txt/)
    assert.doesNotMatch(snapshot.patch ?? "", /ignored\.log|staged\.txt/)
    assert.equal(run(root, "diff", "--cached", "--name-only"), "staged.txt")
    // Snapshots stay out of branch history.
    assert.equal(run(root, "log", "--oneline").split("\n").length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("restoring before a turn undoes it and later turns, and the restore can be undone", async () => {
  const root = await repository()
  try {
    await turn(root, "turn-1", async () => {
      await writeFile(join(root, "tracked.txt"), "two\n")
      await mkdir(join(root, "folder"))
      await writeFile(join(root, "folder", "created.txt"), "new\n")
    })
    await turn(root, "turn-2", async () => {
      await rm(join(root, "tracked.txt"))
      await writeFile(join(root, "later.txt"), "later\n")
    })
    await writeFile(join(root, "ignored.log"), "keep\n")

    await restoreTurnSnapshot(root, "thread", "turn-1", "before")
    assert.equal(await readFile(join(root, "tracked.txt"), "utf8"), "one\n")
    assert.equal(existsSync(join(root, "folder")), false)
    assert.equal(existsSync(join(root, "later.txt")), false)
    assert.equal(await readFile(join(root, "ignored.log"), "utf8"), "keep\n")
    assert.equal(run(root, "status", "--porcelain"), "")

    await restoreTurnSnapshot(root, "thread", "turn-1", "after")
    assert.equal(await readFile(join(root, "tracked.txt"), "utf8"), "two\n")
    assert.equal(await readFile(join(root, "folder", "created.txt"), "utf8"), "new\n")
    assert.equal(run(root, "diff", "--cached", "--name-only"), "")

    await undoSnapshotRestore(root, "thread")
    assert.equal(await readFile(join(root, "tracked.txt"), "utf8"), "one\n")
    await assert.rejects(undoSnapshotRestore(root, "thread"), /no restore to undo/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("snapshots skip folders outside Git and are removed with their thread", async () => {
  const plain = await mkdtemp(join(tmpdir(), "meldshell-plain-"))
  const root = await repository()
  try {
    assert.equal(await captureSnapshot(plain, turnSnapshotRef("thread", "turn", "before")), false)
    await turn(root, "turn-1", async () => writeFile(join(root, "tracked.txt"), "two\n"))
    await captureSnapshot(root, turnSnapshotRef("other", "turn-1", "before"))
    await deleteThreadSnapshots(root, "thread")
    const left = run(root, "for-each-ref", "--format=%(refname)", "refs/meldshell/")
    assert.equal(left, turnSnapshotRef("other", "turn-1", "before"))
    const snapshot = await readTurnSnapshot(root, "thread", "turn-1")
    assert.deepEqual(snapshot, { before: false, after: false, patch: null })
  } finally {
    await rm(plain, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("a same-size edit in the instant the index was written still reaches the snapshot", async () => {
  const root = await repository()
  try {
    // Compare only what a coarse filesystem clock would: whole-second times and sizes.
    run(root, "config", "core.checkStat", "minimal")
    run(root, "config", "core.trustctime", "false")
    const instant = new Date(Math.floor(Date.now() / 1000 - 5) * 1000)
    const file = join(root, "tracked.txt")
    await utimes(file, instant, instant)
    run(root, "add", "tracked.txt")
    await utimes(join(root, ".git", "index"), instant, instant)
    await writeFile(file, "two\n")
    await utimes(file, instant, instant)
    const ref = turnSnapshotRef("thread", "turn", "after")
    assert.equal(await captureSnapshot(root, ref), true)
    assert.equal(run(root, "show", `${ref}:tracked.txt`), "two")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
