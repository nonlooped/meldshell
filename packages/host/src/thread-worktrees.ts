import { dirname, join } from "node:path"
import { Effect } from "effect"
import type { CreateThreadInput, ThreadLocation } from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { CoreClient } from "./core-client"
import { HostPlatform } from "./platform"
import { statusAt } from "./git"
import {
  createWorktree,
  mergeWorktree,
  removeWorktree,
  worktreePresent,
  worktreeStatus,
} from "./worktrees"

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })

const readyWorktree = (location: ThreadLocation) => {
  const worktree = location.worktree
  if (worktree === null)
    return Effect.fail(new Error("This thread works in the workspace folder, not a worktree."))
  if (worktree.state === "removed")
    return Effect.fail(new Error("This thread's worktree was removed."))
  if (worktree.state === "missing")
    return Effect.fail(new Error(`This thread's worktree folder is missing: ${worktree.path}`))
  return Effect.succeed(worktree)
}

/** Worktrees that are not ready have nothing to lose, so only present folders are checked. */
const hasUncommittedWork = (location: ThreadLocation) =>
  attempt(async () => {
    const worktree = location.worktree
    if (worktree === null || worktree.state === "removed") return false
    if (!(await worktreePresent(worktree.path))) return false
    return (await statusAt(worktree.path)).length > 0
  })

/** The folder a file or Git request reads: the thread's worktree when it has one, else the workspace. */
export const scopePath = (scope: WorkspaceScope) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    if (scope.threadId !== undefined) {
      const location = yield* core.GetThreadLocation({ threadId: scope.threadId })
      if (location.workspaceId !== scope.workspaceId)
        return yield* Effect.fail(new Error("Thread not found in this workspace."))
      if (location.worktree === null) return location.workspacePath
      return (yield* readyWorktree(location)).path
    }
    const snapshot = yield* core.GetSnapshot()
    const workspace = snapshot.workspaces.find((entry) => entry.id === scope.workspaceId)
    if (!workspace) return yield* Effect.fail(new Error("Workspace not found."))
    return workspace.path
  })

export const createThread = (input: CreateThreadInput) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const record = {
      workspaceId: input.workspaceId,
      ...(input.title === undefined ? {} : { title: input.title }),
    }
    if (input.isolated !== true) return yield* core.CreateThread(record)
    const workspacePath = yield* scopePath({ workspaceId: input.workspaceId })
    const platform = yield* HostPlatform
    const worktree = yield* attempt(() =>
      createWorktree(workspacePath, join(dirname(platform.databasePath), "worktrees")),
    )
    return yield* core
      .CreateThread({ ...record, worktree })
      .pipe(
        Effect.tapError(() =>
          attempt(() =>
            removeWorktree(workspacePath, worktree, { force: true, deleteBranch: true }),
          ).pipe(Effect.catchAll(Effect.logError)),
        ),
      )
  })

/** Deleting a thread removes its checkout but keeps the branch, so committed work survives. */
export const deleteThread = (threadId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const location = yield* core.GetThreadLocation({ threadId })
    if (yield* hasUncommittedWork(location))
      return yield* Effect.fail(
        new Error(
          "This thread's worktree has uncommitted changes. Commit them or remove the worktree first.",
        ),
      )
    const snapshot = yield* core.DeleteThread({ threadId })
    const worktree = location.worktree
    if (worktree !== null && worktree.state !== "removed")
      yield* attempt(() =>
        removeWorktree(location.workspacePath, worktree, { force: false, deleteBranch: false }),
      ).pipe(Effect.catchAll(Effect.logError))
    return snapshot
  })

export const removeWorkspace = (workspaceId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const threads = yield* core.ListWorktreeThreads({ workspaceId })
    for (const location of threads)
      if (yield* hasUncommittedWork(location))
        return yield* Effect.fail(
          new Error(
            `A thread's worktree has uncommitted changes (${location.worktree?.branch}). Commit them or remove that worktree first.`,
          ),
        )
    const snapshot = yield* core.RemoveWorkspace({ workspaceId })
    for (const location of threads)
      yield* attempt(() =>
        removeWorktree(location.workspacePath, location.worktree!, {
          force: false,
          deleteBranch: false,
        }),
      ).pipe(Effect.catchAll(Effect.logError))
    return snapshot
  })

export const getWorktreeStatus = (threadId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const worktree = yield* readyWorktree(yield* core.GetThreadLocation({ threadId }))
    return yield* attempt(() => worktreeStatus(worktree))
  })

export const mergeThreadWorktree = (threadId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const location = yield* core.GetThreadLocation({ threadId })
    const worktree = yield* readyWorktree(location)
    yield* attempt(() => mergeWorktree(location.workspacePath, worktree))
  })

export const removeThreadWorktree = (input: {
  readonly threadId: string
  readonly deleteBranch: boolean
}) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const location = yield* core.GetThreadLocation({ threadId: input.threadId })
    const worktree = location.worktree
    if (worktree === null || worktree.state === "removed")
      return yield* Effect.fail(new Error("This thread has no worktree to remove."))
    if (location.busy)
      return yield* Effect.fail(
        new Error("Stop this thread and clear its queue before removing its worktree."),
      )
    yield* attempt(() =>
      removeWorktree(location.workspacePath, worktree, {
        force: true,
        deleteBranch: input.deleteBranch,
      }),
    )
    return yield* core.SetWorktreeState({ threadId: input.threadId, state: "removed" })
  })

/**
 * Marks worktrees whose folders disappeared while MeldShell was closed, and restores ones that came
 * back, so a thread never starts a turn in a folder that is not there. Returns whether any changed.
 */
export const reconcileWorktrees = Effect.gen(function* () {
  const core = yield* CoreClient
  const threads = yield* core.ListWorktreeThreads({})
  const changed = yield* Effect.forEach(threads, (location) =>
    Effect.gen(function* () {
      const worktree = location.worktree!
      const state = (yield* Effect.promise(() => worktreePresent(worktree.path)))
        ? "ready"
        : "missing"
      if (state === worktree.state) return false
      yield* core.SetWorktreeState({ threadId: location.threadId, state })
      return true
    }),
  )
  return changed.includes(true)
})
