import { Schema } from "effect"

export const Workspace = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  name: Schema.String,
  createdAt: Schema.String,
  lastOpenedAt: Schema.String,
})

export type Workspace = typeof Workspace.Type

const ThreadStatus = Schema.Literal("active", "settled")

/** Progress of the workspace setup script in a thread's worktree. */
export const WorktreeSetup = Schema.Literal("running", "succeeded", "failed", "interrupted")

export type WorktreeSetup = typeof WorktreeSetup.Type

/** A thread's own branch and checkout, created from the workspace so parallel threads cannot collide. */
export const ThreadWorktree = Schema.Struct({
  path: Schema.String,
  branch: Schema.String,
  /** The branch the workspace had checked out when the thread began, or null when it was detached. */
  baseBranch: Schema.NullOr(Schema.String),
  /** `missing` means the folder disappeared outside MeldShell; `removed` means MeldShell removed it. */
  state: Schema.Literal("ready", "missing", "removed"),
  /**
   * The workspace setup script's last run in this worktree; absent when none has run. `interrupted`
   * means it was stopped, or MeldShell quit, before it finished.
   */
  setup: Schema.optional(WorktreeSetup),
})

export type ThreadWorktree = typeof ThreadWorktree.Type

export const Thread = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  title: Schema.String,
  status: ThreadStatus,
  pinned: Schema.optional(Schema.Boolean),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  activity: Schema.Literal(
    "idle",
    "running",
    "queued",
    "approval",
    "failed",
    "completed",
    "interrupted",
  ),
  queuedCount: Schema.Number,
  turnCount: Schema.Number,
  worktree: Schema.optional(ThreadWorktree),
})

export type Thread = typeof Thread.Type

export const CanonicalEventKind = Schema.Literal(
  "user",
  "assistant",
  "reasoning",
  "plan",
  "command",
  "file-change",
  "tool",
  "approval",
  "usage",
  "error",
  "status",
  "unknown",
)

export type CanonicalEventKind = typeof CanonicalEventKind.Type

export const CanonicalEvent = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  turnId: Schema.NullOr(Schema.String),
  sequence: Schema.Number,
  kind: CanonicalEventKind,
  method: Schema.String,
  text: Schema.NullOr(Schema.String),
  payload: Schema.Unknown,
  createdAt: Schema.String,
})

export type CanonicalEvent = typeof CanonicalEvent.Type

const InteractionFields = {
  approvalScope: Schema.optional(Schema.Literal("turn", "session")),
  id: Schema.String,
  threadId: Schema.String,
  turnId: Schema.String,
  requestId: Schema.Union(Schema.String, Schema.Number),
  title: Schema.String,
  detail: Schema.String,
  createdAt: Schema.String,
}

const UserInputQuestion = Schema.Struct({
  id: Schema.String,
  header: Schema.String,
  question: Schema.String,
  isSecret: Schema.optional(Schema.Boolean),
  multiSelect: Schema.optional(Schema.Boolean),
  isOther: Schema.optional(Schema.Boolean),
  multiline: Schema.optional(Schema.Boolean),
  defaultValue: Schema.optional(Schema.String),
  options: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          label: Schema.String,
          description: Schema.String,
          value: Schema.optional(Schema.String),
        }),
      ),
    ),
  ),
})

export const ApprovalRequest = Schema.Union(
  Schema.Struct({
    ...InteractionFields,
    kind: Schema.Literal("cursor-permission"),
    method: Schema.Literal("cursor/acp/session/request_permission"),
    params: Schema.Unknown,
    options: Schema.Array(
      Schema.Struct({ optionId: Schema.String, name: Schema.String, kind: Schema.String }),
    ),
  }),
  Schema.Struct({
    ...InteractionFields,
    kind: Schema.Literal("cursor-plan"),
    method: Schema.Literal("cursor/create_plan"),
    plan: Schema.String,
    params: Schema.Unknown,
  }),
  Schema.Struct({
    ...InteractionFields,
    kind: Schema.Literal("command"),
    method: Schema.Literal("item/commandExecution/requestApproval"),
    params: Schema.Unknown,
  }),
  Schema.Struct({
    ...InteractionFields,
    kind: Schema.Literal("file-change"),
    method: Schema.Literal("item/fileChange/requestApproval"),
    params: Schema.Unknown,
  }),
  Schema.Struct({
    ...InteractionFields,
    kind: Schema.Literal("user-input"),
    method: Schema.Literal("item/tool/requestUserInput", "cursor/ask_question"),
    questions: Schema.Array(UserInputQuestion),
  }),
  Schema.Struct({
    ...InteractionFields,
    kind: Schema.Literal("permissions"),
    method: Schema.Literal("item/permissions/requestApproval"),
    permissions: Schema.Unknown,
  }),
)

export type ApprovalRequest = typeof ApprovalRequest.Type

/**
 * Reasoning effort is a harness concept, not a model concept: the same model accepts a different
 * subset depending on the harness release, so each catalog entry carries its own supported list.
 */
// Codex deliberately advertises this as a non-empty string so new effort levels do not require a
// MeldShell release. The known values only drive the manual-model editor's suggested choices.
export const ReasoningEffort = Schema.String

export type ReasoningEffort = typeof ReasoningEffort.Type

export const REASONING_EFFORTS: ReadonlyArray<ReasoningEffort> = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]

/** Use the advertised default, then medium, then the lower middle of the supplied order. */
export const defaultReasoningEffort = (
  efforts: ReadonlyArray<ReasoningEffort>,
  advertisedDefault: ReasoningEffort | null = null,
): ReasoningEffort | null => {
  if (advertisedDefault !== null && efforts.includes(advertisedDefault)) return advertisedDefault
  if (efforts.includes("medium")) return "medium"
  return efforts[Math.floor((efforts.length - 1) / 2)] ?? null
}

/** Codex exposes a latency/throughput tier alongside reasoning effort. */
const ModelSpeed = Schema.Literal("standard", "fast")

export const CollaborationMode = Schema.Literal("default", "plan", "ask")

export type CollaborationMode = typeof CollaborationMode.Type

export const SandboxMode = Schema.Literal("read-only", "workspace-write", "danger-full-access")

export type SandboxMode = typeof SandboxMode.Type

export const ApprovalPolicy = Schema.Literal("untrusted", "on-request", "never")

export type ApprovalPolicy = typeof ApprovalPolicy.Type

export const Provider = Schema.Struct({
  id: Schema.String,
  /** Stable vendor key. Never edited by the user; `displayName` is the editable label. */
  key: Schema.String,
  harness: Schema.String,
  displayName: Schema.String,
  enabled: Schema.Boolean,
  sortOrder: Schema.Number,
  /** Seeded providers cannot be deleted, only disabled and relabelled. */
  builtIn: Schema.Boolean,
})

export type Provider = typeof Provider.Type

const ModelServiceTier = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
})

/** Provider-owned model data returned by a harness discovery endpoint. */
export const ProviderModelCatalogEntry = Schema.Struct({
  catalogId: Schema.String,
  slug: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  reasoningEfforts: Schema.Array(ReasoningEffort),
  defaultReasoningEffort: Schema.NullOr(ReasoningEffort),
  serviceTiers: Schema.Array(ModelServiceTier),
  defaultServiceTier: Schema.NullOr(Schema.String),
  additionalSpeedTiers: Schema.Array(Schema.String),
  fastServiceTier: Schema.NullOr(Schema.String),
  inputModalities: Schema.Array(Schema.String),
  supportsPersonality: Schema.Boolean,
  isDefault: Schema.Boolean,
  hidden: Schema.Boolean,
  upgrade: Schema.NullOr(Schema.String),
  modelSpecialty: Schema.NullOr(Schema.String),
  multiAgentVersion: Schema.NullOr(Schema.String),
})

export type ProviderModelCatalogEntry = typeof ProviderModelCatalogEntry.Type

export const ProviderModel = Schema.Struct({
  id: Schema.String,
  providerId: Schema.String,
  /** The identifier sent to the harness, for example `gpt-5.1-codex`. */
  slug: Schema.String,
  catalogId: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  reasoningEfforts: Schema.Array(ReasoningEffort),
  defaultReasoningEffort: Schema.NullOr(ReasoningEffort),
  serviceTiers: Schema.Array(ModelServiceTier),
  defaultServiceTier: Schema.NullOr(Schema.String),
  additionalSpeedTiers: Schema.Array(Schema.String),
  fastServiceTier: Schema.NullOr(Schema.String),
  inputModalities: Schema.Array(Schema.String),
  supportsPersonality: Schema.Boolean,
  isDefault: Schema.Boolean,
  upgrade: Schema.NullOr(Schema.String),
  modelSpecialty: Schema.NullOr(Schema.String),
  multiAgentVersion: Schema.NullOr(Schema.String),
  supportsFast: Schema.Boolean,
  /** Disabled models cannot be selected for a turn. */
  enabled: Schema.Boolean,
  /** Hidden models stay selectable but are collapsed out of the composer's default list. */
  hidden: Schema.Boolean,
  sortOrder: Schema.Number,
  builtIn: Schema.Boolean,
})

export type ProviderModel = typeof ProviderModel.Type

export const ThreadSettings = Schema.Struct({
  threadId: Schema.String,
  providerId: Schema.String,
  modelId: Schema.NullOr(Schema.String),
  reasoningEffort: Schema.NullOr(ReasoningEffort),
  speed: ModelSpeed,
  mode: CollaborationMode,
  sandbox: SandboxMode,
  approvalPolicy: ApprovalPolicy,
})

export type ThreadSettings = typeof ThreadSettings.Type

/**
 * Chooses the model that names threads. The sentinel keeps title generation on whatever model the
 * thread's composer is set to, so a user who switches models never has to revisit this setting.
 */
export const CURRENT_TITLE_MODEL = "current"

export const AppOpacity = Schema.Number.pipe(Schema.int(), Schema.between(20, 100))

export const AppSettings = Schema.Struct({
  opacity: Schema.optional(AppOpacity),
  showSettled: Schema.optional(Schema.Boolean),
  theme: Schema.optional(Schema.Literal("dark", "light", "system")),
  transcriptSize: Schema.optional(Schema.Literal("small", "medium", "large")),
  reduceMotion: Schema.optional(Schema.Boolean),
  /** Chimes when a thread finishes or needs attention out of view. */
  sounds: Schema.optional(Schema.Boolean),
  /** The external editor that opens a thread's folder; an `ExternalEditor` id. */
  editor: Schema.optional(Schema.String),

  /** A `ProviderModel` id, or `CURRENT_TITLE_MODEL`. */
  titleModelId: Schema.String,
})

export type AppSettings = typeof AppSettings.Type

export const AppSnapshot = Schema.Struct({
  workspaces: Schema.Array(Workspace),
  threads: Schema.Array(Thread),
  providers: Schema.Array(Provider),
  models: Schema.Array(ProviderModel),
  threadSettings: Schema.Array(ThreadSettings),
  approvals: Schema.Array(ApprovalRequest),
  settings: AppSettings,
})

export type AppSnapshot = typeof AppSnapshot.Type

const ProviderAvailability = Schema.Literal(
  "probing",
  "missing",
  "unauthenticated",
  "outdated",
  "ready",
  "error",
)

export const CodexStatus = Schema.Struct({
  provider: Schema.Literal("openai"),
  harness: Schema.Literal("codex"),
  availability: ProviderAvailability,
  executablePath: Schema.NullOr(Schema.String),
  version: Schema.NullOr(Schema.String),
  detail: Schema.String,
  /** The signed-in account for the harness, when it reports one. Never an API key or token. */
  accountEmail: Schema.optional(Schema.NullOr(Schema.String)),
  checkedAt: Schema.String,
})

export type CodexStatus = typeof CodexStatus.Type

export const ClaudeStatus = Schema.Struct({
  ...CodexStatus.fields,
  provider: Schema.Literal("anthropic"),
  harness: Schema.Literal("claude-code"),
})

export type ClaudeStatus = typeof ClaudeStatus.Type

export const CursorStatus = Schema.Struct({
  ...CodexStatus.fields,
  provider: Schema.Literal("cursor"),
  harness: Schema.Literal("cursor"),
})

export type CursorStatus = typeof CursorStatus.Type

export const ProviderStatus = Schema.Union(CodexStatus, ClaudeStatus, CursorStatus)

export type ProviderStatus = typeof ProviderStatus.Type

export const UsageWindow = Schema.Struct({
  label: Schema.optional(Schema.String),
  usedPercent: Schema.Number.pipe(Schema.finite()),
  windowDurationMins: Schema.optional(Schema.NullOr(Schema.Number.pipe(Schema.finite()))),
  resetsAt: Schema.optional(Schema.NullOr(Schema.Number.pipe(Schema.finite()))),
})

export type UsageWindow = typeof UsageWindow.Type

export const UsageLimit = Schema.Struct({
  limitId: Schema.optional(Schema.NullOr(Schema.String)),
  limitName: Schema.optional(Schema.NullOr(Schema.String)),
  planType: Schema.optional(Schema.NullOr(Schema.String)),
  primary: Schema.optional(Schema.NullOr(UsageWindow)),
  secondary: Schema.optional(Schema.NullOr(UsageWindow)),
  credits: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        hasCredits: Schema.Boolean,
        unlimited: Schema.Boolean,
        balance: Schema.optional(Schema.NullOr(Schema.String)),
      }),
    ),
  ),
  individualLimit: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        limit: Schema.String,
        used: Schema.String,
        remainingPercent: Schema.Number.pipe(Schema.finite()),
        resetsAt: Schema.Number.pipe(Schema.finite()),
      }),
    ),
  ),
  rateLimitReachedType: Schema.optional(Schema.NullOr(Schema.String)),
  spendControlReached: Schema.optional(Schema.NullOr(Schema.Boolean)),
})

export type UsageLimit = typeof UsageLimit.Type

export const CodexUsage = Schema.Struct({
  checkedAt: Schema.String,
  limits: Schema.Array(Schema.Struct({ id: Schema.String, limit: UsageLimit })),
  resetCredits: Schema.NullOr(Schema.Number.pipe(Schema.finite())),
})

export type CodexUsage = typeof CodexUsage.Type

export const CreateThreadInput = Schema.Struct({
  workspaceId: Schema.String,
  title: Schema.optional(Schema.String),
  /** Gives the thread its own branch and worktree instead of the workspace checkout. */
  isolated: Schema.optional(Schema.Boolean),
})

export type CreateThreadInput = typeof CreateThreadInput.Type

/** The core's record of a new thread. Only the host chooses worktree paths, after creating them. */
export const RecordThreadInput = Schema.Struct({
  workspaceId: Schema.String,
  title: Schema.optional(Schema.String),
  worktree: Schema.optional(ThreadWorktree.pipe(Schema.omit("state", "setup"))),
})

export type RecordThreadInput = typeof RecordThreadInput.Type

/** Where a thread's files live, for host operations that need the folder rather than the row. */
export const ThreadLocation = Schema.Struct({
  threadId: Schema.String,
  workspaceId: Schema.String,
  workspacePath: Schema.String,
  worktree: Schema.NullOr(ThreadWorktree),
  /** A turn is running or input is queued, so the folder must stay where it is. */
  busy: Schema.Boolean,
})

export type ThreadLocation = typeof ThreadLocation.Type

export const SetThreadTitleInput = Schema.Struct({
  threadId: Schema.String,
  /** Raw model output. The core owns the cleanup rules, so nothing else has to trust it. */
  title: Schema.String,
})

export type SetThreadTitleInput = typeof SetThreadTitleInput.Type

export const SetThreadStatusInput = Schema.Struct({
  threadId: Schema.String,
  status: ThreadStatus,
  pinned: Schema.optional(Schema.Boolean),
})

export type SetThreadStatusInput = typeof SetThreadStatusInput.Type

export const UpdateProviderInput = Schema.Struct({
  providerId: Schema.String,
  displayName: Schema.optional(Schema.String),
  enabled: Schema.optional(Schema.Boolean),
})

export type UpdateProviderInput = typeof UpdateProviderInput.Type

/** Omitting `modelId` creates a model; supplying it edits the matching row in place. */
export const UpsertModelInput = Schema.Struct({
  providerId: Schema.String,
  modelId: Schema.optional(Schema.String),
  slug: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.String),
  reasoningEfforts: Schema.optional(Schema.Array(ReasoningEffort)),
  supportsFast: Schema.optional(Schema.Boolean),
  enabled: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
})

export type UpsertModelInput = typeof UpsertModelInput.Type

export const SyncProviderCatalogInput = Schema.Struct({
  providerKey: Schema.String,
  models: Schema.Array(ProviderModelCatalogEntry),
  /** Workspace-scoped catalogs may add models without removing other workspaces' entries. */
  partial: Schema.optional(Schema.Boolean),
})

export type SyncProviderCatalogInput = typeof SyncProviderCatalogInput.Type

export const SetThreadSettingsInput = Schema.Struct({
  threadId: Schema.String,
  modelId: Schema.optional(Schema.String),
  reasoningEffort: Schema.optional(Schema.NullOr(ReasoningEffort)),
  speed: Schema.optional(ModelSpeed),
  mode: Schema.optional(CollaborationMode),
  sandbox: Schema.optional(SandboxMode),
  approvalPolicy: Schema.optional(ApprovalPolicy),
})

export type SetThreadSettingsInput = typeof SetThreadSettingsInput.Type

export const SetAppSettingsInput = Schema.Struct({
  opacity: Schema.optional(AppOpacity),
  showSettled: Schema.optional(Schema.Boolean),
  theme: Schema.optional(Schema.Literal("dark", "light", "system")),
  transcriptSize: Schema.optional(Schema.Literal("small", "medium", "large")),
  reduceMotion: Schema.optional(Schema.Boolean),
  sounds: Schema.optional(Schema.Boolean),
  editor: Schema.optional(Schema.String.pipe(Schema.maxLength(64))),

  titleModelId: Schema.optional(Schema.String),
})

export type SetAppSettingsInput = typeof SetAppSettingsInput.Type

export const InputAttachment = Schema.Struct({
  type: Schema.Literal("image", "localImage", "mention", "skill"),
  value: Schema.String,
  name: Schema.optional(Schema.String),
})

export type InputAttachment = typeof InputAttachment.Type

/** A harness slash command or skill that the composer can offer while typing. */
export const ComposerCommand = Schema.Struct({
  kind: Schema.Literal("command", "skill"),
  name: Schema.String,
  description: Schema.String,
  argumentHint: Schema.optional(Schema.String),
  /** Present when the harness takes the skill as an attachment instead of `/name` text. */
  path: Schema.optional(Schema.String),
})

export type ComposerCommand = typeof ComposerCommand.Type

export const SubmitTurnInput = Schema.Struct({
  threadId: Schema.String,
  text: Schema.String,
  attachments: Schema.optional(Schema.Array(InputAttachment)),
})

export type SubmitTurnInput = typeof SubmitTurnInput.Type

export const TranscriptQuery = Schema.Struct({
  threadId: Schema.String,
  beforeSequence: Schema.optional(Schema.Number),
  // Forward catch-up cursor. nextCursor continues in the same direction.
  afterSequence: Schema.optional(Schema.Number),
  limit: Schema.optional(Schema.Number),
})

export type TranscriptQuery = typeof TranscriptQuery.Type

export const TranscriptPage = Schema.Struct({
  events: Schema.Array(CanonicalEvent),
  nextCursor: Schema.NullOr(Schema.Number),
})

export type TranscriptPage = typeof TranscriptPage.Type

export const ThreadPageQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
})

export type ThreadPageQuery = typeof ThreadPageQuery.Type

export const ThreadPage = Schema.Struct({
  threads: Schema.Array(Thread),
  nextCursor: Schema.NullOr(Schema.String),
})

export type ThreadPage = typeof ThreadPage.Type

export const ApprovalDecision = Schema.Literal("accept", "acceptForSession", "decline", "cancel")

export type ApprovalDecision = typeof ApprovalDecision.Type

export const ResolveApprovalInput = Schema.Struct({
  approvalId: Schema.String,
  decision: ApprovalDecision,
  optionId: Schema.optional(Schema.String),
  answers: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }),
  ),
})

export type ResolveApprovalInput = typeof ResolveApprovalInput.Type

export const TurnDispatch = Schema.Struct({
  harness: Schema.optionalWith(Schema.Literal("codex", "claude-code", "cursor"), {
    default: () => "codex" as const,
  }),
  threadId: Schema.String,
  turnId: Schema.String,
  nativeThreadId: Schema.NullOr(Schema.String),
  workspacePath: Schema.String,
  model: Schema.String,
  reasoningEffort: Schema.NullOr(Schema.String),
  speed: ModelSpeed,
  /** Exact provider service-tier id. `default` means standard speed. */
  serviceTier: Schema.String,
  mode: CollaborationMode,
  sandbox: SandboxMode,
  approvalPolicy: ApprovalPolicy,
  text: Schema.String,
  attachments: Schema.Array(InputAttachment),
})

export type TurnDispatch = typeof TurnDispatch.Type

/**
 * One throwaway provider turn whose only job is naming a thread. It never becomes a MeldShell turn,
 * so it carries no thread settings beyond the model the title is allowed to cost.
 */
export const TitleRequest = Schema.Struct({
  harness: Schema.optionalWith(Schema.Literal("codex", "claude-code", "cursor"), {
    default: () => "codex" as const,
  }),
  threadId: Schema.String,
  workspacePath: Schema.String,
  model: Schema.String,
  reasoningEffort: Schema.NullOr(Schema.String),
  prompt: Schema.String,
})

export type TitleRequest = typeof TitleRequest.Type

export const SubmitTurnResult = Schema.Struct({
  snapshot: AppSnapshot,
  disposition: Schema.Literal("started", "queued"),
  dispatch: Schema.NullOr(TurnDispatch),
  titleRequest: Schema.NullOr(TitleRequest),
})

export type SubmitTurnResult = typeof SubmitTurnResult.Type

export const RuntimeEventInput = Schema.Struct({
  threadId: Schema.String,
  turnId: Schema.String,
  method: Schema.String,
  params: Schema.Unknown,
  generation: Schema.optional(Schema.String),
  validated: Schema.optional(Schema.Boolean),
  promoteQueue: Schema.optional(Schema.Boolean),
  nativeTurnId: Schema.optional(Schema.String),
  requestId: Schema.optional(Schema.Union(Schema.String, Schema.Number)),
})

export type RuntimeEventInput = typeof RuntimeEventInput.Type

export const RuntimeEventResult = Schema.Struct({
  changed: Schema.Boolean,
  nextDispatch: Schema.NullOr(TurnDispatch),
})

export type RuntimeEventResult = typeof RuntimeEventResult.Type

export const ProviderSessionInput = Schema.Struct({
  harness: Schema.optionalWith(Schema.Literal("codex", "claude-code", "cursor"), {
    default: () => "codex" as const,
  }),
  threadId: Schema.String,
  nativeThreadId: Schema.String,
})

export type ProviderSessionInput = typeof ProviderSessionInput.Type

export const InterruptedTurn = Schema.Struct({
  harness: Schema.String,
  id: Schema.String,
  worker_generation: Schema.NullOr(Schema.String),
  native_turn_id: Schema.NullOr(Schema.String),
  native_thread_id: Schema.NullOr(Schema.String),
})

export type InterruptedTurn = typeof InterruptedTurn.Type

export const RenameWorkspaceInput = Schema.Struct({
  workspaceId: Schema.String,
  name: Schema.String,
})

export const SetThreadPinnedInput = Schema.Struct({
  threadId: Schema.String,
  pinned: Schema.Boolean,
})

export const SearchTranscriptsInput = Schema.Struct({
  query: Schema.String,
  workspaceId: Schema.optional(Schema.String),
  offset: Schema.optional(Schema.Number),
})

export type SearchTranscriptsInput = typeof SearchTranscriptsInput.Type

export const TranscriptSearchResult = Schema.Struct({
  thread: Thread,
  eventId: Schema.String,
  turnId: Schema.NullOr(Schema.String),
  snippet: Schema.String,
})

export type TranscriptSearchResult = typeof TranscriptSearchResult.Type

export const TranscriptSearchPage = Schema.Struct({
  results: Schema.Array(TranscriptSearchResult),
  hasMore: Schema.Boolean,
})

export type TranscriptSearchPage = typeof TranscriptSearchPage.Type
