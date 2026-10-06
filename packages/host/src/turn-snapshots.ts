import { spawn } from "node:child_process"
import { copyFile, mkdtemp, rename, rm, stat, utimes } from "node:fs/promises"
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

/** Listings of index entries or refs can outgrow the default output limit in large repositories. */
const LIST_BYTES = 64 * 1024 * 1024

/** Runs Git with `input` on stdin, for lists that can be longer than a command line allows. */
const gitInput = (
  cwd: string,
  args: readonly string[],
  input: string,
  failure: string,
  env: Readonly<Record<string, string>> = {},
) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["--no-optional-locks", "--literal-pathspecs", ...args], {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "ignore", "ignore"],
      env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" },
    })
    child.on("error", reject)
    // A Git that exits before reading its input reports the failure through its exit code.
    child.stdin.on("error", () => undefined)
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(failure))))
    child.stdin.end(input)
  })

/**
 * Each worktree keeps a private staging index between captures, beside its own index. Untracked
 * files are never in the user's index, so staging from a fresh copy of it would rehash every one of
 * them on every capture; the kept index remembers their stat data, so only changed files are read.
 */
const SNAPSHOT_INDEX = "meldshell-snapshot-index"

interface SnapshotLocation {
  /** The worktree's own index. */
  readonly index: string
  /** The kept staging index, or null when `cwd` is below the worktree's top level. */
  readonly kept: string | null
}

/** Where a capture in `cwd` stages its files; null outside a work tree, which has nothing to record. */
async function snapshotLocation(cwd: string): Promise<SnapshotLocation | null> {
  const output = await git(cwd, [
    "rev-parse",
    "--is-inside-work-tree",
    "--show-prefix",
    "--path-format=absolute",
    "--git-path",
    "index",
    "--git-path",
    SNAPSHOT_INDEX,
  ]).catch(() => null)
  const [inside, prefix, index, kept] = output?.split(/\r?\n/) ?? []
  if (inside !== "true" || !index || !kept) return null
  // A snapshot's tree also holds every entry outside `cwd`, and forks restore a snapshot at their
  // worktree's top level. Staging from a subfolder updates only its own entries, so a kept index
  // would carry the rest of the tree from whenever it was seeded; there, captures keep reading
  // those entries from the current index instead.
  return { index, kept: prefix === "" ? kept : null }
}

/**
 * Copies the worktree's index to `target`, keeping Git's stat cache for tracked files. A repository
 * without commits may have no index yet; staging then starts from nothing.
 */
async function seedIndex(index: string, target: string): Promise<void> {
  const original = await stat(index).catch(() => null)
  if (original === null) return
  const partial = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    await copyFile(index, partial)
    // Git rehashes entries written no earlier than the index itself, since a same-size edit in
    // that instant leaves the stat cache unchanged. A fresh copy would look newer than every
    // entry and hide such edits, so the copy keeps the index's own time.
    await utimes(partial, original.atime, original.mtime)
    await rename(partial, target)
  } finally {
    await rm(partial, { force: true })
  }
}

/** Stages every non-ignored file under `cwd` into `indexFile` and returns the tree it records. */
async function stageTree(cwd: string, indexFile: string): Promise<string> {
  const env = { GIT_INDEX_FILE: indexFile }
  await git(cwd, ["add", "--all", "--", "."], CAPTURE_TIMEOUT, undefined, env)
  return (await git(cwd, ["write-tree"], CAPTURE_TIMEOUT, undefined, env)).trim()
}

/** Stages from a throwaway copy of the worktree's index. */
async function stageFromCopy(cwd: string, index: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-snapshot-"))
  try {
    const temporary = join(directory, "index")
    await seedIndex(index, temporary)
    return await stageTree(cwd, temporary)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * `add --all` never adds an ignored file and never drops a tracked one, so a kept index alone would
 * hold on to a file ignored after it was first recorded and miss one force-added to the worktree's
 * index since. Ignored entries are therefore matched to the worktree's index before staging, which
 * leaves the kept index tracking what a fresh copy of the worktree's index would.
 */
async function matchIgnoredEntries(cwd: string, kept: string): Promise<void> {
  const ignored = async (env: Readonly<Record<string, string>>) =>
    new Set(
      (
        await git(
          cwd,
          ["ls-files", "-z", "--cached", "--ignored", "--exclude-standard", "--", "."],
          CAPTURE_TIMEOUT,
          LIST_BYTES,
          env,
        )
      )
        .split("\0")
        .filter(Boolean),
    )
  const env = { GIT_INDEX_FILE: kept }
  const [tracked, held] = await Promise.all([ignored({}), ignored(env)])
  const paths = (list: Iterable<string>) => [...list].map((path) => `${path}\0`).join("")
  const stale = [...held].filter((path) => !tracked.has(path))
  const missing = [...tracked].filter((path) => !held.has(path))
  if (stale.length > 0)
    await gitInput(
      cwd,
      ["update-index", "--force-remove", "-z", "--stdin"],
      paths(stale),
      "Could not update the snapshot index.",
      env,
    )
  // Records each file's current content, or its absence when it was deleted.
  if (missing.length > 0)
    await gitInput(
      cwd,
      ["update-index", "--add", "--remove", "-z", "--stdin"],
      paths(missing),
      "Could not update the snapshot index.",
      env,
    )
}

/** A lock this old outlived every capture's deadline, so the capture that took it has ended. */
const STALE_LOCK_MS = 2 * CAPTURE_TIMEOUT

/** Captures run one at a time per kept index, since Git refuses to stage while it is locked. */
const keptIndexes = new Map<string, Promise<unknown>>()

const withKeptIndex = <A>(kept: string, run: () => Promise<A>): Promise<A> => {
  const next = (keptIndexes.get(kept) ?? Promise.resolve()).catch(() => undefined).then(run)
  keptIndexes.set(kept, next)
  const settle = () => {
    if (keptIndexes.get(kept) === next) keptIndexes.delete(kept)
  }
  next.then(settle, settle)
  return next
}

/** Stages with the kept index; a damaged one is discarded and this capture uses a fresh copy. */
const stageWithKeptIndex = (cwd: string, location: SnapshotLocation & { readonly kept: string }) =>
  withKeptIndex(location.kept, async () => {
    try {
      if ((await stat(location.kept).catch(() => null)) === null)
        await seedIndex(location.index, location.kept)
      await matchIgnoredEntries(cwd, location.kept)
      return await stageTree(cwd, location.kept)
    } catch (cause) {
      await rm(location.kept, { force: true })
      // A capture stopped at its deadline can leave Git's lock behind, which would refuse every
      // later capture. A recent lock may belong to another MeldShell process, so it is left alone.
      const lock = `${location.kept}.lock`
      const locked = await stat(lock).catch(() => null)
      if (locked !== null && Date.now() - locked.mtimeMs > STALE_LOCK_MS)
        await rm(lock, { force: true })
      console.warn(
        "The snapshot index was discarded; this capture stages from a fresh copy.",
        cause,
      )
      return await stageFromCopy(cwd, location.index)
    }
  })

/**
 * Records every non-ignored file under `cwd`, tracked or not, without touching the user's index.
 * A folder outside Git has nothing to record and returns false.
 */
export async function captureSnapshot(cwd: string, ref: string): Promise<boolean> {
  const location = await snapshotLocation(cwd)
  if (location === null) return false
  const { kept } = location
  const tree =
    kept === null
      ? await stageFromCopy(cwd, location.index)
      : await stageWithKeptIndex(cwd, { ...location, kept })
  const commit = (
    await git(
      cwd,
      ["commit-tree", tree, "-m", "MeldShell turn snapshot"],
      15_000,
      undefined,
      identity,
    )
  ).trim()
  await git(cwd, ["update-ref", ref, commit])
  return true
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

/** Whether a turn's files were snapshotted at a point, without reading what changed. */
export const hasTurnSnapshot = async (
  cwd: string,
  threadId: string,
  turnId: string,
  point: SnapshotPoint,
): Promise<boolean> => (await resolveCommit(cwd, turnSnapshotRef(threadId, turnId, point))) !== null

export async function readTurnSnapshot(
  cwd: string,
  threadId: string,
  turnId: string,
): Promise<TurnSnapshot> {
  const [before, after] = await Promise.all([
    resolveCommit(cwd, turnSnapshotRef(threadId, turnId, "before")),
    resolveCommit(cwd, turnSnapshotRef(threadId, turnId, "after")),
  ])
  // A diff too large to read still leaves the snapshots restorable.
  const patch =
    before !== null && after !== null
      ? await snapshotDiff(cwd, before, after).catch(() => null)
      : null
  return { before: before !== null, after: after !== null, patch }
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

/**
 * Gives a fork's new worktree the files the original thread had at a turn snapshot. The worktree
 * has nothing of its own yet, so nothing is saved for an undo. Returns false without a snapshot.
 */
export async function checkoutTurnSnapshot(
  cwd: string,
  threadId: string,
  turnId: string,
  point: SnapshotPoint,
): Promise<boolean> {
  const commit = await resolveCommit(cwd, turnSnapshotRef(threadId, turnId, point))
  if (commit === null) return false
  await writeRepository(cwd, () => restoreFiles(cwd, commit))
  return true
}

/**
 * Points a fork's copied turns at the original turns' snapshots, so restoring and rewinding work
 * in the fork too. Refs are shared by every worktree of a repository, so the commits are reused.
 */
export async function copyTurnSnapshots(
  cwd: string,
  from: string,
  to: string,
  turns: ReadonlyArray<{ readonly from: string; readonly to: string }>,
): Promise<void> {
  if (turns.length === 0) return
  // One listing of the original thread's refs, rather than a lookup per turn and point. A folder
  // outside Git, like a missing ref, has nothing to copy.
  const listing = await git(
    cwd,
    [
      "for-each-ref",
      "--format=%(refname)%00%(objecttype)%00%(objectname)%00%(*objecttype)%00%(*objectname)",
      threadPrefix(from),
    ],
    15_000,
    LIST_BYTES,
  ).catch(() => "")
  const commits = new Map<string, string>()
  for (const line of listing.split("\n")) {
    const [ref, type, object, peeledType, peeled] = line.split("\0")
    if (ref === undefined) continue
    if (type === "commit" && object) commits.set(ref, object)
    else if (peeledType === "commit" && peeled) commits.set(ref, peeled)
  }
  const updates: string[] = []
  for (const turn of turns)
    for (const point of ["before", "after"] as const) {
      const commit = commits.get(turnSnapshotRef(from, turn.from, point))
      if (commit !== undefined)
        updates.push(`update ${turnSnapshotRef(to, turn.to, point)} ${commit}\n`)
    }
  if (updates.length > 0) await updateRefs(cwd, updates, "Could not copy the thread's snapshots.")
}

/** Applies ref updates in one transaction; the list can be longer than a command line allows. */
const updateRefs = (cwd: string, lines: readonly string[], failure: string) =>
  gitInput(cwd, ["update-ref", "--stdin"], lines.join(""), failure)

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
  await updateRefs(
    cwd,
    refs.map((ref) => `delete ${ref}\n`),
    "Could not remove the thread's snapshots.",
  )
}
