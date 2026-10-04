import type {
  WorkspaceScope,
  WorkspaceFileInput,
  WorkspaceFileActionInput,
  SearchWorkspacePathsInput,
  SearchWorkspaceContentsInput,
  GitFileActionInput,
  GitBulkActionInput,
  GitCommitInput,
  GenerateCommitMessageInput,
  CreatePullRequestInput,
  ListIssuesInput,
  GitCommitDiffInput,
  GitSnapshotInput,
  GitDiffInput,
  TurnSnapshotInput,
  SideQuestionInput,
  RestoreTurnSnapshotInput,
  UndoSnapshotRestoreInput,
  ForkThreadInput,
} from "./workspace-inputs"
export type {
  WorkspaceScope,
  WorkspaceFileInput,
  WorkspaceFileActionInput,
  SearchWorkspacePathsInput,
  SearchWorkspaceContentsInput,
  GitFileActionInput,
  GitBulkActionInput,
  GitCommitInput,
  GenerateCommitMessageInput,
  CreatePullRequestInput,
  ListIssuesInput,
  GitCommitDiffInput,
  GitSnapshotInput,
  GitDiffInput,
  GitFileAction,
  GitDiffSide,
  TurnSnapshotInput,
  SideQuestionInput,
  RestoreTurnSnapshotInput,
  UndoSnapshotRestoreInput,
  ForkThreadInput,
} from "./workspace-inputs"

import type { RemotePreviewInput, RemotePreviewFrame } from "./remote-preview"
import type { DictationStatus, TranscribeAudioInput } from "./dictation"

import type {
  AppSnapshot,
  SearchTranscriptsInput,
  TranscriptSearchPage,
  CodexStatus,
  ClaudeStatus,
  CursorStatus,
  PiStatus,
  ProviderStatus,
  CodexUsage,
  Harness,
  ProviderUpdateStatus,
  CreateThreadInput,
  SetAppSettingsInput,
  SetThreadSettingsInput,
  SetThreadStatusInput,
  RenameThreadInput,
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
  RewindResult,
  UndoRewindResult,
  ForkResult,
  TurnHandoff,
  ThreadIssue,
} from "./models"
import type { CliSessionList, ImportCliSessionInput, ImportedCliSession } from "./cli-sessions"

export type ComposerAttachment = InputAttachment & {
  readonly previewUrl?: string
  /**
   * Text sent with the message rather than shown in the composer, such as the HTML and styles of
   * an element picked in the preview.
   */
  readonly context?: string
}

export interface HostFolders {
  readonly path: string
  readonly parent: string | null
  readonly folders: readonly { name: string; path: string }[]
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
/** One line of a file that matches a content search. */
export interface ContentSearchLine {
  /** 1-based. */
  readonly line: number
  /** The line, trimmed and cut to a window around its first match. */
  readonly text: string
  /** Whether `text` starts partway into the line. */
  readonly clipped: boolean
  /** Matched character spans in `text`, as `[start, end)` offsets. */
  readonly ranges: ReadonlyArray<readonly [number, number]>
}
export interface ContentSearchFile {
  /** Workspace-relative, `/`-separated. */
  readonly path: string
  readonly lines: readonly ContentSearchLine[]
}
export interface ContentSearchResult {
  readonly files: readonly ContentSearchFile[]
  /** Matching lines across every file returned. */
  readonly lineCount: number
  /** The search stopped early, at the line limit or its time budget. */
  readonly truncated: boolean
}
export interface FilePreview {
  readonly kind: "text" | "markdown" | "html" | "image" | "video" | "unsupported"
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

export type PullRequestCheckState = "passed" | "failed" | "pending" | "skipped"

export interface PullRequestCheck {
  readonly name: string
  readonly state: PullRequestCheckState
  readonly url: string | null
}

export interface PullRequestReview {
  readonly author: string
  readonly state: "approved" | "changes-requested" | "commented"
}

export interface PullRequest {
  readonly number: number
  readonly title: string
  readonly url: string
  readonly state: "open" | "draft" | "merged" | "closed"
  readonly baseBranch: string
  /** GitHub's summary of the reviews the base branch requires; null when none are required. */
  readonly reviewDecision: "approved" | "changes-requested" | "review-required" | null
  readonly reviews: readonly PullRequestReview[]
  readonly checks: readonly PullRequestCheck[]
  readonly conflicts: boolean
}

/** What the checked-out branch can do on GitHub, read through the host's GitHub CLI. */
export interface PullRequestStatus {
  /** Null on a detached HEAD. */
  readonly branch: string | null
  /** The branch a new pull request targets. */
  readonly baseBranch: string | null
  /** Whether the branch has an upstream on a remote. */
  readonly published: boolean
  /** Commits on the branch that are not on its base, so a pull request has something to show. */
  readonly ahead: number
  /** Commits a push would publish; every commit ahead of the base when the branch is unpublished. */
  readonly unpushed: number
  /** Subjects of the newest commits ahead of the base, newest first, at most 20. */
  readonly commits: readonly string[]
  /** Why GitHub cannot be reached, as a sentence; null when the GitHub CLI answered. */
  readonly unavailable: string | null
  readonly pullRequest: PullRequest | null
  /** The issue the thread started from, which a new pull request closes. */
  readonly issue: ThreadIssue | null
}

interface IssueLabel {
  readonly name: string
  /** Hex without the leading `#`, as GitHub stores it. */
  readonly color: string
}

/** An open issue as the issue picker lists it. */
export interface IssueSummary {
  readonly number: number
  readonly title: string
  readonly url: string
  readonly author: string
  readonly labels: readonly IssueLabel[]
  readonly updatedAt: string
}

export interface IssueList {
  readonly issues: readonly IssueSummary[]
  /** Why GitHub cannot be reached, as a sentence; null when the GitHub CLI answered. */
  readonly unavailable: string | null
}

export interface PullRequestDraft {
  readonly title: string
  readonly body: string
}

/** What a turn's snapshots hold; a folder outside Git, or a turn from before snapshots, has none. */
export interface TurnSnapshot {
  /** The files were snapshotted when the turn started, so they can be restored to that point. */
  readonly before: boolean
  /** The files were snapshotted when the turn finished. */
  readonly after: boolean
  /** Every change between the two snapshots, including edits made by shell commands. */
  readonly patch: string | null
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
  /** Continues the thread's session in its harness's CLI in the new shell. */
  readonly cli?: boolean
}

export interface TerminalSession {
  /** Enables ConPTY handling only for a native Windows host. */
  readonly windowsPty?: boolean
  readonly cwd: string
  readonly shell: string
  /** The run script, or the CLI command, the shell was started with. */
  readonly run?: RunScript
}

/** Shells run in the host environment, including for remote browsers. */
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

export type DesktopMode = "windows" | "wsl"

export interface DesktopEnvironment {
  readonly mode: DesktopMode
  readonly distribution: string | null
}

/** Host desktop actions. Remote clients route host actions and open external links in their browser. */
interface DesktopApi {
  readonly environment?: {
    readonly get: () => Promise<DesktopEnvironment | null>
    readonly switch: (mode: DesktopMode) => Promise<boolean>
  }
  /**
   * Editors found on this workstation, in a stable order, followed by the file manager. Remote
   * clients omit this: an editor would open on a screen the remote user cannot see.
   */
  readonly listEditors?: () => Promise<readonly ExternalEditor[]>
  /** Opens the folder a thread works in, or the workspace folder, in the chosen editor. */
  readonly openInEditor?: (input: WorkspaceScope & { editorId: string }) => Promise<void>
  readonly revealFile?: (input: WorkspaceFileInput) => Promise<void>
  /** The first of the ports assigned to a thread, as scripts receive it in `MELDSHELL_PORT`. */
  readonly threadPort: (threadId: string) => Promise<number>
  /** Opens an http or https address in the system browser. */
  readonly openExternal: (url: string) => Promise<void>
  /**
   * How many threads wait on the operator, shown on the taskbar icon; the window also flashes once
   * when the count rises while it is in the background.
   */
  readonly setAttention?: (count: number) => void
  /** Agents driving a thread's browser preview, on desktops whose host runs locally. */
  readonly agentBrowser?: AgentBrowserApi
  /** Threads popped out into windows of their own, as on a second monitor. */
  readonly threadWindows?: ThreadWindowsApi
  /** Picking elements in a preview page to describe them to an agent. */
  readonly designMode?: DesignModeApi
}

interface ThreadWindowsApi {
  /** Opens a thread in its own window, or brings that window forward when it is already open. */
  readonly open: (threadId: string) => Promise<void>
  /** Closes a thread's own window and shows the thread in the main window again. */
  readonly dock: (threadId: string) => Promise<void>
  /** The threads that have a window of their own. */
  readonly list: () => Promise<readonly string[]>
  readonly onChange: (listener: (threadIds: readonly string[]) => void) => () => void
}

/** An element the user clicked in a preview page with design mode. */
export interface PickedElement {
  /** The page's address. */
  readonly url: string
  /** The tag with its id or first classes, such as `button.cta`. */
  readonly label: string
  /** A CSS selector that finds the element from the document. */
  readonly selector: string
  readonly width: number
  readonly height: number
  /** The element's HTML, shortened when it is long. */
  readonly html: string
  /** The element's visible text, shortened. */
  readonly text: string
  /** Computed styles that differ from their usual defaults, as property and value. */
  readonly styles: readonly (readonly [string, string])[]
  /** A PNG data URL of the element as the page shows it, or null when it could not be captured. */
  readonly screenshot: string | null
  /** The user shift-clicked, asking to pick another element after this one. */
  readonly more: boolean
}

interface DesignModeApi {
  /**
   * Lets the user hover and click an element in a preview page, outlining it in `accent`. Resolves
   * with the element, or null when picking is cancelled or the page navigates away.
   */
  readonly pick: (webContentsId: number, accent: string) => Promise<PickedElement | null>
  readonly cancel: (webContentsId: number) => void
}

/** What an agent is doing in a thread's preview, and where on the page when it points somewhere. */
export interface AgentBrowserActivity {
  readonly label: string
  readonly point?: { readonly x: number; readonly y: number }
}

interface AgentBrowserApi {
  /** Names the page a thread's preview shows, so agents act on what the user sees. */
  readonly attach: (threadId: string, webContentsId: number) => void
  /** An agent opened an address in a thread's preview. */
  readonly onShow: (listener: (threadId: string, url: string) => void) => () => void
  readonly onActivity: (
    listener: (threadId: string, activity: AgentBrowserActivity) => void,
  ) => () => void
}

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
        desktop?: boolean
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
    (input: SearchWorkspacePathsInput) => Promise<readonly WorkspacePathMatch[]>
  >("meldshell:search-workspace-paths"),
  searchWorkspaceContents: request<
    (input: SearchWorkspaceContentsInput) => Promise<ContentSearchResult>
  >("meldshell:search-workspace-contents"),
  listComposerCommands: request<
    (input: WorkspaceScope & { harness: string }) => Promise<readonly ComposerCommand[]>
  >("meldshell:list-composer-commands"),
  readWorkspaceFile: request<(input: WorkspaceFileInput) => Promise<FilePreview>>(
    "meldshell:read-workspace-file",
  ),
  workspaceAbsolutePath: request<(input: WorkspaceFileInput) => Promise<string>>(
    "meldshell:workspace-absolute-path",
  ),
  workspaceFileAction: request<(input: WorkspaceFileActionInput) => Promise<void>>(
    "meldshell:workspace-file-action",
  ),
  gitFileAction: request<(input: GitFileActionInput) => Promise<void>>("meldshell:git-file-action"),
  gitBulkAction: request<(input: GitBulkActionInput) => Promise<void>>("meldshell:git-bulk-action"),
  gitCommit: request<(input: GitCommitInput) => Promise<void>>("meldshell:git-commit"),
  gitPush: request<(input: WorkspaceScope) => Promise<void>>("meldshell:git-push"),
  getPullRequest: request<(input: WorkspaceScope) => Promise<PullRequestStatus>>(
    "meldshell:get-pull-request",
  ),
  markPullRequestReady: request<(input: WorkspaceScope) => Promise<PullRequestStatus>>(
    "meldshell:mark-pull-request-ready",
  ),
  generatePullRequest: request<(input: WorkspaceScope) => Promise<PullRequestDraft>>(
    "meldshell:generate-pull-request",
  ),
  createPullRequest: request<(input: CreatePullRequestInput) => Promise<PullRequestStatus>>(
    "meldshell:create-pull-request",
  ),
  listIssues: request<(input: ListIssuesInput) => Promise<IssueList>>("meldshell:list-issues"),
  /** The agent CLI sessions started in a terminal in a workspace's folder. */
  listCliSessions: request<(workspaceId: string) => Promise<CliSessionList>>(
    "meldshell:list-cli-sessions",
  ),
  /** Brings a CLI session in as a thread, or returns the thread that already holds it. */
  importCliSession: request<(input: ImportCliSessionInput) => Promise<ImportedCliSession>>(
    "meldshell:import-cli-session",
  ),
  generateCommitMessage: request<(input: GenerateCommitMessageInput) => Promise<string>>(
    "meldshell:generate-commit-message",
  ),
  getGitCommitDiff: request<(input: GitCommitDiffInput) => Promise<string>>(
    "meldshell:get-git-commit-diff",
  ),
  getGitSnapshot: request<(input: GitSnapshotInput) => Promise<GitSnapshot>>(
    "meldshell:get-git-snapshot",
  ),
  getGitDiff: request<(input: GitDiffInput) => Promise<string>>("meldshell:get-git-diff"),
  getTurnSnapshot: request<(input: TurnSnapshotInput) => Promise<TurnSnapshot>>(
    "meldshell:get-turn-snapshot",
  ),
  restoreTurnSnapshot: request<(input: RestoreTurnSnapshotInput) => Promise<void>>(
    "meldshell:restore-turn-snapshot",
  ),
  undoSnapshotRestore: request<(input: UndoSnapshotRestoreInput) => Promise<void>>(
    "meldshell:undo-snapshot-restore",
  ),
  /** What the thread's next turn would be told about work its agent has not seen. */
  previewHandoff: request<(threadId: string) => Promise<TurnHandoff | null>>(
    "meldshell:preview-handoff",
  ),
  /** Answers a side question about a thread without adding it to the thread or its agent's context. */
  askSideQuestion: request<(input: SideQuestionInput) => Promise<string>>(
    "meldshell:ask-side-question",
  ),
  /** Takes a thread back to before a turn: its conversation, and its files when snapshotted. */
  rewindThread:
    request<(input: TurnSnapshotInput) => Promise<RewindResult>>("meldshell:rewind-thread"),
  undoRewind:
    request<(input: UndoSnapshotRestoreInput) => Promise<UndoRewindResult>>(
      "meldshell:undo-rewind",
    ),
  /**
   * Starts a new thread on its own worktree from a point in another thread: the turns up to there,
   * and the files as they were there when snapshotted. The original thread is left as it is.
   */
  forkThread: request<(input: ForkThreadInput) => Promise<ForkResult>>("meldshell:fork-thread"),
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
  /** Records that the thread is on screen now, so its latest work no longer counts as new. */
  markThreadSeen: request<(input: { threadId: string }) => Promise<AppSnapshot>>(
    "meldshell:mark-thread-seen",
  ),
  searchTranscripts: request<(input: SearchTranscriptsInput) => Promise<TranscriptSearchPage>>(
    "meldshell:search-transcripts",
  ),
  getSnapshot: request<() => Promise<AppSnapshot>>("meldshell:get-snapshot"),
  addWorkspace: request<() => Promise<AppSnapshot>>("meldshell:add-workspace"),
  browseHostFolders: request<(path: string) => Promise<HostFolders>>(
    "meldshell:browse-host-folders",
  ),
  addWorkspacePath: request<(path: string) => Promise<AppSnapshot>>("meldshell:add-workspace-path"),
  createThread:
    request<(input: CreateThreadInput) => Promise<AppSnapshot>>("meldshell:create-thread"),
  setThreadStatus: request<(input: SetThreadStatusInput) => Promise<AppSnapshot>>(
    "meldshell:set-thread-status",
  ),
  renameThread:
    request<(input: RenameThreadInput) => Promise<AppSnapshot>>("meldshell:rename-thread"),
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
  getPiStatus: request<() => Promise<PiStatus>>("meldshell:get-pi-status"),
  refreshPiStatus: request<() => Promise<void>>("meldshell:refresh-pi-status"),
  getPiUsage: request<() => Promise<CodexUsage>>("meldshell:get-pi-usage"),
  refreshCodexStatus: request<() => Promise<void>>("meldshell:refresh-codex-status"),
  getProviderUpdate: request<(harness: Harness) => Promise<ProviderUpdateStatus>>(
    "meldshell:get-provider-update",
  ),
  /** Compares the installed harness with its latest release; the result also arrives as an event. */
  checkProviderUpdate: request<(harness: Harness) => Promise<ProviderUpdateStatus>>(
    "meldshell:check-provider-update",
  ),
  /** Starts the harness's update; progress and the outcome arrive as `onProviderUpdate` events. */
  installProviderUpdate: request<(harness: Harness) => Promise<ProviderUpdateStatus>>(
    "meldshell:install-provider-update",
  ),
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
  removeQueuedInput: request<(id: number) => Promise<AppSnapshot>>("meldshell:remove-queued-input"),
  steerQueuedInput: request<(id: number) => Promise<AppSnapshot>>("meldshell:steer-queued-input"),
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
  getDictationStatus: request<() => Promise<DictationStatus>>("meldshell:get-dictation-status"),
  /** Downloads and loads the chosen speech model ahead of the first transcription. */
  prepareDictation: request<() => Promise<DictationStatus>>("meldshell:prepare-dictation"),
  /** Turns a composer recording into text on the host. */
  transcribeAudio: request<(input: TranscribeAudioInput) => Promise<{ readonly text: string }>>(
    "meldshell:transcribe-audio",
  ),
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
  providerUpdateChanged: "meldshell:provider-update-changed",
  runtimeChanged: "meldshell:runtime-changed",
  attentionRequested: "meldshell:attention-requested",
  updateStatusChanged: "meldshell:update-status-changed",
  terminalOpen: "meldshell:terminal-open",
  terminalWrite: "meldshell:terminal-write",
  terminalResize: "meldshell:terminal-resize",
  terminalClose: "meldshell:terminal-close",
  terminalData: "meldshell:terminal-data",
  terminalExit: "meldshell:terminal-exit",
  getDesktopEnvironment: "meldshell:get-desktop-environment",
  switchDesktopEnvironment: "meldshell:switch-desktop-environment",
  listEditors: "meldshell:list-editors",
  openInEditor: "meldshell:open-in-editor",
  revealFile: "meldshell:reveal-file",
  threadPort: "meldshell:thread-port",
  openExternal: "meldshell:open-external",
  setAttention: "meldshell:set-attention",
  agentBrowserAttach: "meldshell:agent-browser-attach",
  agentBrowserShow: "meldshell:agent-browser-show",
  agentBrowserActivity: "meldshell:agent-browser-activity",
  openThreadWindow: "meldshell:open-thread-window",
  dockThreadWindow: "meldshell:dock-thread-window",
  listThreadWindows: "meldshell:list-thread-windows",
  threadWindowsChanged: "meldshell:thread-windows-changed",
  designModePick: "meldshell:design-mode-pick",
  designModeCancel: "meldshell:design-mode-cancel",
} as const

export type MeldShellApi = InvokeApi & {
  readonly platform: string
  readonly onProviderStatus: (listener: (status: ProviderStatus) => void) => () => void
  readonly onProviderUpdate: (listener: (status: ProviderUpdateStatus) => void) => () => void
  readonly onRuntimeChanged: (
    listener: (threadId: string, snapshotChanged?: boolean) => void,
  ) => () => void
  readonly onOpenAttention: (listener: (threadId: string) => void) => () => void
  readonly onUpdateStatus: (listener: (status: AppUpdateStatus) => void) => () => void
  readonly remotePreview?: (input: RemotePreviewInput) => Promise<RemotePreviewFrame | null>
  readonly hostControl?: {
    readonly restart: () => Promise<void>
    readonly shutdown: () => Promise<void>
  }
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
