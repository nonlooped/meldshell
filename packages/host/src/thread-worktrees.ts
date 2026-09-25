import { dirname, join } from "node:path"
import { Effect } from "effect"
import type { AppSnapshot, CreateThreadInput, ThreadLocation } from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { attempt } from "./attempt"
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
import {
  beginWorktreeSetup,
  readSetupLog,
  readWorkspaceScripts,
  setupRunning,
  stopWorktreeSetup,
} from "./workspace-scripts"

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

/**
 * Creates a worktree and hands it to `record`. If the core refuses the record, the worktree and its
 * branch are removed again so no orphaned checkout is left behind.
 */
const withNewWorktree = <A, E, R>(
  workspacePath: string,
  record: (worktree: Awaited<ReturnType<typeof createWorktree>>) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const platform = yield* HostPlatform
    const worktree = yield* attempt(() =>
      createWorktree(workspacePath, join(dirname(platform.databasePath), "worktrees")),
    )
    return yield* record(worktree).pipe(
      Effect.tapError(() =>
        attempt(() =>
          removeWorktree(workspacePath, worktree, { force: true, deleteBranch: true }),
        ).pipe(Effect.catchAll(Effect.logError)),
      ),
    )
  })

/** Starts the setup script in a thread's new worktree and returns the snapshot that shows it. */
const setUpWorktree = (threadId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const location = yield* core.GetThreadLocation({ threadId })
    yield* beginWorktreeSetup(location).pipe(Effect.catchAll(Effect.logError))
    return yield* core.GetSnapshot()
  })

/** The thread is already recorded, so a setup problem must not undo the worktree it owns. */
const setUpCreatedWorktree = (snapshot: AppSnapshot, worktreePath: string) => {
  const thread = snapshot.threads.find((entry) => entry.worktree?.path === worktreePath)
  return thread === undefined
    ? Effect.succeed(snapshot)
    : setUpWorktree(thread.id).pipe(
        Effect.catchAll((cause) => Effect.as(Effect.logError(cause), snapshot)),
      )
}

export const createThread = (input: CreateThreadInput) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const record = {
      workspaceId: input.workspaceId,
      ...(input.title === undefined ? {} : { title: input.title }),
    }
    if (input.isolated !== true) return yield* core.CreateThread(record)
    const workspacePath = yield* scopePath({ workspaceId: input.workspaceId })
    return yield* withNewWorktree(workspacePath, (worktree) =>
      core
        .CreateThread({ ...record, worktree })
        .pipe(Effect.flatMap((snapshot) => setUpCreatedWorktree(snapshot, worktree.path))),
    )
  })

/**
 * Moves a thread that has not started to another workspace, onto its own branch, or both. A replaced
 * worktree and its unused branch are deleted; uncommitted files in that worktree block the move.
 */
export const setDraftLocation = (input: {
  readonly threadId: string
  readonly workspaceId?: string | undefined
  readonly isolated?: boolean | undefined
}) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const location = yield* core.GetThreadLocation({ threadId: input.threadId })
    const current = location.worktree?.state === "removed" ? null : location.worktree
    const workspaceId = input.workspaceId ?? location.workspaceId
    const isolated = input.isolated ?? current !== null
    if (workspaceId === location.workspaceId && isolated === (current !== null))
      return yield* core.GetSnapshot()
    if (yield* hasUncommittedWork(location))
      return yield* Effect.fail(
        new Error("This thread's worktree has uncommitted changes, so it stays where it is."),
      )
    yield* stopWorktreeSetup(input.threadId)
    const workspacePath = yield* scopePath({ workspaceId })
    const record = { threadId: input.threadId, workspaceId }
    const snapshot = isolated
      ? yield* withNewWorktree(workspacePath, (worktree) =>
          core.SetDraftLocation({ ...record, worktree }),
        )
      : yield* core.SetDraftLocation({ ...record, worktree: null })
    if (current !== null)
      yield* attempt(() =>
        removeWorktree(location.workspacePath, current, { force: false, deleteBranch: true }),
      ).pipe(Effect.catchAll(Effect.logError))
    return isolated ? yield* setUpWorktree(input.threadId) : snapshot
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
    yield* stopWorktreeSetup(threadId)
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
    for (const location of threads) yield* stopWorktreeSetup(location.threadId)
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
    yield* stopWorktreeSetup(input.threadId)
    yield* attempt(() =>
      removeWorktree(location.workspacePath, worktree, {
        force: true,
        deleteBranch: input.deleteBranch,
      }),
    )
    return yield* core.SetWorktreeState({ threadId: input.threadId, state: "removed" })
  })

export const getWorktreeSetupLog = (threadId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const worktree = yield* readyWorktree(yield* core.GetThreadLocation({ threadId }))
    return yield* attempt(() => readSetupLog(worktree.path))
  })

export const rerunWorktreeSetup = (threadId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    const location = yield* core.GetThreadLocation({ threadId })
    yield* readyWorktree(location)
    if (location.busy)
      return yield* Effect.fail(
        new Error("Stop this thread and clear its queue before running setup again."),
      )
    const scripts = yield* attempt(() => readWorkspaceScripts(location.workspacePath))
    if (scripts.setup === null)
      return yield* Effect.fail(
        new Error("This workspace has no setup script. Add scripts.setup to meldshell.json."),
      )
    yield* beginWorktreeSetup(location)
    return yield* core.GetSnapshot()
  })

export const stopThreadWorktreeSetup = (threadId: string) =>
  Effect.gen(function* () {
    const core = yield* CoreClient
    yield* stopWorktreeSetup(threadId)
    return yield* core.GetSnapshot()
  })

/**
 * Marks worktrees whose folders disappeared while MeldShell was closed, and restores ones that came
 * back, so a thread never starts a turn in a folder that is not there. A setup script that was
 * running when MeldShell quit is marked interrupted. Returns whether any thread changed.
 */
export const reconcileWorktrees = Effect.gen(function* () {
  const core = yield* CoreClient
  const threads = yield* core.ListWorktreeThreads({})
  const changed = yield* Effect.forEach(threads, (location) =>
    Effect.gen(function* () {
      const worktree = location.worktree!
      let changed = false
      if (worktree.setup === "running" && !setupRunning(location.threadId)) {
        yield* core.SetWorktreeSetup({ threadId: location.threadId, setup: "interrupted" })
        changed = true
      }
      const state = (yield* Effect.promise(() => worktreePresent(worktree.path)))
        ? "ready"
        : "missing"
      if (state === worktree.state) return changed
      yield* core.SetWorktreeState({ threadId: location.threadId, state })
      return true
    }),
  )
  return changed.includes(true)
})
