import { Effect, Schema, Struct } from "effect"
import { DictationModel } from "./dictation"

export const Workspace = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  name: Schema.String,
  createdAt: Schema.String,
  lastOpenedAt: Schema.String,
})

export type Workspace = typeof Workspace.Type

const ThreadStatus = Schema.Literals(["active", "settled"])

/** Progress of the workspace setup script in a thread's worktree. */
export const WorktreeSetup = Schema.Literals(["running", "succeeded", "failed", "interrupted"])

export type WorktreeSetup = typeof WorktreeSetup.Type

/** A thread's own branch and checkout, created from the workspace so parallel threads cannot collide. */
export const ThreadWorktree = Schema.Struct({
  path: Schema.String,
  branch: Schema.String,
  /** The branch the workspace had checked out when the thread began, or null when it was detached. */
  baseBranch: Schema.NullOr(Schema.String),
  /** `missing` means the folder disappeared outside MeldShell; `removed` means MeldShell removed it. */
  state: Schema.Literals(["ready", "missing", "removed"]),
  /**
   * The workspace setup script's last run in this worktree; absent when none has run. `interrupted`
   * means it was stopped, or MeldShell quit, before it finished.
   */
  setup: Schema.optional(WorktreeSetup),
})

export type ThreadWorktree = typeof ThreadWorktree.Type

/** The GitHub issue a thread was started from; its text goes to the agent with the first message. */
export const ThreadIssue = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  url: Schema.String,
})

export type ThreadIssue = typeof ThreadIssue.Type

export const Thread = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  title: Schema.String,
  status: ThreadStatus,
  pinned: Schema.optional(Schema.Boolean),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  activity: Schema.Literals([
    "idle",
    "running",
    "queued",
    "approval",
    "failed",
    "completed",
    "interrupted",
  ]),
  queuedCount: Schema.Number,
  turnCount: Schema.Number,
  worktree: Schema.optional(ThreadWorktree),
  /**
   * The harness that ran the latest turn still in the conversation. A turn on another harness
   * starts with a summary of the work it has not seen.
   */
  lastHarness: Schema.optional(Schema.String),
  /**
   * A rewind took turns out of the conversation and can still be undone, which stays true until
   * the next turn starts. That turn begins a new provider session from a summary.
   */
  rewound: Schema.optional(Schema.Boolean),
  /** Changes whenever turns leave or return to the conversation, so open transcripts are reread. */
  historyRevision: Schema.optional(Schema.String),
  issue: Schema.optional(ThreadIssue),
})

export type Thread = typeof Thread.Type

/**
 * Why a turn's provider received a summary of earlier turns: another harness ran them, or the
 * provider session restarted after a rewind.
 */
export const TurnHandoff = Schema.Struct({
  reason: Schema.Literals(["handoff", "restart"]),
  /** The harnesses whose turns the summary covers, in the order they first ran. */
  from: Schema.Array(Schema.String),
  to: Schema.String,
  turnCount: Schema.Number,
  /** Exactly what the provider was given ahead of the user's message. */
  brief: Schema.String,
})

export type TurnHandoff = typeof TurnHandoff.Type

const carriesHandoff = Schema.is(Schema.Struct({ handoff: TurnHandoff }))

/** The summary a user message was sent with, when its provider session had missed earlier turns. */
export const messageHandoff = (payload: unknown): TurnHandoff | null =>
  carriesHandoff(payload) ? payload.handoff : null

export const CanonicalEventKind = Schema.Literals([
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
])

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
  approvalScope: Schema.optional(Schema.Literals(["turn", "session"])),
  id: Schema.String,
  threadId: Schema.String,
  turnId: Schema.String,
  requestId: Schema.Union([Schema.String, Schema.Number]),
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

export const ApprovalRequest = Schema.Union([
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
    kind: Schema.Literal("plan"),
    /** Cursor's plan tool, or Claude Code's ExitPlanMode tool, asking to leave plan mode. */
    method: Schema.Literals(["cursor/create_plan", "claude/exit_plan_mode"]),
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
    /**
     * Codex's or Claude Code's question tool, Cursor's own, MeldShell's tool offered to Cursor, or
     * a dialog a Pi extension opened.
     */
    method: Schema.Literals([
      "item/tool/requestUserInput",
      "cursor/ask_question",
      "cursor/ask_user_question",
      "pi/extension_ui_request",
    ]),
    questions: Schema.Array(UserInputQuestion),
  }),
  Schema.Struct({
    ...InteractionFields,
    kind: Schema.Literal("permissions"),
    method: Schema.Literal("item/permissions/requestApproval"),
    permissions: Schema.Unknown,
  }),
])

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
const ModelSpeed = Schema.Literals(["standard", "fast"])

export const CollaborationMode = Schema.Literals(["default", "plan", "ask"])

export type CollaborationMode = typeof CollaborationMode.Type

export const SandboxMode = Schema.Literals(["read-only", "workspace-write", "danger-full-access"])

export type SandboxMode = typeof SandboxMode.Type

export const ApprovalPolicy = Schema.Literals(["untrusted", "on-request", "never"])

export type ApprovalPolicy = typeof ApprovalPolicy.Type

/** The coding agents MeldShell supervises, each in its own worker process. */
export const Harness = Schema.Literals(["codex", "claude-code", "cursor", "pi"])

export type Harness = typeof Harness.Type

export const isHarness = Schema.is(Harness)

interface HarnessInfo {
  /** The `Provider.key` of the vendor that ships the harness. */
  readonly provider: "openai" | "anthropic" | "cursor" | "pi"
  /** The name a seeded provider starts with; the user can rename it. */
  readonly vendor: string
  /** The harness's own name, as statuses and notifications show it. */
  readonly label: string
  /** The collaboration modes the harness takes from MeldShell. Codex takes none but the default. */
  readonly modes: ReadonlyArray<CollaborationMode>
}

export const HARNESSES: { readonly [Key in Harness]: HarnessInfo } = {
  codex: { provider: "openai", vendor: "OpenAI", label: "Codex", modes: ["default"] },
  "claude-code": {
    provider: "anthropic",
    vendor: "Claude",
    label: "Claude Code",
    modes: ["default", "plan"],
  },
  cursor: {
    provider: "cursor",
    vendor: "Cursor",
    label: "Cursor",
    modes: ["default", "plan", "ask"],
  },
  pi: { provider: "pi", vendor: "Pi", label: "Pi", modes: ["default"] },
}

/** Whether a harness takes a mode; the default mode works everywhere. */
export const supportsMode = (harness: string | undefined, mode: CollaborationMode): boolean =>
  mode === "default" || (isHarness(harness) && HARNESSES[harness].modes.includes(mode))

/** Older dispatch payloads predate the other harnesses and name none. */
const DispatchHarness = Harness.pipe(Schema.withDecodingDefaultType(Effect.succeed("codex")))

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
  ...ProviderModelCatalogEntry.fields,
  id: Schema.String,
  providerId: Schema.String,
  /** The identifier sent to the harness, for example `gpt-5.1-codex`. */
  slug: Schema.String,
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

export const AppOpacity = Schema.Number.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ minimum: 20, maximum: 100 })),
)

export const Theme = Schema.Literals(["dark", "light", "system"])

export const TranscriptSize = Schema.Literals(["small", "medium", "large"])

/** How a message sent while a turn runs reaches the agent: after the turn, or into it. */
export const FollowUpDelivery = Schema.Literals(["queue", "steer"])

export type FollowUpDelivery = typeof FollowUpDelivery.Type

/** How many loadouts can be saved: one for each of the Ctrl+1 to Ctrl+5 shortcuts. */
export const MAX_LOADOUTS = 5

/**
 * A saved composer setup: the agent (through its model), reasoning effort, and speed. Applying one
 * sets all of them on a thread at once and leaves its mode and permissions alone.
 */
export const Loadout = Schema.Struct({
  id: Schema.String.pipe(Schema.check(Schema.isMaxLength(64))),
  name: Schema.String.pipe(Schema.check(Schema.isMaxLength(48))),
  modelId: Schema.String.pipe(Schema.check(Schema.isMaxLength(256))),
  reasoningEffort: Schema.NullOr(ReasoningEffort.pipe(Schema.check(Schema.isMaxLength(32)))),
  speed: ModelSpeed,
})

export type Loadout = typeof Loadout.Type

export const Loadouts = Schema.Array(Loadout).pipe(Schema.check(Schema.isMaxLength(MAX_LOADOUTS)))

export const AppSettings = Schema.Struct({
  alwaysFullPermissions: Schema.optional(Schema.Boolean),
  /** What Enter does while a turn runs; the opposite is one modifier away. Queues by default. */
  followUpMode: Schema.optional(FollowUpDelivery),
  opacity: Schema.optional(AppOpacity),
  showSettled: Schema.optional(Schema.Boolean),
  theme: Schema.optional(Theme),
  transcriptSize: Schema.optional(TranscriptSize),
  reduceMotion: Schema.optional(Schema.Boolean),
  /** Chimes when a thread finishes or needs attention out of view. */
  sounds: Schema.optional(Schema.Boolean),
  /** The local speech model dictation uses. */
  dictationModel: Schema.optional(DictationModel),
  /** The external editor that opens a thread's folder; an `ExternalEditor` id. */
  editor: Schema.optional(Schema.String),
  /** Shortcut chords that differ from the defaults, by action; an empty chord removes one. */
  keybindings: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  /** Saved composer setups, in shortcut order: the first is Ctrl+1. */
  loadouts: Schema.optional(Loadouts),
  /** Whether the first-run guide has been finished or skipped. */
  onboarded: Schema.optional(Schema.Boolean),

  /** A `ProviderModel` id, or `CURRENT_TITLE_MODEL`. */
  titleModelId: Schema.String,
})

export type AppSettings = typeof AppSettings.Type

/** A follow-up waiting for its turn. `steer` ones jump the queue and interrupt what is running. */
export const QueuedInput = Schema.Struct({
  id: Schema.Number,
  threadId: Schema.String,
  text: Schema.String,
  attachmentCount: Schema.Number,
  steer: Schema.Boolean,
  createdAt: Schema.String,
})

export type QueuedInput = typeof QueuedInput.Type

export const AppSnapshot = Schema.Struct({
  workspaces: Schema.Array(Workspace),
  threads: Schema.Array(Thread),
  providers: Schema.Array(Provider),
  models: Schema.Array(ProviderModel),
  threadSettings: Schema.Array(ThreadSettings),
  approvals: Schema.Array(ApprovalRequest),
  queuedInputs: Schema.Array(QueuedInput),
  settings: AppSettings,
})

export type AppSnapshot = typeof AppSnapshot.Type

const ProviderAvailability = Schema.Literals([
  "probing",
  "missing",
  "unauthenticated",
  "outdated",
  "ready",
  "error",
])

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

export const PiStatus = Schema.Struct({
  ...CodexStatus.fields,
  provider: Schema.Literal("pi"),
  harness: Schema.Literal("pi"),
  /** The discovered launcher, including Node and its entrypoint on npm/Windows installs. */
  launcher: Schema.optional(
    Schema.Struct({
      command: Schema.String,
      args: Schema.Array(Schema.String),
    }),
  ),
})

export type PiStatus = typeof PiStatus.Type

export const ProviderStatus = Schema.Union([CodexStatus, ClaudeStatus, CursorStatus, PiStatus])

export type ProviderStatus = typeof ProviderStatus.Type

/** What a harness shows before its worker has reported a status of its own. */
export const probingStatus = (harness: Harness): ProviderStatus =>
  // Each registry entry names its own vendor, so the pair matches one member of the union.
  ({
    provider: HARNESSES[harness].provider,
    harness,
    availability: "probing",
    executablePath: null,
    version: null,
    detail: `Connecting to ${HARNESSES[harness].label}…`,
    checkedAt: new Date().toISOString(),
  }) as ProviderStatus

const ProviderUpdateState = Schema.Literals([
  "unknown",
  "checking",
  "current",
  "available",
  "updating",
  "error",
])

/** Whether a newer release of a harness exists, and how MeldShell would install it. */
export const ProviderUpdateStatus = Schema.Struct({
  harness: Harness,
  state: ProviderUpdateState,
  installedVersion: Schema.NullOr(Schema.String),
  latestVersion: Schema.NullOr(Schema.String),
  /** The command MeldShell runs to update, for display; null while the install is unknown. */
  command: Schema.NullOr(Schema.String),
  /** False when the install must be updated by hand, such as a system package. */
  canUpdate: Schema.Boolean,
  message: Schema.String,
  checkedAt: Schema.NullOr(Schema.String),
})

export type ProviderUpdateStatus = typeof ProviderUpdateStatus.Type

export const unknownUpdateStatus = (harness: Harness): ProviderUpdateStatus => ({
  harness,
  state: "unknown",
  installedVersion: null,
  latestVersion: null,
  command: null,
  canUpdate: false,
  message: "",
  checkedAt: null,
})

export const UsageWindow = Schema.Struct({
  label: Schema.optional(Schema.String),
  usedPercent: Schema.Number.pipe(Schema.check(Schema.isFinite())),
  windowDurationMins: Schema.optional(
    Schema.NullOr(Schema.Number.pipe(Schema.check(Schema.isFinite()))),
  ),
  resetsAt: Schema.optional(Schema.NullOr(Schema.Number.pipe(Schema.check(Schema.isFinite())))),
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
        remainingPercent: Schema.Number.pipe(Schema.check(Schema.isFinite())),
        resetsAt: Schema.Number.pipe(Schema.check(Schema.isFinite())),
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
  resetCredits: Schema.NullOr(Schema.Number.pipe(Schema.check(Schema.isFinite()))),
})

export type CodexUsage = typeof CodexUsage.Type

export const CreateThreadInput = Schema.Struct({
  workspaceId: Schema.String,
  title: Schema.optional(Schema.String),
  /** Gives the thread its own branch and worktree instead of the workspace checkout. */
  isolated: Schema.optional(Schema.Boolean),
  /** Starts from this GitHub issue in the workspace's repository, on a branch of its own. */
  issue: Schema.optional(
    Schema.Number.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 2 ** 31 })),
    ),
  ),
})

export type CreateThreadInput = typeof CreateThreadInput.Type

/** The core's record of a new thread. Only the host chooses worktree paths, after creating them. */
export const RecordThreadInput = Schema.Struct({
  workspaceId: Schema.String,
  title: Schema.optional(Schema.String),
  worktree: Schema.optional(ThreadWorktree.mapFields(Struct.omit(["state", "setup"]))),
  /** The issue's text, as the host read it from GitHub, is kept for the thread's first turn. */
  issue: Schema.optional(Schema.Struct({ ...ThreadIssue.fields, context: Schema.String })),
})

export type RecordThreadInput = typeof RecordThreadInput.Type

/** Where a thread's files live, for host operations that need the folder rather than the row. */
export const ThreadLocation = Schema.Struct({
  threadId: Schema.String,
  workspaceId: Schema.String,
  workspacePath: Schema.String,
  worktree: Schema.NullOr(ThreadWorktree),
  issue: Schema.NullOr(ThreadIssue),
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

export const RenameThreadInput = Schema.Struct({
  threadId: Schema.String,
  title: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(100)),
  ),
})

export type RenameThreadInput = typeof RenameThreadInput.Type

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

/** Every field is optional; free-text fields are bounded because they arrive from clients. */
export const SetAppSettingsInput = Schema.Struct({
  ...AppSettings.fields,
  editor: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(64)))),
  /** Replaces every stored override. */
  keybindings: Schema.optional(
    Schema.Record(
      Schema.String.pipe(Schema.check(Schema.isMaxLength(64))),
      Schema.String.pipe(Schema.check(Schema.isMaxLength(64))),
    ),
  ),
  titleModelId: Schema.optional(Schema.String),
})

export type SetAppSettingsInput = typeof SetAppSettingsInput.Type

export const InputAttachment = Schema.Struct({
  type: Schema.Literals(["image", "localImage", "mention", "skill"]),
  value: Schema.String,
  name: Schema.optional(Schema.String),
})

export type InputAttachment = typeof InputAttachment.Type

/** A harness slash command or skill that the composer can offer while typing. */
export const ComposerCommand = Schema.Struct({
  kind: Schema.Literals(["command", "skill"]),
  name: Schema.String,
  description: Schema.String,
  argumentHint: Schema.optional(Schema.String),
  /** Present when the harness takes the skill as an attachment instead of `/name` text. */
  path: Schema.optional(Schema.String),
})

export type ComposerCommand = typeof ComposerCommand.Type

export const SubmitTurnInput = Schema.Struct({
  /** Reply to asynchronous questions from this turn; steer it when still active. */
  questionTurnId: Schema.optional(Schema.String),
  threadId: Schema.String,
  text: Schema.String,
  attachments: Schema.optional(Schema.Array(InputAttachment)),
  /** Whether a message sent while a turn runs waits for it (`queue`, the default) or redirects it. */
  delivery: Schema.optional(FollowUpDelivery),
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

export const ApprovalDecision = Schema.Literals(["accept", "acceptForSession", "decline", "cancel"])

export type ApprovalDecision = typeof ApprovalDecision.Type

export const ResolveApprovalInput = Schema.Struct({
  approvalId: Schema.String,
  decision: ApprovalDecision,
  optionId: Schema.optional(Schema.String),
  answers: Schema.optional(Schema.Record(Schema.String, Schema.Array(Schema.String))),
  /** Why the user declined, passed back to the agent so it can try something else. */
  reason: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(4000)))),
})

export type ResolveApprovalInput = typeof ResolveApprovalInput.Type

export const TurnDispatch = Schema.Struct({
  harness: DispatchHarness,
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
  /** Earlier work this provider session has not seen, sent along with the user's message. */
  context: Schema.optional(Schema.NullOr(Schema.String)),
})

export type TurnDispatch = typeof TurnDispatch.Type

/**
 * The message text a provider receives. A handoff summary leads, except before a slash command,
 * which only works at the start of a message.
 */
export const promptText = (dispatch: Pick<TurnDispatch, "text" | "context">): string => {
  const context = dispatch.context ?? ""
  if (context === "") return dispatch.text
  if (dispatch.text === "") return context
  return dispatch.text.startsWith("/")
    ? `${dispatch.text}\n\n${context}`
    : `${context}\n\n${dispatch.text}`
}

/**
 * One throwaway provider turn whose only job is naming a thread. It never becomes a MeldShell turn,
 * so it carries no thread settings beyond the model the title is allowed to cost.
 */
export const TitleRequest = Schema.Struct({
  harness: DispatchHarness,
  threadId: Schema.String,
  workspacePath: Schema.String,
  model: Schema.String,
  reasoningEffort: Schema.NullOr(Schema.String),
  prompt: Schema.String,
})

export type TitleRequest = typeof TitleRequest.Type

export const SubmitTurnResult = Schema.Struct({
  snapshot: AppSnapshot,
  disposition: Schema.Literals(["started", "queued", "steered"]),
  dispatch: Schema.NullOr(TurnDispatch),
  titleRequest: Schema.NullOr(TitleRequest),
  /** The queue entry a `queued` message became. */
  queuedInputId: Schema.optional(Schema.Number),
})

export type SubmitTurnResult = typeof SubmitTurnResult.Type

/** A thread taken back to just before one of its turns. */
export const RewindResult = Schema.Struct({
  snapshot: AppSnapshot,
  /** The rewound turn's first message, so it can be edited and sent again. */
  text: Schema.String,
  /** How many turns left the conversation. */
  turnCount: Schema.Number,
  /** The files went back too; a folder outside Git, or an older turn, has no snapshot. */
  filesRestored: Schema.Boolean,
})

export type RewindResult = typeof RewindResult.Type

export const UndoRewindResult = Schema.Struct({
  snapshot: AppSnapshot,
  /** The rewind restored files, so undoing it puts them back as well. */
  filesRestored: Schema.Boolean,
})

export type UndoRewindResult = typeof UndoRewindResult.Type

export const RuntimeEventInput = Schema.Struct({
  threadId: Schema.String,
  turnId: Schema.String,
  method: Schema.String,
  params: Schema.Unknown,
  generation: Schema.optional(Schema.String),
  validated: Schema.optional(Schema.Boolean),
  promoteQueue: Schema.optional(Schema.Boolean),
  nativeTurnId: Schema.optional(Schema.String),
  requestId: Schema.optional(Schema.Union([Schema.String, Schema.Number])),
})

export type RuntimeEventInput = typeof RuntimeEventInput.Type

export const RuntimeEventResult = Schema.Struct({
  changed: Schema.Boolean,
  /** Whether the event changed app snapshot state (threads, settings, approvals), not only the transcript. */
  snapshotChanged: Schema.Boolean,
  nextDispatch: Schema.NullOr(TurnDispatch),
})

export type RuntimeEventResult = typeof RuntimeEventResult.Type

/**
 * A turn the harness started on its own, such as a run a Pi extension began. The worker that
 * reported it owns it, so its events land in the turn and its exit settles it.
 */
export const OpenProviderTurnInput = Schema.Struct({
  harness: Harness,
  threadId: Schema.String,
  turnId: Schema.String,
  /** The model the harness is running, in the harness's own catalog form. */
  model: Schema.String,
  generation: Schema.String,
})

export type OpenProviderTurnInput = typeof OpenProviderTurnInput.Type

export const ProviderSessionInput = Schema.Struct({
  harness: DispatchHarness,
  threadId: Schema.String,
  nativeThreadId: Schema.String,
})

export type ProviderSessionInput = typeof ProviderSessionInput.Type

/** A queued follow-up's content, read to deliver it into the running turn. */
export const QueuedInputContent = Schema.Struct({
  threadId: Schema.String,
  text: Schema.String,
  attachments: Schema.Array(InputAttachment),
})

export type QueuedInputContent = typeof QueuedInputContent.Type

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

/** An ISO 8601 timestamp. */
const Instant = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => Number.isFinite(Date.parse(value)) || "Expected an ISO timestamp"),
  ),
)

/** A local time of day, `HH:MM` on a 24-hour clock. */
const TimeOfDay = Schema.String.pipe(Schema.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/)))

/**
 * When a scheduled prompt runs: once at a moment, every so many minutes, or daily at a local time
 * on the chosen weekdays (0 is Sunday; none chosen means every day).
 */
export const ScheduleCadence = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("once"), at: Instant }),
  Schema.Struct({
    kind: Schema.Literal("interval"),
    minutes: Schema.Number.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 5, maximum: 7 * 24 * 60 })),
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal("daily"),
    time: TimeOfDay,
    weekdays: Schema.Array(
      Schema.Number.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 0, maximum: 6 })),
      ),
    ),
  }),
])

export type ScheduleCadence = typeof ScheduleCadence.Type

/** A prompt the host sends to a thread on a schedule, as if typed into its composer. */
export const ScheduledPrompt = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  prompt: Schema.String,
  cadence: ScheduleCadence,
  enabled: Schema.Boolean,
  /** Null once a one-time prompt has run, or while the schedule is paused. */
  nextRunAt: Schema.NullOr(Schema.String),
  lastRunAt: Schema.NullOr(Schema.String),
  /** Why the last run could not send its prompt. */
  lastError: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
})

export type ScheduledPrompt = typeof ScheduledPrompt.Type

export const SaveScheduleInput = Schema.Struct({
  /** Omitted to create a schedule. */
  id: Schema.optional(Schema.String),
  threadId: Schema.String,
  prompt: Schema.String.pipe(Schema.check(Schema.isMaxLength(20_000))),
  cadence: ScheduleCadence,
  enabled: Schema.Boolean,
})

export type SaveScheduleInput = typeof SaveScheduleInput.Type
