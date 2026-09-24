import { randomBytes } from "node:crypto"
import { mkdir, rm, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import type { ThreadWorktree } from "@meldshell/contracts"
import type { WorktreeStatus } from "@meldshell/contracts/ipc"
import { git, statusAt, writeRepository } from "./git"

type NewWorktree = Omit<ThreadWorktree, "state" | "setup">
type WorktreeRef = Pick<ThreadWorktree, "path" | "branch">

const currentBranch = (root: string): Promise<string | null> =>
  git(root, ["symbolic-ref", "--short", "HEAD"]).then(
    (value) => value.trim(),
    () => null,
  )

const branchExists = (root: string, branch: string): Promise<boolean> =>
  git(root, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).then(
    () => true,
    () => false,
  )

/** The setup script's output sits beside the worktree, so it never shows up as a change. */
export const setupLogPath = (worktreePath: string): string => `${worktreePath}.setup.log`

/** A checkout created by Git has a `.git` file; an empty or foreign folder is not the worktree. */
export const worktreePresent = (path: string): Promise<boolean> =>
  stat(join(path, ".git")).then(
    (entry) => entry.isFile(),
    () => false,
  )

/**
 * Creates a new branch and checkout for one thread under `directory`, starting from the commit the
 * workspace has checked out. The workspace folder itself is left untouched.
 */
export async function createWorktree(
  workspacePath: string,
  directory: string,
): Promise<NewWorktree> {
  const root = (await git(workspacePath, ["rev-parse", "--show-toplevel"])).trim()
  const head = await git(root, ["rev-parse", "--verify", "HEAD"]).then(
    (value) => value.trim(),
    () => null,
  )
  if (head === null)
    throw new Error("Make a first commit in this workspace before starting an isolated thread.")
  const baseBranch = await currentBranch(root)
  const id = randomBytes(4).toString("hex")
  const branch = `meldshell/${id}`
  const path = join(directory, `${basename(root).replace(/[^\w.-]+/g, "-")}-${id}`)
  await mkdir(directory, { recursive: true })
  await writeRepository(root, async () => {
    await git(root, ["worktree", "add", "-b", branch, path, head], 120_000)
  })
  return { path, branch, baseBranch }
}

export async function worktreeStatus(worktree: ThreadWorktree): Promise<WorktreeStatus> {
  const changes = (await statusAt(worktree.path)).length
  const unmerged =
    worktree.baseBranch === null
      ? null
      : await git(worktree.path, [
          "rev-list",
          "--count",
          `refs/heads/${worktree.baseBranch}..refs/heads/${worktree.branch}`,
        ]).then(
          (value) => Number(value.trim()),
          // The base branch may have been renamed or deleted since the thread began.
          () => null,
        )
  return { branch: worktree.branch, baseBranch: worktree.baseBranch, changes, unmerged }
}

/**
 * Merges a thread's committed work into its base branch in the workspace folder. A conflicted merge
 * is undone so the workspace is never left half-merged.
 */
export async function mergeWorktree(
  workspacePath: string,
  worktree: ThreadWorktree,
): Promise<void> {
  const base = worktree.baseBranch
  if (base === null)
    throw new Error(
      "This thread started from a detached HEAD, so it has no branch to merge into. Push its branch instead.",
    )
  if ((await statusAt(worktree.path)).length > 0)
    throw new Error("Commit or discard this thread's changes before merging.")
  await writeRepository(workspacePath, async (root) => {
    if ((await currentBranch(root)) !== base)
      throw new Error(`Check out ${base} in the workspace folder before merging.`)
    try {
      await git(root, ["merge", "--no-edit", worktree.branch], 120_000)
    } catch (cause) {
      const merging = await git(root, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]).then(
        () => true,
        () => false,
      )
      if (!merging) throw cause
      await git(root, ["merge", "--abort"]).catch(() => undefined)
      throw new Error(
        `${worktree.branch} conflicts with ${base}, so the merge was undone. Ask the thread to merge ${base} into its branch and resolve the conflicts, then merge again.`,
      )
    }
  })
}

/**
 * Removes a thread's checkout. Without `force`, Git refuses when the checkout has uncommitted work.
 * The branch keeps its commits unless `deleteBranch` is set.
 */
export async function removeWorktree(
  workspacePath: string,
  worktree: WorktreeRef,
  options: { readonly force: boolean; readonly deleteBranch: boolean },
): Promise<void> {
  await writeRepository(workspacePath, async (root) => {
    if (await worktreePresent(worktree.path))
      await git(
        root,
        ["worktree", "remove", ...(options.force ? ["--force"] : []), worktree.path],
        120_000,
      )
    else await git(root, ["worktree", "prune"])
    if (options.deleteBranch && (await branchExists(root, worktree.branch)))
      await git(root, ["branch", "-D", worktree.branch])
  })
  await rm(setupLogPath(worktree.path), { force: true })
}
