import type { Thread } from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"

/** A thread with its own worktree reads that checkout; other threads share the workspace folder. */
export const workspaceScope = (thread: Thread): WorkspaceScope =>
  thread.worktree === undefined
    ? { workspaceId: thread.workspaceId }
    : { workspaceId: thread.workspaceId, threadId: thread.id }

/** Query-key segment for a scope. Workspace-wide invalidation still matches by its first entry. */
export const scopeKey = (scope: WorkspaceScope) => [scope.workspaceId, scope.threadId ?? null]
