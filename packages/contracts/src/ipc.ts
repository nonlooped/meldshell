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
  SaveScheduleInput,
  ScheduledPrompt,
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

/** Nightly builds are hourly prereleases; stable builds are the daily releases. */
export type UpdateChannel = "stable" | "nightly"

export interface AppUpdateStatus {
  readonly state: AppUpdateState
  readonly currentVersion: string
  readonly channel: UpdateChannel
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

export interface RunScript {
  readonly name: string
  readonly command: string
}

/** The scripts in a workspace's `meldshell.json`. */
export interface WorkspaceScripts {
  /** Null when the workspace has no setup script. */
  readonly setup: string | null
  /** In the file's order; a lone `run` command is named `run`. */
  readonly run: readonly RunScript[]
}

export interface WorktreeSetupLog {
  readonly text: string
  /** Only the end of a long log is returned. */
  readonly truncated: boolean
}

export interface TerminalOpenInput {
  /** Chosen by the renderer so output that arrives before `open` resolves still finds its view. */
  readonly id: string
  readonly workspaceId: string
  readonly threadId: string
  readonly cols: number
  readonly rows: number
  /** Starts the workspace run script with this name in the new shell. */
  readonly run?: string
}

export interface TerminalSession {
  readonly cwd: string
  readonly shell: string
  /** The run script the shell was started with. */
  readonly run?: RunScript
}

/** Shells run on the workstation only; a remote client leaves `MeldShellApi.terminal` undefined. */
interface TerminalApi {
  readonly open: (input: TerminalOpenInput) => Promise<TerminalSession>
  readonly write: (id: string, data: string) => void
  readonly resize: (id: string, cols: number, rows: number) => void
  readonly close: (id: string) => void
  readonly onData: (listener: (id: string, data: string) => void) => () => void
  readonly onExit: (listener: (id: string, exitCode: number) => void) => () => void
}

/** An application on the workstation that can open a folder, such as a code editor. */
export interface ExternalEditor {
  readonly id: string
  readonly name: string
}

/** Workstation-only actions; a remote client leaves `MeldShellApi.desktop` undefined. */
interface DesktopApi {
  /** Editors found on this workstation, in a stable order, followed by the file manager. */
  readonly listEditors: () => Promise<readonly ExternalEditor[]>
  /** Opens the folder a thread works in, or the workspace folder, in the chosen editor. */
  readonly openInEditor: (input: WorkspaceScope & { editorId: string }) => Promise<void>
  /** The first of the ports assigned to a thread, as scripts receive it in `MELDSHELL_PORT`. */
  readonly threadPort: (threadId: string) => Promise<number>
  /** Opens an http or https address in the system browser. */
  readonly openExternal: (url: string) => Promise<void>
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
  /** Moves a thread that has not started to another workspace, onto its own branch, or both. */
  setDraftLocation: request<
    (input: { threadId: string; workspaceId?: string; isolated?: boolean }) => Promise<AppSnapshot>
  >("meldshell:set-draft-location"),
  mergeWorktree: request<(threadId: string) => Promise<void>>("meldshell:merge-worktree"),
  getWorkspaceScripts: request<(input: WorkspaceScope) => Promise<WorkspaceScripts>>(
    "meldshell:get-workspace-scripts",
  ),
  getWorktreeSetupLog: request<(threadId: string) => Promise<WorktreeSetupLog>>(
    "meldshell:get-worktree-setup-log",
  ),
  /** Runs the setup script again in a thread's worktree, replacing its previous log. */
  rerunWorktreeSetup: request<(threadId: string) => Promise<AppSnapshot>>(
    "meldshell:rerun-worktree-setup",
  ),
  stopWorktreeSetup: request<(threadId: string) => Promise<AppSnapshot>>(
    "meldshell:stop-worktree-setup",
  ),
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
  setUpdateChannel: request<(channel: UpdateChannel) => Promise<AppUpdateStatus>>(
    "meldshell:set-update-channel",
  ),
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
  /** Every scheduled prompt, or one thread's, soonest first. */
  listSchedules: request<(input: { threadId?: string }) => Promise<readonly ScheduledPrompt[]>>(
    "meldshell:list-schedules",
  ),
  saveSchedule:
    request<(input: SaveScheduleInput) => Promise<ScheduledPrompt>>("meldshell:save-schedule"),
  deleteSchedule: request<(scheduleId: string) => Promise<void>>("meldshell:delete-schedule"),
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
  terminalOpen: "meldshell:terminal-open",
  terminalWrite: "meldshell:terminal-write",
  terminalResize: "meldshell:terminal-resize",
  terminalClose: "meldshell:terminal-close",
  terminalData: "meldshell:terminal-data",
  terminalExit: "meldshell:terminal-exit",
  listEditors: "meldshell:list-editors",
  openInEditor: "meldshell:open-in-editor",
  threadPort: "meldshell:thread-port",
  openExternal: "meldshell:open-external",
} as const

export type MeldShellApi = InvokeApi & {
  readonly platform: string
  readonly onProviderStatus: (listener: (status: ProviderStatus) => void) => () => void
  readonly onRuntimeChanged: (
    listener: (threadId: string, snapshotChanged?: boolean) => void,
  ) => () => void
  readonly onOpenAttention: (listener: (threadId: string) => void) => () => void
  readonly onUpdateStatus: (listener: (status: AppUpdateStatus) => void) => () => void
  readonly terminal?: TerminalApi
  readonly desktop?: DesktopApi
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
