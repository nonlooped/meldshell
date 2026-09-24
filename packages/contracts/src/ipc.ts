import type {
  AppSnapshot,
  SearchTranscriptsInput,
  TranscriptSearchPage,
  CodexStatus,
  ClaudeStatus,
  CursorStatus,
  ProviderStatus,
  CodexUsage,
  CreateThreadInput,
  SetAppSettingsInput,
  SetThreadSettingsInput,
  SetThreadStatusInput,
  UpdateProviderInput,
  UpsertModelInput,
  ResolveApprovalInput,
  SubmitTurnInput,
  SubmitTurnResult,
  TranscriptPage,
  TranscriptQuery,
  InputAttachment,
  ThreadPage,
  ThreadPageQuery,
  ComposerCommand,
} from "./models"

export type ComposerAttachment = InputAttachment & { readonly previewUrl?: string }

/**
 * The folder a file or Git request reads. A thread with its own worktree names itself so the host
 * resolves that checkout; every other request reads the workspace folder.
 */
export interface WorkspaceScope {
  readonly workspaceId: string
  readonly threadId?: string | undefined
}
export interface WorkspaceFileInput extends WorkspaceScope {
  readonly path: string
}
export interface DirectoryEntry {
  readonly name: string
  readonly path: string
  readonly directory: boolean
  readonly status: string
}
export interface WorkspacePathMatch {
  /** Workspace-relative, `/`-separated; directories end with `/`. */
  readonly path: string
  readonly directory: boolean
}
export interface FilePreview {
  readonly kind: "text" | "markdown" | "html" | "image" | "unsupported"
  readonly content: string
}

export interface GitChange {
  readonly path: string
  readonly originalPath?: string
  readonly status: string
}

export interface GitCommit {
  readonly hash: string
  readonly parents: readonly string[]
  readonly subject: string
  readonly author: string
  readonly date: string
  readonly refs: string
}

export interface GitSnapshot {
  readonly root: string
  readonly branch: string
  readonly changes: readonly GitChange[]
  readonly commits: readonly GitCommit[]
  readonly hasMore: boolean
}

type AppUpdateState =
  | "unavailable"
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error"

export interface AppUpdateStatus {
  readonly state: AppUpdateState
  readonly currentVersion: string
  readonly availableVersion: string | null
  readonly progressPercent: number | null
  readonly message: string | null
}

export interface WorktreeStatus {
  readonly branch: string
  readonly baseBranch: string | null
  /** Uncommitted entries in the worktree, including untracked files. */
  readonly changes: number
  /** Commits on the thread branch that its base branch does not have; null without a base. */
  readonly unmerged: number | null
}

export type GitFileAction = "stage" | "unstage" | "restore"
export type GitDiffSide = "staged" | "unstaged"

interface Request<Invoke> {
  readonly channel: string
  readonly invoke?: Invoke
}

const request = <Invoke extends (...args: never[]) => Promise<unknown>>(
  channel: string,
): Request<Invoke> => ({ channel })

/** The whitelist and signatures for renderer invocation methods. */
export const requests = {
  getRemoteStatus:
    request<
      () => Promise<{
        linked: boolean
        account: { id: string; email: string; name: string } | null
        siteURL: string | null
        status: string
        linking: { userCode: string; verificationURL: string } | null
        error: string | null
      }>
    >("meldshell:remote-status"),
  linkRemote:
    request<() => Promise<{ userCode: string; verificationURL: string }>>("meldshell:link-remote"),
  openRemotePage: request<(page: "sign-in" | "dashboard") => Promise<void>>(
    "meldshell:open-remote-page",
  ),
  unlinkRemote: request<() => Promise<void>>("meldshell:unlink-remote"),
  retryRemote: request<() => Promise<void>>("meldshell:retry-remote"),
  getWebPageTitle: request<(url: string) => Promise<string | null>>("meldshell:get-web-page-title"),
  listDirectory: request<(input: WorkspaceFileInput) => Promise<readonly DirectoryEntry[]>>(
    "meldshell:list-directory",
  ),
  searchWorkspacePaths: request<
    (input: {
      workspaceId: string
      threadId?: string
      query: string
      limit?: number
    }) => Promise<readonly WorkspacePathMatch[]>
  >("meldshell:search-workspace-paths"),
  listComposerCommands: request<
    (input: WorkspaceScope & { harness: string }) => Promise<readonly ComposerCommand[]>
  >("meldshell:list-composer-commands"),
  readWorkspaceFile: request<(input: WorkspaceFileInput) => Promise<FilePreview>>(
    "meldshell:read-workspace-file",
  ),
  gitFileAction: request<
    (input: WorkspaceScope & { path: string; action: GitFileAction }) => Promise<void>
  >("meldshell:git-file-action"),
  gitCommit:
    request<(input: WorkspaceScope & { message: string }) => Promise<void>>("meldshell:git-commit"),
  gitPush: request<(input: WorkspaceScope) => Promise<void>>("meldshell:git-push"),
  generateCommitMessage: request<
    (input: { workspaceId: string; threadId?: string }) => Promise<string>
  >("meldshell:generate-commit-message"),
  getGitCommitDiff: request<(input: WorkspaceScope & { hash: string }) => Promise<string>>(
    "meldshell:get-git-commit-diff",
  ),
  getGitSnapshot: request<(input: WorkspaceScope & { limit: number }) => Promise<GitSnapshot>>(
    "meldshell:get-git-snapshot",
  ),
  getGitDiff:
    request<
      (
        input: WorkspaceScope & {
          path: string
          side?: GitDiffSide
          /** Includes every unchanged line so a viewer can fold and expand context itself. */
          context?: "full"
        },
      ) => Promise<string>
    >("meldshell:get-git-diff"),
  renameWorkspace: request<(input: { workspaceId: string; name: string }) => Promise<AppSnapshot>>(
    "meldshell:rename-workspace",
  ),
  removeWorkspace: request<(workspaceId: string) => Promise<AppSnapshot>>(
    "meldshell:remove-workspace",
  ),
  getWorktreeStatus: request<(threadId: string) => Promise<WorktreeStatus>>(
    "meldshell:get-worktree-status",
  ),
  /** Moves a thread that has not started onto its own branch, or back to the workspace folder. */
  setThreadIsolated: request<
    (input: { threadId: string; isolated: boolean }) => Promise<AppSnapshot>
  >("meldshell:set-thread-isolated"),
  mergeWorktree: request<(threadId: string) => Promise<void>>("meldshell:merge-worktree"),
  removeWorktree: request<
    (input: { threadId: string; deleteBranch: boolean }) => Promise<AppSnapshot>
  >("meldshell:remove-worktree"),
  setThreadPinned: request<(input: { threadId: string; pinned: boolean }) => Promise<AppSnapshot>>(
    "meldshell:set-thread-pinned",
  ),
  searchTranscripts: request<(input: SearchTranscriptsInput) => Promise<TranscriptSearchPage>>(
    "meldshell:search-transcripts",
  ),
  getSnapshot: request<() => Promise<AppSnapshot>>("meldshell:get-snapshot"),
  addWorkspace: request<() => Promise<AppSnapshot>>("meldshell:add-workspace"),
  createThread:
    request<(input: CreateThreadInput) => Promise<AppSnapshot>>("meldshell:create-thread"),
  setThreadStatus: request<(input: SetThreadStatusInput) => Promise<AppSnapshot>>(
    "meldshell:set-thread-status",
  ),
  deleteThread: request<(threadId: string) => Promise<AppSnapshot>>("meldshell:delete-thread"),
  updateProvider: request<(input: UpdateProviderInput) => Promise<AppSnapshot>>(
    "meldshell:update-provider",
  ),
  upsertModel: request<(input: UpsertModelInput) => Promise<AppSnapshot>>("meldshell:upsert-model"),
  deleteModel: request<(modelId: string) => Promise<AppSnapshot>>("meldshell:delete-model"),
  resetProviderCatalog: request<(providerId: string) => Promise<AppSnapshot>>(
    "meldshell:reset-provider-catalog",
  ),
  setThreadSettings: request<(input: SetThreadSettingsInput) => Promise<AppSnapshot>>(
    "meldshell:set-thread-settings",
  ),
  setAppSettings: request<(input: SetAppSettingsInput) => Promise<AppSnapshot>>(
    "meldshell:set-app-settings",
  ),
  getClaudeStatus: request<() => Promise<ClaudeStatus>>("meldshell:get-claude-status"),
  getCursorStatus: request<() => Promise<CursorStatus>>("meldshell:get-cursor-status"),
  refreshCursorStatus: request<() => Promise<void>>("meldshell:refresh-cursor-status"),
  refreshClaudeStatus: request<() => Promise<void>>("meldshell:refresh-claude-status"),
  getCodexStatus: request<() => Promise<CodexStatus>>("meldshell:get-codex-status"),
  getCodexUsage: request<() => Promise<CodexUsage>>("meldshell:get-codex-usage"),
  getClaudeUsage: request<() => Promise<CodexUsage>>("meldshell:get-claude-usage"),
  getCursorUsage: request<() => Promise<CodexUsage>>("meldshell:get-cursor-usage"),
  refreshCodexStatus: request<() => Promise<void>>("meldshell:refresh-codex-status"),
  closeApp: request<() => Promise<boolean>>("meldshell:close-app"),
  getUpdateStatus: request<() => Promise<AppUpdateStatus>>("meldshell:get-update-status"),
  checkForUpdates: request<() => Promise<AppUpdateStatus>>("meldshell:check-for-updates"),
  installUpdate: request<() => Promise<boolean>>("meldshell:install-update"),
  getTranscript: request<(input: TranscriptQuery) => Promise<TranscriptPage>>(
    "meldshell:get-transcript",
  ),
  submitTurn:
    request<(input: SubmitTurnInput) => Promise<SubmitTurnResult>>("meldshell:submit-turn"),
  interruptTurn: request<(threadId: string) => Promise<boolean>>("meldshell:interrupt-turn"),
  resolveApproval: request<(input: ResolveApprovalInput) => Promise<boolean>>(
    "meldshell:resolve-approval",
  ),
  selectAttachments: request<() => Promise<ReadonlyArray<ComposerAttachment>>>(
    "meldshell:select-attachments",
  ),
  listThreads: request<(input: ThreadPageQuery) => Promise<ThreadPage>>("meldshell:list-threads"),
}

export type InvokeApi = {
  [Key in keyof typeof requests]: NonNullable<(typeof requests)[Key]["invoke"]>
}

export const IPC = {
  ...(Object.fromEntries(
    Object.entries(requests).map(([name, request]) => [name, request.channel]),
  ) as {
    [Key in keyof typeof requests]: string
  }),
  providerStatusChanged: "meldshell:provider-status-changed",
  runtimeChanged: "meldshell:runtime-changed",
  attentionRequested: "meldshell:attention-requested",
  updateStatusChanged: "meldshell:update-status-changed",
} as const

export type MeldShellApi = InvokeApi & {
  readonly platform: string
  readonly onProviderStatus: (listener: (status: ProviderStatus) => void) => () => void
  readonly onCodexStatus: (listener: (status: CodexStatus) => void) => () => void
  readonly onRuntimeChanged: (
    listener: (threadId: string, snapshotChanged?: boolean) => void,
  ) => () => void
  readonly onOpenAttention: (listener: (threadId: string) => void) => () => void
  readonly onUpdateStatus: (listener: (status: AppUpdateStatus) => void) => () => void
}

/** Only registered methods cross the preload boundary; callers cannot choose arbitrary channels. */
export const createInvoker = (
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>,
): InvokeApi =>
  Object.fromEntries(
    Object.entries(requests).map(([name, request]) => [
      name,
      (...args: unknown[]) => invoke(request.channel, ...args),
    ]),
  ) as InvokeApi
