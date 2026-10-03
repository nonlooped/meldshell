import { spawn } from "node:child_process"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ThreadLocation } from "@meldshell/contracts"
import type { TurnSnapshot } from "@meldshell/contracts/ipc"
import { git, gitValue, writeRepository } from "./git"

/**
 * Turn snapshots are commits of a thread's folder, kept under their own refs so they never appear
 * in branch history, `git log --all` aside. Each turn records its files when it starts and when it
 * finishes; restoring a snapshot first records the current files, so the restore can be undone.
 */
const PREFIX = "refs/meldshell/snapshots"

export type SnapshotPoint = "before" | "after"

const encode = (id: string) => Buffer.from(id, "utf8").toString("base64url")
const threadPrefix = (threadId: string) => `${PREFIX}/${encode(threadId)}/`
export const turnSnapshotRef = (threadId: string, turnId: string, point: SnapshotPoint) =>
  `${threadPrefix(threadId)}turns/${encode(turnId)}/${point}`
const undoRef = (threadId: string) => `${threadPrefix(threadId)}undo`

/** Snapshot commits carry a fixed identity, so capturing never depends on the user's Git config. */
const identity = {
  GIT_AUTHOR_NAME: "MeldShell",
  GIT_AUTHOR_EMAIL: "snapshots@meldshell.invalid",
  GIT_COMMITTER_NAME: "MeldShell",
  GIT_COMMITTER_EMAIL: "snapshots@meldshell.invalid",
}

/** Staging a large folder for the first time reads every file, so it gets more than the default. */
const CAPTURE_TIMEOUT = 120_000

/** The folder a thread's turns run in: its worktree when it has one, otherwise its workspace. */
export const threadFolder = (location: ThreadLocation): string | null => {
  const worktree = location.worktree
  if (worktree === null) return location.workspacePath
  return worktree.state === "ready" ? worktree.path : null
}

const resolveCommit = (cwd: string, ref: string) =>
  gitValue(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])

/**
 * Records every non-ignored file under `cwd`, tracked or not, without touching the user's index.
 * A folder outside Git has nothing to record and returns false.
 */
export async function captureSnapshot(cwd: string, ref: string): Promise<boolean> {
  if ((await gitValue(cwd, ["rev-parse", "--is-inside-work-tree"])) !== "true") return false
  const index = (
    await git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
  ).trim()
  const directory = await mkdtemp(join(tmpdir(), "meldshell-snapshot-"))
  const temporary = join(directory, "index")
  try {
    // A copy of the real index keeps Git's file stat cache, so unchanged files are not re-read.
    // A repository without commits may have no index yet; staging then starts from nothing.
    await copyFile(index, temporary).catch(() => undefined)
    const env = { ...identity, GIT_INDEX_FILE: temporary }
    await git(cwd, ["add", "--all", "--", "."], CAPTURE_TIMEOUT, undefined, env)
    const tree = (await git(cwd, ["write-tree"], CAPTURE_TIMEOUT, undefined, env)).trim()
    const commit = (
      await git(cwd, ["commit-tree", tree, "-m", "MeldShell turn snapshot"], 15_000, undefined, env)
    ).trim()
    await git(cwd, ["update-ref", ref, commit])
    return true
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/** The changes from one snapshot to another, with paths relative to `cwd`. */
const snapshotDiff = (cwd: string, from: string, to: string) =>
  git(cwd, [
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--find-renames",
    "--relative",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    from,
    to,
    "--",
  ])

export async function readTurnSnapshot(
  cwd: string,
  threadId: string,
  turnId: string,
): Promise<TurnSnapshot> {
  const [before, after, undo] = await Promise.all([
    resolveCommit(cwd, turnSnapshotRef(threadId, turnId, "before")),
    resolveCommit(cwd, turnSnapshotRef(threadId, turnId, "after")),
    resolveCommit(cwd, undoRef(threadId)),
  ])
  // A diff too large to read still leaves the snapshots restorable.
  const patch =
    before !== null && after !== null
      ? await snapshotDiff(cwd, before, after).catch(() => null)
      : null
  return { before: before !== null, after: after !== null, patch, undoable: undo !== null }
}

/**
 * Returns the files under `cwd` to a snapshot: tracked and untracked files match it again, files
 * created since are removed, and ignored files are left alone. Staged changes are unstaged.
 */
async function restoreFiles(cwd: string, commit: string): Promise<void> {
  const tracked = await git(cwd, ["ls-files", "--cached", `--with-tree=${commit}`, "-z", "--", "."])
  // With nothing in the index or the snapshot, git restore has no path to match.
  if (tracked.length > 0)
    await git(cwd, ["restore", "--source", commit, "--worktree", "--staged", "--", "."], 120_000)
  await git(cwd, ["clean", "-f", "-d", "--", "."], 120_000)
  if ((await gitValue(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"])) !== null)
    await git(cwd, ["reset", "--quiet", "--", "."])
}

export async function restoreTurnSnapshot(
  cwd: string,
  threadId: string,
  turnId: string,
  point: SnapshotPoint,
): Promise<void> {
  await writeRepository(cwd, async () => {
    const commit = await resolveCommit(cwd, turnSnapshotRef(threadId, turnId, point))
    if (commit === null) throw new Error("This snapshot is no longer available.")
    if (!(await captureSnapshot(cwd, undoRef(threadId))))
      throw new Error("Could not save the current files before restoring.")
    await restoreFiles(cwd, commit)
  })
}

/** Puts back the files a restore replaced. Only the latest restore can be undone. */
export async function undoSnapshotRestore(cwd: string, threadId: string): Promise<void> {
  await writeRepository(cwd, async () => {
    const commit = await resolveCommit(cwd, undoRef(threadId))
    if (commit === null) throw new Error("There is no restore to undo.")
    await restoreFiles(cwd, commit)
    await git(cwd, ["update-ref", "-d", undoRef(threadId)])
  })
}

/** Removes a deleted thread's snapshots; their commits become unreachable for Git to collect. */
export async function deleteThreadSnapshots(cwd: string, threadId: string): Promise<void> {
  if ((await gitValue(cwd, ["rev-parse", "--is-inside-work-tree"])) !== "true") return
  const refs = (await git(cwd, ["for-each-ref", "--format=%(refname)", threadPrefix(threadId)]))
    .split("\n")
    .filter(Boolean)
  if (refs.length === 0) return
  await new Promise<void>((resolve, reject) => {
    // One transaction deletes every ref; the list can be longer than a command line allows.
    const child = spawn("git", ["update-ref", "--stdin"], {
      cwd,
      windowsHide: true,
    })
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Could not remove the thread's snapshots.")),
    )
    child.stdin.end(refs.map((ref) => `delete ${ref}\n`).join(""))
  })
}
