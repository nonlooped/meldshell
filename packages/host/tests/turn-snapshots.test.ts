import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { createRequire, syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  captureSnapshot,
  copyTurnSnapshots,
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
  run(root, "config", "core.autocrlf", "false")
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

const keptIndex = (root: string) => join(root, ".git", "meldshell-snapshot-index")
const snapshotFiles = (root: string, ref: string) =>
  run(root, "ls-tree", "-r", "--name-only", ref).split("\n").filter(Boolean)

test("repeated captures keep their own index and still see same-size edits to untracked files", async () => {
  const root = await repository()
  try {
    run(root, "config", "core.checkStat", "minimal")
    run(root, "config", "core.trustctime", "false")
    // A whole-second time no earlier than the index keeps every capture's entry racily clean.
    const instant = new Date(Math.ceil(Date.now() / 1000 + 30) * 1000)
    const fixture = join(root, "fixture.bin")
    await writeFile(fixture, "aaaa")
    await utimes(fixture, instant, instant)
    const first = turnSnapshotRef("thread", "turn-1", "before")
    const second = turnSnapshotRef("thread", "turn-1", "after")
    assert.equal(await captureSnapshot(root, first), true)
    assert.equal(await captureSnapshot(root, second), true)
    assert.equal(
      run(root, "rev-parse", `${first}^{tree}`),
      run(root, "rev-parse", `${second}^{tree}`),
    )
    // The untracked file is remembered between captures, without entering the user's index.
    const listed = execFileSync("git", ["ls-files"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_INDEX_FILE: keptIndex(root) },
    })
    assert.match(listed, /fixture\.bin/)
    assert.doesNotMatch(run(root, "ls-files"), /fixture\.bin/)

    await writeFile(fixture, "bbbb")
    await utimes(fixture, instant, instant)
    const third = turnSnapshotRef("thread", "turn-2", "after")
    assert.equal(await captureSnapshot(root, third), true)
    assert.equal(run(root, "show", `${third}:fixture.bin`), "bbbb")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a kept index records ignored files exactly when the user's index tracks them", async () => {
  const root = await repository()
  const capture = async (name: string) => {
    const ref = turnSnapshotRef("thread", name, "after")
    assert.equal(await captureSnapshot(root, ref), true)
    return ref
  }
  try {
    await writeFile(join(root, "cache.bin"), "cache\n")
    assert.ok(snapshotFiles(root, await capture("one")).includes("cache.bin"))
    // Ignored after it was first recorded: later snapshots leave it out, as Git would.
    await writeFile(join(root, ".gitignore"), "ignored.log\ncache.bin\n")
    assert.ok(!snapshotFiles(root, await capture("two")).includes("cache.bin"))

    // Force-added after the kept index was made: it is tracked, so it is recorded.
    await writeFile(join(root, "ignored.log"), "forced\n")
    run(root, "add", "--force", "ignored.log")
    assert.equal(run(root, "show", `${await capture("three")}:ignored.log`), "forced")
    // Deleted and recreated between captures, it is still tracked and recorded again.
    await rm(join(root, "ignored.log"))
    assert.ok(!snapshotFiles(root, await capture("four")).includes("ignored.log"))
    await writeFile(join(root, "ignored.log"), "again\n")
    assert.equal(run(root, "show", `${await capture("five")}:ignored.log`), "again")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a capture from a subfolder takes the rest of the tree from the current index", async () => {
  const root = await repository()
  try {
    const folder = join(root, "folder")
    await mkdir(folder)
    await writeFile(join(folder, "inside.txt"), "inside\n")
    const first = turnSnapshotRef("thread", "turn-1", "before")
    assert.equal(await captureSnapshot(folder, first), true)
    await writeFile(join(root, "tracked.txt"), "staged\n")
    run(root, "add", "tracked.txt")
    const second = turnSnapshotRef("thread", "turn-1", "after")
    assert.equal(await captureSnapshot(folder, second), true)
    assert.equal(run(root, "show", `${first}:tracked.txt`), "one")
    assert.equal(run(root, "show", `${second}:tracked.txt`), "staged")
    assert.equal(run(root, "show", `${second}:folder/inside.txt`), "inside")
    assert.equal(existsSync(keptIndex(root)), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a damaged kept index is replaced without losing the capture", async () => {
  const root = await repository()
  const warn = console.warn
  console.warn = () => undefined
  try {
    assert.equal(await captureSnapshot(root, turnSnapshotRef("thread", "turn-1", "before")), true)
    await writeFile(keptIndex(root), "not an index")
    await writeFile(join(root, "tracked.txt"), "two\n")
    const after = turnSnapshotRef("thread", "turn-1", "after")
    assert.equal(await captureSnapshot(root, after), true)
    assert.equal(run(root, "show", `${after}:tracked.txt`), "two")
    await writeFile(join(root, "tracked.txt"), "three\n")
    const next = turnSnapshotRef("thread", "turn-2", "after")
    assert.equal(await captureSnapshot(root, next), true)
    assert.equal(run(root, "show", `${next}:tracked.txt`), "three")
    assert.equal(existsSync(keptIndex(root)), true)
  } finally {
    console.warn = warn
    await rm(root, { recursive: true, force: true })
  }
})

test("concurrent captures of one folder share its kept index safely", async () => {
  const root = await repository()
  try {
    await writeFile(join(root, "created.txt"), "new\n")
    const refs = ["a", "b", "c", "d"].map((turn) => turnSnapshotRef("thread", turn, "after"))
    const captured = await Promise.all(refs.map((ref) => captureSnapshot(root, ref)))
    assert.deepEqual(captured, [true, true, true, true])
    const trees = new Set(refs.map((ref) => run(root, "rev-parse", `${ref}^{tree}`)))
    assert.equal(trees.size, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("copying a fork's snapshots lists the original thread's refs once", async () => {
  const root = await repository()
  const children = createRequire(import.meta.url)(
    "node:child_process",
  ) as typeof import("node:child_process")
  const { execFile, spawn } = children
  const restore = () => {
    children.execFile = execFile
    children.spawn = spawn
    syncBuiltinESMExports()
  }
  let launched = 0
  try {
    const commit = run(root, "rev-parse", "HEAD")
    const turns = Array.from({ length: 50 }, (_, index) => ({
      from: `turn-${index}`,
      to: `copy-${index}`,
    }))
    // Even turns have both snapshots, odd turns only the one before, and the last has none.
    const points = (index: number) =>
      index === turns.length - 1
        ? []
        : index % 2 === 0
          ? (["before", "after"] as const)
          : (["before"] as const)
    const lines = turns.flatMap((turn, index) =>
      points(index).map(
        (point) => `update ${turnSnapshotRef("thread", turn.from, point)} ${commit}\n`,
      ),
    )
    execFileSync("git", ["update-ref", "--stdin"], { cwd: root, input: lines.join("") })

    children.execFile = ((...args: Parameters<typeof execFile>) => {
      launched++
      return execFile(...args)
    }) as typeof execFile
    children.spawn = ((...args: Parameters<typeof spawn>) => {
      launched++
      return spawn(...args)
    }) as typeof spawn
    syncBuiltinESMExports()
    await copyTurnSnapshots(root, "thread", "fork", turns)
    restore()
    assert.equal(launched, 2, "one listing and one ref update")

    const forkPrefix = turnSnapshotRef("fork", "", "before").split("/turns/")[0]!
    const copied = run(root, "for-each-ref", "--format=%(refname)", forkPrefix)
      .split("\n")
      .filter(Boolean)
    const expected = turns.flatMap((turn, index) =>
      points(index).map((point) => turnSnapshotRef("fork", turn.to, point)),
    )
    assert.deepEqual(copied.sort(), expected.sort())

    // Nothing to copy, or no repository at all, is not an error.
    await copyTurnSnapshots(root, "missing", "fork-2", turns)
    const plain = await mkdtemp(join(tmpdir(), "meldshell-plain-"))
    await copyTurnSnapshots(plain, "thread", "fork-3", turns)
    await rm(plain, { recursive: true, force: true })
  } finally {
    restore()
    await rm(root, { recursive: true, force: true })
  }
})
