import { Schema } from "effect"

/** Resolves the workspace checkout, or a thread's isolated worktree. */
export const WorkspaceScope = Schema.Struct({
  workspaceId: Schema.String,
  threadId: Schema.optional(Schema.String),
})
export type WorkspaceScope = typeof WorkspaceScope.Type

export const WorkspaceFileInput = Schema.Struct({ ...WorkspaceScope.fields, path: Schema.String })
export type WorkspaceFileInput = typeof WorkspaceFileInput.Type

// Public callers retain exact optional properties where the IPC API required them;
// decoders continue accepting explicit undefined from existing wire clients.
type ExactOptional<T, K extends keyof T> = Omit<T, K> & {
  readonly [P in K]?: Exclude<T[P], undefined>
}

export const SearchWorkspacePathsInput = Schema.Struct({
  ...WorkspaceScope.fields,
  query: Schema.String.pipe(Schema.check(Schema.isMaxLength(1024))),
  limit: Schema.optional(
    Schema.Number.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
    ),
  ),
})
export type SearchWorkspacePathsInput = ExactOptional<
  typeof SearchWorkspacePathsInput.Type,
  "threadId" | "limit"
>

export const SearchWorkspaceContentsInput = Schema.Struct({
  ...WorkspaceScope.fields,
  query: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(1024)),
  ),
  caseSensitive: Schema.Boolean,
  /** The query is a JavaScript regular expression rather than literal text. */
  regex: Schema.Boolean,
  /** The most matching lines to return; the search stops once it has this many. */
  limit: Schema.optional(
    Schema.Number.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 5000 })),
    ),
  ),
})
export type SearchWorkspaceContentsInput = ExactOptional<
  typeof SearchWorkspaceContentsInput.Type,
  "threadId" | "limit"
>

export const WorkspaceFileActionInput = Schema.Struct({
  ...WorkspaceFileInput.fields,
  action: Schema.Literals(["create-file", "create-folder", "rename", "delete"]),
  /** A single entry name, required for creation and rename. */
  name: Schema.optional(Schema.String),
})
export type WorkspaceFileActionInput = typeof WorkspaceFileActionInput.Type

export const GitSnapshotInput = Schema.Struct({
  ...WorkspaceScope.fields,
  limit: Schema.Number.pipe(
    Schema.check(Schema.isInt()),
    Schema.check(Schema.isBetween({ minimum: 1, maximum: 2000 })),
  ),
})
export type GitSnapshotInput = typeof GitSnapshotInput.Type

export const GitDiffInput = Schema.Struct({
  ...WorkspaceFileInput.fields,
  side: Schema.optional(Schema.Literals(["staged", "unstaged"])),
  /** Includes every unchanged line so a viewer can fold and expand context itself. */
  context: Schema.optional(Schema.Literal("full")),
})
export type GitDiffInput = ExactOptional<typeof GitDiffInput.Type, "side" | "context">

export const GitCommitDiffInput = Schema.Struct({ ...WorkspaceScope.fields, hash: Schema.String })
export type GitCommitDiffInput = typeof GitCommitDiffInput.Type

export const GitFileActionInput = Schema.Struct({
  ...WorkspaceFileInput.fields,
  action: Schema.Literals(["stage", "unstage", "restore"]),
})
export type GitFileActionInput = typeof GitFileActionInput.Type

export const GitBulkActionInput = Schema.Struct({
  ...WorkspaceScope.fields,
  action: Schema.Literals(["stage", "unstage"]),
})
export type GitBulkActionInput = typeof GitBulkActionInput.Type

export const GitCommitInput = Schema.Struct({ ...WorkspaceScope.fields, message: Schema.String })
export type GitCommitInput = typeof GitCommitInput.Type

export const CreatePullRequestInput = Schema.Struct({
  ...WorkspaceScope.fields,
  title: Schema.String.pipe(Schema.check(Schema.isMaxLength(256))),
  body: Schema.String.pipe(Schema.check(Schema.isMaxLength(65_536))),
  draft: Schema.Boolean,
})
export type CreatePullRequestInput = ExactOptional<typeof CreatePullRequestInput.Type, "threadId">

/** Open issues in the workspace's GitHub repository; an empty query lists the most recently updated. */
export const ListIssuesInput = Schema.Struct({
  workspaceId: Schema.String,
  query: Schema.String.pipe(Schema.check(Schema.isMaxLength(256))),
})
export type ListIssuesInput = typeof ListIssuesInput.Type

/** A quick question about a thread, answered apart from it so its agent never sees it. */
export const SideQuestionInput = Schema.Struct({
  workspaceId: Schema.String,
  threadId: Schema.String,
  question: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(4_000)),
  ),
})
export type SideQuestionInput = typeof SideQuestionInput.Type

export type GenerateCommitMessageInput = ExactOptional<WorkspaceScope, "threadId">
export type GitFileAction = GitFileActionInput["action"]
export type GitDiffSide = Exclude<GitDiffInput["side"], undefined>

/** One turn of a thread, whose files were snapshotted when it started and when it finished. */
export const TurnSnapshotInput = Schema.Struct({
  workspaceId: Schema.String,
  threadId: Schema.String,
  turnId: Schema.String,
})
export type TurnSnapshotInput = typeof TurnSnapshotInput.Type

export const RestoreTurnSnapshotInput = Schema.Struct({
  ...TurnSnapshotInput.fields,
  /** `before` undoes the turn and everything after it; `after` returns to where it finished. */
  point: Schema.Literals(["before", "after"]),
})
export type RestoreTurnSnapshotInput = typeof RestoreTurnSnapshotInput.Type

export const UndoSnapshotRestoreInput = Schema.Struct({
  workspaceId: Schema.String,
  threadId: Schema.String,
})
export type UndoSnapshotRestoreInput = typeof UndoSnapshotRestoreInput.Type
