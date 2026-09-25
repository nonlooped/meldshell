/* Generated from the checked-in Codex JSON Schema. Run npm run generate:protocol --workspace=@meldshell/provider-codex. */

/**
 * Notification sent from the server to the client.
 */
export type ServerNotification = {
  /**
   * Unix timestamp (in milliseconds) when app-server emitted this notification.
   */
  emittedAtMs?: number
  [k: string]: unknown
} & (
  | ErrorNotification
  | ThreadStartedNotification
  | ThreadStatusChangedNotification
  | ThreadArchivedNotification
  | ThreadDeletedNotification
  | ThreadUnarchivedNotification
  | ThreadClosedNotification
  | ThreadRevertedNotification
  | SkillsChangedNotification
  | ThreadNameUpdatedNotification
  | ThreadGoalUpdatedNotification
  | ThreadGoalClearedNotification
  | ThreadQueueChangedNotification
  | ProjectChangedNotification
  | ThreadProjectUpdatedNotification
  | ThreadEnvironmentConnectedNotification
  | ThreadEnvironmentDisconnectedNotification
  | ThreadSettingsUpdatedNotification
  | ThreadTokenUsageUpdatedNotification
  | TurnStartedNotification
  | HookStartedNotification
  | TurnCompletedNotification
  | HookCompletedNotification
  | TurnDiffUpdatedNotification
  | TurnPlanUpdatedNotification
  | ItemStartedNotification
  | ItemAutoApprovalReviewStartedNotification
  | ItemAutoApprovalReviewCompletedNotification
  | AutoApprovalReviewStrictReviewRequiredNotification
  | ItemCompletedNotification
  | ItemAgentMessageDeltaNotification
  | ItemPlanDeltaNotification
  | CommandExecOutputDeltaNotification
  | ProcessOutputDeltaNotification
  | ProcessExitedNotification
  | ItemCommandExecutionOutputDeltaNotification
  | ItemCommandExecutionTerminalInteractionNotification
  | ItemFileChangeOutputDeltaNotification
  | ItemFileChangePatchUpdatedNotification
  | ServerRequestResolvedNotification
  | ItemMcpToolCallProgressNotification
  | McpServerOauthLoginCompletedNotification
  | McpServerStartupStatusUpdatedNotification
  | McpServerEventStreamNotificationNotification
  | AccountUpdatedNotification
  | AccountRateLimitsUpdatedNotification
  | AppListUpdatedNotification
  | RemoteControlStatusChangedNotification
  | ExternalAgentConfigImportProgressNotification
  | ExternalAgentConfigImportCompletedNotification
  | FsChangedNotification
  | ItemReasoningSummaryTextDeltaNotification
  | ItemReasoningSummaryPartAddedNotification
  | ItemReasoningTextDeltaNotification
  | ThreadCompactedNotification
  | ModelReroutedNotification
  | ModelVerificationNotification
  | ModelProviderAuthRecoveryStartedNotification
  | ModelProviderAuthRecoveryCompletedNotification
  | TurnModerationMetadataNotification
  | ModelSafetyBufferingUpdatedNotification
  | WarningNotification
  | GuardianWarningNotification
  | DeprecationNoticeNotification
  | ConfigWarningNotification
  | FuzzyFileSearchSessionUpdatedNotification
  | FuzzyFileSearchSessionCompletedNotification
  | ThreadRealtimeStartedNotification
  | ThreadRealtimeItemAddedNotification
  | ThreadRealtimeItemStartedNotification
  | ThreadRealtimeItemTranscriptDeltaNotification
  | ThreadRealtimeItemCompletedNotification
  | ThreadRealtimeTranscriptDeltaNotification
  | ThreadRealtimeTranscriptDoneNotification
  | ThreadRealtimeOutputAudioDeltaNotification
  | ThreadRealtimeSdpNotification
  | ThreadRealtimeErrorNotification
  | ThreadRealtimeClosedNotification
  | WindowsWorldWritableWarningNotification
  | WindowsSandboxSetupCompletedNotification
  | AccountLoginCompletedNotification
)
export type ErrorNotificationMethod = "error"
/**
 * This translation layer make sure that we expose codex error code in camel case.
 *
 * When an upstream HTTP status is available (for example, from the Responses API or a provider), it is forwarded in `httpStatusCode` on the relevant `codexErrorInfo` variant.
 */
export type CodexErrorInfo =
  | (
      | "contextWindowExceeded"
      | "sessionBudgetExceeded"
      | "usageLimitExceeded"
      | "rateLimitExceeded"
      | "serverOverloaded"
      | "cyberPolicy"
      | "misalignmentPolicyViolation"
      | "internalServerError"
      | "unauthorized"
      | "badRequest"
      | "threadRollbackFailed"
      | "sandboxError"
      | "other"
    )
  | HttpConnectionFailedCodexErrorInfo
  | ResponseStreamConnectionFailedCodexErrorInfo
  | ResponseStreamDisconnectedCodexErrorInfo
  | ResponseTooManyFailedAttemptsCodexErrorInfo
  | ActiveTurnNotSteerableCodexErrorInfo
export type NonSteerableTurnKind = "review" | "compact"
export type ThreadStartedNotificationMethod = "thread/started"
/**
 * A path that is guaranteed to be absolute and normalized (though it is not guaranteed to be canonicalized or exist on the filesystem).
 *
 * IMPORTANT: When deserializing an `AbsolutePathBuf`, a base path must be set using [AbsolutePathBufGuard::new]. If no base path is set, the deserialization will fail unless the path being deserialized is already absolute.
 */
export type AbsolutePathBuf = string
export type ThreadHistoryMode = "legacy" | "paginated"
/**
 * A non-empty reasoning effort value advertised by the model.
 */
export type ReasoningEffort = string
export type SessionSource =
  | ("cli" | "vscode" | "exec" | "appServer" | "unknown")
  | CustomSessionSource
  | SubAgentSessionSource
export type SubAgentSource =
  ("review" | "compact" | "memory_consolidation") | ThreadSpawnSubAgentSource | OtherSubAgentSource
export type AgentPath = string
export type ThreadId = string
export type ThreadStatus =
  NotLoadedThreadStatus | IdleThreadStatus | SystemErrorThreadStatus | ActiveThreadStatus
export type NotLoadedThreadStatusType = "notLoaded"
export type IdleThreadStatusType = "idle"
export type SystemErrorThreadStatusType = "systemError"
export type ThreadActiveFlag = "waitingOnApproval" | "waitingOnUserInput"
export type ActiveThreadStatusType = "active"
export type ThreadSource = string
export type ThreadItem =
  | UserMessageThreadItem
  | HookPromptThreadItem
  | AgentMessageThreadItem
  | FunctionCallOutputThreadItem
  | PlanThreadItem
  | ReasoningThreadItem
  | CommandExecutionThreadItem
  | FileChangeThreadItem
  | McpToolCallThreadItem
  | DynamicToolCallThreadItem
  | CollabAgentToolCallThreadItem
  | SubAgentActivityThreadItem
  | WebSearchThreadItem
  | ImageViewThreadItem
  | SleepThreadItem
  | ImageGenerationThreadItem
  | EnteredReviewModeThreadItem
  | ExitedReviewModeThreadItem
  | ContextCompactionThreadItem
export type UserInput =
  | TextUserInput
  | ImageUserInput
  | LocalImageUserInput
  | AudioUserInput
  | LocalAudioUserInput
  | SkillUserInput
  | MentionUserInput
export type TextUserInputType = "text"
export type ImageDetail = "auto" | "low" | "high" | "original"
export type ImageUserInputType = "image"
export type LocalImageUserInputType = "localImage"
export type AudioUserInputType = "audio"
export type LocalAudioUserInputType = "localAudio"
export type SkillUserInputType = "skill"
export type MentionUserInputType = "mention"
export type UserMessageThreadItemType = "userMessage"
export type HookPromptThreadItemType = "hookPrompt"
export type AgentMessageDelivery = "async"
/**
 * Classifies an assistant message as interim commentary or final answer text.
 *
 * Providers do not emit this consistently, so callers must treat `None` as "phase unknown" and keep compatibility behavior for legacy models.
 */
export type MessagePhase = "commentary" | "final_answer"
export type AgentMessageThreadItemType = "agentMessage"
export type FunctionCallOutputBody = string | FunctionCallOutputContentItem[]
/**
 * Responses API compatible content items that can be returned by a tool call. This is a subset of ContentItem with the types we support as function call outputs.
 */
export type FunctionCallOutputContentItem =
  | InputTextFunctionCallOutputContentItem
  | InputImageFunctionCallOutputContentItem
  | InputAudioFunctionCallOutputContentItem
  | EncryptedContentFunctionCallOutputContentItem
export type InputTextFunctionCallOutputContentItemType = "input_text"
export type InputImageFunctionCallOutputContentItemType = "input_image"
export type InputAudioFunctionCallOutputContentItemType = "input_audio"
export type EncryptedContentFunctionCallOutputContentItemType = "encrypted_content"
export type FunctionCallOutputThreadItemType = "functionCallOutput"
export type PlanThreadItemType = "plan"
export type ReasoningThreadItemType = "reasoning"
export type CommandAction =
  ReadCommandAction | ListFilesCommandAction | SearchCommandAction | UnknownCommandAction
export type LegacyAppPathString = string
export type ReadCommandActionType = "read"
export type ListFilesCommandActionType = "listFiles"
export type SearchCommandActionType = "search"
export type UnknownCommandActionType = "unknown"
export type CommandExecutionSource =
  "agent" | "userShell" | "unifiedExecStartup" | "unifiedExecInteraction"
export type CommandExecutionStatus = "inProgress" | "completed" | "failed" | "declined"
export type CommandExecutionThreadItemType = "commandExecution"
export type PatchChangeKind = AddPatchChangeKind | DeletePatchChangeKind | UpdatePatchChangeKind
export type AddPatchChangeKindType = "add"
export type DeletePatchChangeKindType = "delete"
export type UpdatePatchChangeKindType = "update"
export type PatchApplyStatus = "inProgress" | "completed" | "failed" | "declined"
export type FileChangeThreadItemType = "fileChange"
export type McpToolCallStatus = "inProgress" | "completed" | "failed"
export type McpToolCallThreadItemType = "mcpToolCall"
export type DynamicToolCallOutputContentItem =
  | InputTextDynamicToolCallOutputContentItem
  | InputImageDynamicToolCallOutputContentItem
  | InputAudioDynamicToolCallOutputContentItem
export type InputTextDynamicToolCallOutputContentItemType = "inputText"
export type InputImageDynamicToolCallOutputContentItemType = "inputImage"
export type InputAudioDynamicToolCallOutputContentItemType = "inputAudio"
export type DynamicToolCallStatus = "inProgress" | "completed" | "failed"
export type DynamicToolCallThreadItemType = "dynamicToolCall"
export type CollabAgentStatus =
  "pendingInit" | "running" | "interrupted" | "completed" | "errored" | "shutdown" | "notFound"
export type CollabAgentToolCallStatus = "inProgress" | "completed" | "failed" | "interrupted"
export type CollabAgentTool =
  | "spawnAgent"
  | "sendInput"
  | "resumeAgent"
  | "wait"
  | "closeAgent"
  | "sendMessage"
  | "followupTask"
  | "interruptAgent"
  | "listAgents"
export type CollabAgentToolCallThreadItemType = "collabAgentToolCall"
export type SubAgentActivityKind = "started" | "interacted" | "interrupted" | "completed"
export type SubAgentActivityThreadItemType = "subAgentActivity"
export type WebSearchAction =
  SearchWebSearchAction | OpenPageWebSearchAction | FindInPageWebSearchAction | OtherWebSearchAction
export type SearchWebSearchActionType = "search"
export type OpenPageWebSearchActionType = "openPage"
export type FindInPageWebSearchActionType = "findInPage"
export type OtherWebSearchActionType = "other"
export type WebSearchThreadItemType = "webSearch"
export type ImageViewThreadItemType = "imageView"
export type SleepThreadItemType = "sleep"
export type ImageGenerationFailure = UsageLimitExceededImageGenerationFailure
export type UsageLimitExceededImageGenerationFailureType = "usageLimitExceeded"
export type ImageGenerationThreadItemType = "imageGeneration"
export type EnteredReviewModeThreadItemType = "enteredReviewMode"
export type ExitedReviewModeThreadItemType = "exitedReviewMode"
export type ContextCompactionThreadItemType = "contextCompaction"
export type TurnItemsView = "notLoaded" | "summary" | "full"
export type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress"
export type ThreadStatusChangedNotificationMethod = "thread/status/changed"
export type ThreadArchivedNotificationMethod = "thread/archived"
export type ThreadDeletedNotificationMethod = "thread/deleted"
export type ThreadUnarchivedNotificationMethod = "thread/unarchived"
export type ThreadClosedNotificationMethod = "thread/closed"
export type ThreadRevertedNotificationMethod = "thread/reverted"
export type SkillsChangedNotificationMethod = "skills/changed"
export type ThreadNameUpdatedNotificationMethod = "thread/name/updated"
export type ThreadGoalUpdatedNotificationMethod = "thread/goal/updated"
export type ThreadGoalStatus =
  "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete"
export type ThreadGoalClearedNotificationMethod = "thread/goal/cleared"
export type ThreadQueueChangedNotificationMethod = "thread/queue/changed"
export type ProjectChangedNotificationMethod = "project/changed"
export type ProjectChangeType = "created" | "updated" | "deleted"
export type ThreadProjectUpdatedNotificationMethod = "thread/project/updated"
export type ThreadEnvironmentConnectedNotificationMethod = "thread/environment/connected"
export type ThreadEnvironmentDisconnectedNotificationMethod = "thread/environment/disconnected"
export type ThreadSettingsUpdatedNotificationMethod = "thread/settings/updated"
export type AskForApproval = ("untrusted" | "on-request" | "never") | GranularAskForApproval
/**
 * Configures who approval requests are routed to for review. Examples include sandbox escapes, blocked network access, MCP approval prompts, and ARC escalations. Defaults to `user`. `auto_review` uses a carefully prompted subagent to gather relevant context and apply a risk-based decision framework before approving or denying the request. The legacy value `guardian_subagent` is accepted for compatibility.
 */
export type ApprovalsReviewer = "user" | "auto_review" | "guardian_subagent"
/**
 * Initial collaboration mode to use when the TUI starts.
 */
export type ModeKind = "plan" | "default"
export type Personality = "none" | "friendly" | "pragmatic"
export type SandboxPolicy =
  | DangerFullAccessSandboxPolicy
  | ReadOnlySandboxPolicy
  | ExternalSandboxSandboxPolicy
  | WorkspaceWriteSandboxPolicy
export type DangerFullAccessSandboxPolicyType = "dangerFullAccess"
export type ReadOnlySandboxPolicyType = "readOnly"
export type NetworkAccess = "restricted" | "enabled"
export type ExternalSandboxSandboxPolicyType = "externalSandbox"
export type WorkspaceWriteSandboxPolicyType = "workspaceWrite"
/**
 * A summary of the reasoning performed by the model. This can be useful for debugging and understanding the model's reasoning process. See https://platform.openai.com/docs/guides/reasoning?api-mode=responses#reasoning-summaries
 */
export type ReasoningSummary = ("auto" | "concise" | "detailed") | "none"
export type ThreadTokenUsageUpdatedNotificationMethod = "thread/tokenUsage/updated"
export type TurnStartedNotificationMethod = "turn/started"
export type HookStartedNotificationMethod = "hook/started"
export type HookOutputEntryKind = "warning" | "stop" | "feedback" | "context" | "error"
export type HookEventName =
  | "preToolUse"
  | "permissionRequest"
  | "postToolUse"
  | "preCompact"
  | "postCompact"
  | "sessionStart"
  | "sessionEnd"
  | "userPromptSubmit"
  | "subagentStart"
  | "subagentStop"
  | "stop"
  | "interrupt"
export type HookExecutionMode = "sync" | "async"
export type HookHandlerType = "command" | "mcpTool" | "prompt" | "agent"
export type HookScope = "thread" | "turn"
export type HookSource =
  | "system"
  | "user"
  | "project"
  | "mdm"
  | "sessionFlags"
  | "plugin"
  | "cloudRequirements"
  | "cloudManagedConfig"
  | "legacyManagedConfigFile"
  | "legacyManagedConfigMdm"
  | "unknown"
export type HookRunStatus = "running" | "completed" | "failed" | "blocked" | "stopped"
export type TurnCompletedNotificationMethod = "turn/completed"
export type HookCompletedNotificationMethod = "hook/completed"
export type TurnDiffUpdatedNotificationMethod = "turn/diff/updated"
export type TurnPlanUpdatedNotificationMethod = "turn/plan/updated"
export type TurnPlanStepStatus = "pending" | "inProgress" | "completed"
export type ItemStartedNotificationMethod = "item/started"
export type ItemAutoApprovalReviewStartedNotificationMethod = "item/autoApprovalReview/started"
export type GuardianApprovalReviewAction =
  | CommandGuardianApprovalReviewAction
  | ExecveGuardianApprovalReviewAction
  | WriteStdinGuardianApprovalReviewAction
  | ApplyPatchGuardianApprovalReviewAction
  | NetworkAccessGuardianApprovalReviewAction
  | McpToolCallGuardianApprovalReviewAction
  | RequestPermissionsGuardianApprovalReviewAction
export type GuardianCommandSource = "shell" | "unifiedExec"
export type CommandGuardianApprovalReviewActionType = "command"
export type ExecveGuardianApprovalReviewActionType = "execve"
export type WriteStdinGuardianApprovalReviewActionType = "writeStdin"
export type ApplyPatchGuardianApprovalReviewActionType = "applyPatch"
export type NetworkApprovalProtocol = "http" | "https" | "socks5Tcp" | "socks5Udp"
export type NetworkAccessGuardianApprovalReviewActionType = "networkAccess"
export type McpToolCallGuardianApprovalReviewActionType = "mcpToolCall"
export type FileSystemAccessMode = "read" | "write" | "deny"
export type FileSystemPath = PathFileSystemPath | GlobPatternFileSystemPath | SpecialFileSystemPath
export type PathFileSystemPathType = "path"
export type GlobPatternFileSystemPathType = "glob_pattern"
export type SpecialFileSystemPathType = "special"
export type FileSystemSpecialPath =
  | RootFileSystemSpecialPath
  | MinimalFileSystemSpecialPath
  | KindFileSystemSpecialPath
  | TmpdirFileSystemSpecialPath
  | SlashTmpFileSystemSpecialPath
  | {
      kind: "unknown"
      path: string
      subpath?: LegacyAppPathString | null
      [k: string]: unknown
    }
export type RequestPermissionsGuardianApprovalReviewActionType = "requestPermissions"
/**
 * [UNSTABLE] Risk level assigned by approval auto-review.
 */
export type GuardianRiskLevel = "low" | "medium" | "high" | "critical"
/**
 * [UNSTABLE] Lifecycle state for an approval auto-review.
 */
export type GuardianApprovalReviewStatus =
  "inProgress" | "approved" | "denied" | "timedOut" | "aborted"
/**
 * [UNSTABLE] Authorization level assigned by approval auto-review.
 */
export type GuardianUserAuthorization = "unknown" | "low" | "medium" | "high"
export type ItemAutoApprovalReviewCompletedNotificationMethod = "item/autoApprovalReview/completed"
/**
 * [UNSTABLE] Source that produced a terminal approval auto-review decision.
 */
export type AutoReviewDecisionSource = "agent"
export type AutoApprovalReviewStrictReviewRequiredNotificationMethod =
  "autoApprovalReview/strictReviewRequired"
export type ItemCompletedNotificationMethod = "item/completed"
export type ItemAgentMessageDeltaNotificationMethod = "item/agentMessage/delta"
export type ItemPlanDeltaNotificationMethod = "item/plan/delta"
export type CommandExecOutputDeltaNotificationMethod = "command/exec/outputDelta"
/**
 * Stream label for `command/exec/outputDelta` notifications.
 */
export type CommandExecOutputStream = "stdout" | "stderr"
export type ProcessOutputDeltaNotificationMethod = "process/outputDelta"
/**
 * Stream label for `process/outputDelta` notifications.
 */
export type ProcessOutputStream = "stdout" | "stderr"
export type ProcessExitedNotificationMethod = "process/exited"
export type ItemCommandExecutionOutputDeltaNotificationMethod = "item/commandExecution/outputDelta"
export type ItemCommandExecutionTerminalInteractionNotificationMethod =
  "item/commandExecution/terminalInteraction"
export type ItemFileChangeOutputDeltaNotificationMethod = "item/fileChange/outputDelta"
export type ItemFileChangePatchUpdatedNotificationMethod = "item/fileChange/patchUpdated"
export type ServerRequestResolvedNotificationMethod = "serverRequest/resolved"
export type RequestId = string | number
export type ItemMcpToolCallProgressNotificationMethod = "item/mcpToolCall/progress"
export type McpServerOauthLoginCompletedNotificationMethod = "mcpServer/oauthLogin/completed"
export type McpServerStartupStatusUpdatedNotificationMethod = "mcpServer/startupStatus/updated"
export type McpServerStartupFailureReason = "reauthenticationRequired"
export type McpServerStartupState = "starting" | "ready" | "failed" | "cancelled"
export type McpServerEventStreamNotificationNotificationMethod =
  "mcpServer/event/stream/notification"
export type AccountUpdatedNotificationMethod = "account/updated"
/**
 * Authentication mode for OpenAI-backed providers.
 */
export type AuthMode =
  | "apikey"
  | "chatgpt"
  | "chatgptAuthTokens"
  | "headers"
  | "agentIdentity"
  | "personalAccessToken"
  | "bedrockApiKey"
  | "bedrockAccessKeys"
export type PlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "prolite"
  | "team"
  | "self_serve_business_prolite"
  | "self_serve_business_usage_based"
  | "business"
  | "ent26"
  | "enterprise_cbp_automation"
  | "enterprise_cbp_usage_based"
  | "enterprise"
  | "edu"
  | "edu_plus"
  | "edu_pro"
  | "unknown"
export type AccountRateLimitsUpdatedNotificationMethod = "account/rateLimits/updated"
export type RateLimitReachedType =
  | "rate_limit_reached"
  | "workspace_owner_credits_depleted"
  | "workspace_member_credits_depleted"
  | "workspace_owner_usage_limit_reached"
  | "workspace_member_usage_limit_reached"
export type AppListUpdatedNotificationMethod = "app/list/updated"
export type RemoteControlStatusChangedNotificationMethod = "remoteControl/status/changed"
export type RemoteControlConnectionStatus = "disabled" | "connecting" | "connected" | "errored"
export type ExternalAgentConfigImportProgressNotificationMethod =
  "externalAgentConfig/import/progress"
export type ExternalAgentConfigMigrationItemType =
  | "AGENTS_MD"
  | "CONFIG"
  | "SKILLS"
  | "PLUGINS"
  | "MCP_SERVER_CONFIG"
  | "SUBAGENTS"
  | "HOOKS"
  | "COMMANDS"
  | "MEMORY"
  | "SESSIONS"
export type ExternalAgentConfigImportCompletedNotificationMethod =
  "externalAgentConfig/import/completed"
export type FsChangedNotificationMethod = "fs/changed"
export type ItemReasoningSummaryTextDeltaNotificationMethod = "item/reasoning/summaryTextDelta"
export type ItemReasoningSummaryPartAddedNotificationMethod = "item/reasoning/summaryPartAdded"
export type ItemReasoningTextDeltaNotificationMethod = "item/reasoning/textDelta"
export type ThreadCompactedNotificationMethod = "thread/compacted"
export type ModelReroutedNotificationMethod = "model/rerouted"
export type ModelRerouteReason = "highRiskCyberActivity"
export type ModelVerificationNotificationMethod = "model/verification"
export type ModelVerification = "trustedAccessForCyber"
export type ModelProviderAuthRecoveryStartedNotificationMethod = "modelProvider/authRecoveryStarted"
export type ModelProviderAuthRecoveryCompletedNotificationMethod =
  "modelProvider/authRecoveryCompleted"
export type TurnModerationMetadataNotificationMethod = "turn/moderationMetadata"
export type ModelSafetyBufferingUpdatedNotificationMethod = "model/safetyBuffering/updated"
export type WarningNotificationMethod = "warning"
export type GuardianWarningNotificationMethod = "guardianWarning"
export type DeprecationNoticeNotificationMethod = "deprecationNotice"
export type ConfigWarningNotificationMethod = "configWarning"
export type FuzzyFileSearchSessionUpdatedNotificationMethod = "fuzzyFileSearch/sessionUpdated"
export type FuzzyFileSearchMatchType = "file" | "directory"
export type FuzzyFileSearchSessionCompletedNotificationMethod = "fuzzyFileSearch/sessionCompleted"
export type ThreadRealtimeStartedNotificationMethod = "thread/realtime/started"
export type RealtimeConversationVersion = "v1" | "v2" | "v3"
export type ThreadRealtimeItemAddedNotificationMethod = "thread/realtime/itemAdded"
export type ThreadRealtimeItemStartedNotificationMethod = "thread/realtime/item/started"
/**
 * EXPERIMENTAL - a thread-scoped realtime item in the canonical timeline.
 */
export type ThreadRealtimeItem = {
  id: string
  realtimeSessionId: string
  [k: string]: unknown
} & ThreadRealtimeItem1
export type ThreadRealtimeItem1 =
  | RealtimeSessionStartedThreadRealtimeItem
  | TranscriptSegmentThreadRealtimeItem
  | BemItemPromotedThreadRealtimeItem
  | RealtimeSessionClosedThreadRealtimeItem
export type RealtimeSessionStartedThreadRealtimeItemType = "realtimeSessionStarted"
export type ThreadRealtimeTranscriptRole = "user" | "assistant"
export type TranscriptSegmentThreadRealtimeItemType = "transcriptSegment"
/**
 * EXPERIMENTAL - how an existing agent item appears in a realtime conversation.
 */
export type ThreadRealtimeBemItemPresentation =
  | WholeItemThreadRealtimeBemItemPresentation
  | InlineMarkdownThreadRealtimeBemItemPresentation
  | InlineVisualizationThreadRealtimeBemItemPresentation
export type WholeItemThreadRealtimeBemItemPresentationType = "wholeItem"
export type InlineMarkdownThreadRealtimeBemItemPresentationType = "inlineMarkdown"
export type InlineVisualizationThreadRealtimeBemItemPresentationType = "inlineVisualization"
export type BemItemPromotedThreadRealtimeItemType = "bemItemPromoted"
export type ThreadRealtimeSessionOutcome = "ended" | "failed"
export type RealtimeSessionClosedThreadRealtimeItemType = "realtimeSessionClosed"
export type ThreadRealtimeItemTranscriptDeltaNotificationMethod =
  "thread/realtime/item/transcript/delta"
export type ThreadRealtimeItemCompletedNotificationMethod = "thread/realtime/item/completed"
export type ThreadRealtimeTranscriptDeltaNotificationMethod = "thread/realtime/transcript/delta"
export type ThreadRealtimeTranscriptDoneNotificationMethod = "thread/realtime/transcript/done"
export type ThreadRealtimeOutputAudioDeltaNotificationMethod = "thread/realtime/outputAudio/delta"
export type ThreadRealtimeSdpNotificationMethod = "thread/realtime/sdp"
export type ThreadRealtimeErrorNotificationMethod = "thread/realtime/error"
export type ThreadRealtimeClosedNotificationMethod = "thread/realtime/closed"
export type WindowsWorldWritableWarningNotificationMethod = "windows/worldWritableWarning"
export type WindowsSandboxSetupCompletedNotificationMethod = "windowsSandbox/setupCompleted"
export type WindowsSandboxSetupMode = "elevated" | "unelevated"
export type AccountLoginCompletedNotificationMethod = "account/login/completed"
export type DesktopOnboardingEntrypoint = "life_sciences"

/**
 * NEW NOTIFICATIONS
 */
export interface ErrorNotification {
  method: ErrorNotificationMethod
  params: ErrorNotification1
  [k: string]: unknown
}
export interface ErrorNotification1 {
  error: TurnError
  threadId: string
  turnId: string
  willRetry: boolean
  [k: string]: unknown
}
export interface TurnError {
  additionalDetails?: string | null
  codexErrorInfo?: CodexErrorInfo | null
  message: string
  /**
   * Optional public explanation and continuation instruction for a misalignment block.
   */
  misalignment?: MisalignmentErrorDetails | null
  [k: string]: unknown
}
export interface HttpConnectionFailedCodexErrorInfo {
  httpConnectionFailed: {
    httpStatusCode?: number | null
    [k: string]: unknown
  }
}
/**
 * Failed to connect to the response SSE stream.
 */
export interface ResponseStreamConnectionFailedCodexErrorInfo {
  responseStreamConnectionFailed: {
    httpStatusCode?: number | null
    [k: string]: unknown
  }
}
/**
 * The response SSE stream disconnected in the middle of a turn before completion.
 */
export interface ResponseStreamDisconnectedCodexErrorInfo {
  responseStreamDisconnected: {
    httpStatusCode?: number | null
    [k: string]: unknown
  }
}
/**
 * Reached the retry limit for responses.
 */
export interface ResponseTooManyFailedAttemptsCodexErrorInfo {
  responseTooManyFailedAttempts: {
    httpStatusCode?: number | null
    [k: string]: unknown
  }
}
/**
 * Returned when `turn/start` or `turn/steer` is submitted while the current active turn cannot accept same-turn steering, for example `/review` or manual `/compact`.
 */
export interface ActiveTurnNotSteerableCodexErrorInfo {
  activeTurnNotSteerable: {
    turnKind: NonSteerableTurnKind
    [k: string]: unknown
  }
}
export interface MisalignmentErrorDetails {
  /**
   * A substantive localized explanation is required before offering continuation.
   */
  detailedExplanation?: string | null
  /**
   * Open-ended classification; clients must accept categories added by Responses.
   */
  errorType?: string | null
  /**
   * Instruction to submit as the next turn's user input if continuation is confirmed.
   */
  steer?: MisalignmentSteer | null
  [k: string]: unknown
}
export interface MisalignmentSteer {
  message: string
  [k: string]: unknown
}
export interface ThreadStartedNotification {
  method: ThreadStartedNotificationMethod
  params: ThreadStartedNotification1
  [k: string]: unknown
}
export interface ThreadStartedNotification1 {
  thread: Thread
  [k: string]: unknown
}
export interface Thread {
  /**
   * Optional random unique nickname assigned to an AgentControl-spawned sub-agent.
   */
  agentNickname?: string | null
  /**
   * Optional role (agent_role) assigned to an AgentControl-spawned sub-agent.
   */
  agentRole?: string | null
  /**
   * Version of the CLI that created the thread.
   */
  cliVersion: string
  /**
   * Unix timestamp (in seconds) when the thread was created.
   */
  createdAt: number
  /**
   * Working directory captured for the thread.
   */
  cwd: AbsolutePathBuf
  /**
   * Whether the thread is ephemeral and should not be materialized on disk.
   */
  ephemeral: boolean
  /**
   * Source thread id when this thread was created by forking another thread.
   */
  forkedFromId?: string | null
  /**
   * Optional Git metadata captured when the thread was created.
   */
  gitInfo?: GitInfo | null
  /**
   * Persisted thread history contract selected when this thread was created.
   */
  historyMode?: ThreadHistoryMode & string
  /**
   * Identifier for this thread. Codex-generated thread IDs are UUIDv7.
   */
  id: string
  /**
   * Current configured model when loaded, otherwise the latest persisted model. Null when unavailable. This is not per-turn execution telemetry.
   */
  model?: string | null
  /**
   * Model provider used for this thread (for example, 'openai').
   */
  modelProvider: string
  /**
   * Optional user-facing thread title.
   */
  name?: string | null
  /**
   * The ID of the parent thread. This will only be set if this thread is a subagent.
   */
  parentThreadId?: string | null
  /**
   * [UNSTABLE] Path to the thread on disk.
   */
  path?: string | null
  /**
   * Usually the first user message in the thread, if available.
   */
  preview: string
  /**
   * Canonical project assignment owned by app-server, if any.
   */
  projectId: string | null
  /**
   * Current configured reasoning effort when loaded, otherwise the latest persisted effort. Null when unset or unavailable. This is not per-turn execution telemetry.
   */
  reasoningEffort?: ReasoningEffort | null
  /**
   * Unix timestamp (in seconds) used for thread recency ordering.
   */
  recencyAt?: number | null
  /**
   * The independently persisted section selected for this thread, if any.
   */
  section?: ThreadSection | null
  /**
   * Unix timestamp in seconds when the thread entered its current section.
   */
  sectionEnteredAt?: number | null
  /**
   * Session id shared by threads that belong to the same session tree.
   */
  sessionId: string
  /**
   * Origin of the thread (CLI, VSCode, codex exec, codex app-server, etc.).
   */
  source: SessionSource
  /**
   * Current runtime status for the thread.
   */
  status: ThreadStatus
  /**
   * Optional analytics source classification for this thread.
   */
  threadSource?: ThreadSource | null
  /**
   * Only populated on `thread/resume`, `thread/rollback`, `thread/fork`, and `thread/read` (when `includeTurns` is true) responses. For all other responses and notifications returning a Thread, the turns field will be an empty list.
   */
  turns: Turn[]
  /**
   * Unix timestamp (in seconds) when the thread was last updated.
   */
  updatedAt: number
  [k: string]: unknown
}
export interface GitInfo {
  branch?: string | null
  originUrl?: string | null
  sha?: string | null
  [k: string]: unknown
}
/**
 * An independently persisted, user-visible thread section.
 */
export interface ThreadSection {
  /**
   * Optional appearance synchronized across clients.
   */
  appearance?: ThreadSectionAppearance | null
  /**
   * Opaque UUIDv7 identity that remains stable when the section is renamed.
   */
  id: string
  /**
   * The current user-visible section name.
   */
  name: string
  [k: string]: unknown
}
/**
 * Extensible visual presentation for a custom thread section.
 */
export interface ThreadSectionAppearance {
  color?: string | null
  icon?: string | null
  [k: string]: unknown
}
export interface CustomSessionSource {
  custom: string
}
export interface SubAgentSessionSource {
  subAgent: SubAgentSource
}
export interface ThreadSpawnSubAgentSource {
  thread_spawn: {
    agent_nickname?: string | null
    agent_path?: AgentPath | null
    agent_role?: string | null
    depth: number
    parent_thread_id: ThreadId
    [k: string]: unknown
  }
}
export interface OtherSubAgentSource {
  other: string
}
export interface NotLoadedThreadStatus {
  type: NotLoadedThreadStatusType
  [k: string]: unknown
}
export interface IdleThreadStatus {
  type: IdleThreadStatusType
  [k: string]: unknown
}
export interface SystemErrorThreadStatus {
  type: SystemErrorThreadStatusType
  [k: string]: unknown
}
export interface ActiveThreadStatus {
  activeFlags: ThreadActiveFlag[]
  type: ActiveThreadStatusType
  [k: string]: unknown
}
export interface Turn {
  /**
   * Unix timestamp (in seconds) when the turn completed.
   */
  completedAt?: number | null
  /**
   * Duration between turn start and completion in milliseconds, if known.
   */
  durationMs?: number | null
  /**
   * Only populated when the Turn's status is failed.
   */
  error?: TurnError | null
  /**
   * Identifier for this turn. Codex-generated turn IDs are UUIDv7.
   */
  id: string
  /**
   * Thread items currently included in this turn payload.
   */
  items: ThreadItem[]
  /**
   * Describes how much of `items` has been loaded for this turn.
   */
  itemsView?: TurnItemsView & string
  /**
   * Unix timestamp (in seconds) when the turn started.
   */
  startedAt?: number | null
  status: TurnStatus
  [k: string]: unknown
}
export interface UserMessageThreadItem {
  clientId?: string | null
  content: UserInput[]
  id: string
  type: UserMessageThreadItemType
  [k: string]: unknown
}
export interface TextUserInput {
  text: string
  /**
   * UI-defined spans within `text` used to render or persist special elements.
   */
  text_elements?: TextElement[]
  type: TextUserInputType
  [k: string]: unknown
}
export interface TextElement {
  /**
   * Byte range in the parent `text` buffer that this element occupies.
   */
  byteRange: ByteRange
  /**
   * Optional human-readable placeholder for the element, displayed in the UI.
   */
  placeholder?: string | null
  [k: string]: unknown
}
export interface ByteRange {
  end: number
  start: number
  [k: string]: unknown
}
export interface ImageUserInput {
  detail?: ImageDetail | null
  type: ImageUserInputType
  url: string
  [k: string]: unknown
}
export interface LocalImageUserInput {
  detail?: ImageDetail | null
  path: string
  type: LocalImageUserInputType
  [k: string]: unknown
}
export interface AudioUserInput {
  type: AudioUserInputType
  url: string
  [k: string]: unknown
}
export interface LocalAudioUserInput {
  path: string
  type: LocalAudioUserInputType
  [k: string]: unknown
}
export interface SkillUserInput {
  name: string
  path: string
  type: SkillUserInputType
  [k: string]: unknown
}
export interface MentionUserInput {
  name: string
  path: string
  type: MentionUserInputType
  [k: string]: unknown
}
export interface HookPromptThreadItem {
  fragments: HookPromptFragment[]
  id: string
  type: HookPromptThreadItemType
  [k: string]: unknown
}
export interface HookPromptFragment {
  hookRunId: string
  text: string
  [k: string]: unknown
}
export interface AgentMessageThreadItem {
  delivery?: AgentMessageDelivery | null
  id: string
  memoryCitation?: MemoryCitation | null
  phase?: MessagePhase | null
  questions?: AsyncUserInputQuestion[] | null
  text: string
  type: AgentMessageThreadItemType
  [k: string]: unknown
}
export interface MemoryCitation {
  entries: MemoryCitationEntry[]
  threadIds: string[]
  [k: string]: unknown
}
export interface MemoryCitationEntry {
  lineEnd: number
  lineStart: number
  note: string
  path: string
  [k: string]: unknown
}
export interface AsyncUserInputQuestion {
  options?: string[] | null
  title: string
}
export interface FunctionCallOutputThreadItem {
  id: string
  name: string
  namespace?: string | null
  output: FunctionCallOutputBody
  type: FunctionCallOutputThreadItemType
  [k: string]: unknown
}
export interface InputTextFunctionCallOutputContentItem {
  text: string
  type: InputTextFunctionCallOutputContentItemType
  [k: string]: unknown
}
export interface InputImageFunctionCallOutputContentItem {
  detail?: ImageDetail | null
  image_url: string
  type: InputImageFunctionCallOutputContentItemType
  [k: string]: unknown
}
export interface InputAudioFunctionCallOutputContentItem {
  audio_url: string
  type: InputAudioFunctionCallOutputContentItemType
  [k: string]: unknown
}
export interface EncryptedContentFunctionCallOutputContentItem {
  encrypted_content: string
  type: EncryptedContentFunctionCallOutputContentItemType
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - proposed plan item content. The completed plan item is authoritative and may not match the concatenation of `PlanDelta` text.
 */
export interface PlanThreadItem {
  id: string
  text: string
  type: PlanThreadItemType
  [k: string]: unknown
}
export interface ReasoningThreadItem {
  content?: string[]
  id: string
  summary?: string[]
  type: ReasoningThreadItemType
  [k: string]: unknown
}
export interface CommandExecutionThreadItem {
  /**
   * The command's output, aggregated from stdout and stderr.
   */
  aggregatedOutput?: string | null
  /**
   * The command to be executed.
   */
  command: string
  /**
   * A best-effort parsing of the command to understand the action(s) it will perform. This returns a list of CommandAction objects because a single shell command may be composed of many commands piped together.
   */
  commandActions: CommandAction[]
  /**
   * The command's working directory.
   */
  cwd: LegacyAppPathString
  /**
   * The duration of the command execution in milliseconds.
   */
  durationMs?: number | null
  /**
   * The command's exit code.
   */
  exitCode?: number | null
  id: string
  /**
   * Trusted first-party plugin id when this command resolves to one plugin script.
   */
  pluginId?: string | null
  /**
   * Identifier for the underlying PTY process (when available).
   */
  processId?: string | null
  /**
   * Safe plugin-relative path when this command resolves to one plugin script.
   */
  scriptPath?: string | null
  source?: CommandExecutionSource & string
  status: CommandExecutionStatus
  type: CommandExecutionThreadItemType
  [k: string]: unknown
}
export interface ReadCommandAction {
  command: string
  name: string
  path: LegacyAppPathString
  type: ReadCommandActionType
  [k: string]: unknown
}
export interface ListFilesCommandAction {
  command: string
  path?: string | null
  type: ListFilesCommandActionType
  [k: string]: unknown
}
export interface SearchCommandAction {
  command: string
  path?: string | null
  query?: string | null
  type: SearchCommandActionType
  [k: string]: unknown
}
export interface UnknownCommandAction {
  command: string
  type: UnknownCommandActionType
  [k: string]: unknown
}
export interface FileChangeThreadItem {
  changes: FileUpdateChange[]
  id: string
  status: PatchApplyStatus
  type: FileChangeThreadItemType
  [k: string]: unknown
}
export interface FileUpdateChange {
  diff: string
  kind: PatchChangeKind
  path: string
  [k: string]: unknown
}
export interface AddPatchChangeKind {
  type: AddPatchChangeKindType
  [k: string]: unknown
}
export interface DeletePatchChangeKind {
  type: DeletePatchChangeKindType
  [k: string]: unknown
}
export interface UpdatePatchChangeKind {
  move_path?: string | null
  type: UpdatePatchChangeKindType
  [k: string]: unknown
}
export interface McpToolCallThreadItem {
  appContext?: McpToolCallAppContext | null
  arguments: unknown
  /**
   * The duration of the MCP tool call in milliseconds.
   */
  durationMs?: number | null
  error?: McpToolCallError | null
  id: string
  /**
   * Deprecated: use `appContext.resourceUri` instead.
   */
  mcpAppResourceUri?: string | null
  pluginId?: string | null
  readOnlyHint?: boolean | null
  result?: McpToolCallResult | null
  server: string
  status: McpToolCallStatus
  tool: string
  type: McpToolCallThreadItemType
  [k: string]: unknown
}
export interface McpToolCallAppContext {
  actionName?: string | null
  appName?: string | null
  connectorId: string
  linkId?: string | null
  resourceUri?: string | null
  [k: string]: unknown
}
export interface McpToolCallError {
  message: string
  [k: string]: unknown
}
export interface McpToolCallResult {
  _meta?: unknown
  content: unknown[]
  structuredContent?: unknown
  [k: string]: unknown
}
export interface DynamicToolCallThreadItem {
  arguments: unknown
  contentItems?: DynamicToolCallOutputContentItem[] | null
  /**
   * The duration of the dynamic tool call in milliseconds.
   */
  durationMs?: number | null
  id: string
  namespace?: string | null
  status: DynamicToolCallStatus
  success?: boolean | null
  tool: string
  type: DynamicToolCallThreadItemType
  [k: string]: unknown
}
export interface InputTextDynamicToolCallOutputContentItem {
  text: string
  type: InputTextDynamicToolCallOutputContentItemType
  [k: string]: unknown
}
export interface InputImageDynamicToolCallOutputContentItem {
  imageUrl: string
  type: InputImageDynamicToolCallOutputContentItemType
  [k: string]: unknown
}
export interface InputAudioDynamicToolCallOutputContentItem {
  audioUrl: string
  type: InputAudioDynamicToolCallOutputContentItemType
  [k: string]: unknown
}
export interface CollabAgentToolCallThreadItem {
  /**
   * Last known status of the target agents, when available.
   */
  agentsStates: {
    [k: string]: CollabAgentState
  }
  /**
   * Unique identifier for this collab tool call.
   */
  id: string
  /**
   * Model requested for the spawned agent, when applicable.
   */
  model?: string | null
  /**
   * Prompt text sent as part of the collab tool call, when available.
   */
  prompt?: string | null
  /**
   * Reasoning effort requested for the spawned agent, when applicable.
   */
  reasoningEffort?: ReasoningEffort | null
  /**
   * Thread ID of the receiving agent, when applicable. In case of spawn operation, this corresponds to the newly spawned agent.
   */
  receiverThreadIds: string[]
  /**
   * Thread ID of the agent issuing the collab request.
   */
  senderThreadId: string
  /**
   * Current status of the collab tool call.
   */
  status: CollabAgentToolCallStatus
  /**
   * Name of the collab tool that was invoked.
   */
  tool: CollabAgentTool
  type: CollabAgentToolCallThreadItemType
  [k: string]: unknown
}
export interface CollabAgentState {
  message?: string | null
  status: CollabAgentStatus
  [k: string]: unknown
}
export interface SubAgentActivityThreadItem {
  agentPath: string
  agentThreadId: string
  id: string
  kind: SubAgentActivityKind
  type: SubAgentActivityThreadItemType
  [k: string]: unknown
}
export interface WebSearchThreadItem {
  action?: WebSearchAction | null
  id: string
  query: string
  /**
   * Structured search results returned out-of-band by standalone web search.
   *
   * These stay as opaque JSON at the extension/app-server boundary so new result fields and result types can pass through without a Codex release.
   */
  results?: unknown[] | null
  type: WebSearchThreadItemType
  [k: string]: unknown
}
export interface SearchWebSearchAction {
  queries?: string[] | null
  query?: string | null
  type: SearchWebSearchActionType
  [k: string]: unknown
}
export interface OpenPageWebSearchAction {
  type: OpenPageWebSearchActionType
  url?: string | null
  [k: string]: unknown
}
export interface FindInPageWebSearchAction {
  pattern?: string | null
  type: FindInPageWebSearchActionType
  url?: string | null
  [k: string]: unknown
}
export interface OtherWebSearchAction {
  type: OtherWebSearchActionType
  [k: string]: unknown
}
export interface ImageViewThreadItem {
  id: string
  path: LegacyAppPathString
  type: ImageViewThreadItemType
  [k: string]: unknown
}
/**
 * Display item emitted by the interruptible `clock.sleep` tool.
 */
export interface SleepThreadItem {
  durationMs: number
  id: string
  type: SleepThreadItemType
  [k: string]: unknown
}
export interface ImageGenerationThreadItem {
  failure?: ImageGenerationFailure | null
  id: string
  result: string
  revisedPrompt?: string | null
  savedPath?: AbsolutePathBuf | null
  status: string
  transparentBackground?: boolean | null
  type: ImageGenerationThreadItemType
  [k: string]: unknown
}
export interface UsageLimitExceededImageGenerationFailure {
  limitId: string
  resetsAt?: number | null
  type: UsageLimitExceededImageGenerationFailureType
  [k: string]: unknown
}
export interface EnteredReviewModeThreadItem {
  id: string
  review: string
  type: EnteredReviewModeThreadItemType
  [k: string]: unknown
}
export interface ExitedReviewModeThreadItem {
  id: string
  review: string
  type: ExitedReviewModeThreadItemType
  [k: string]: unknown
}
export interface ContextCompactionThreadItem {
  id: string
  type: ContextCompactionThreadItemType
  [k: string]: unknown
}
export interface ThreadStatusChangedNotification {
  method: ThreadStatusChangedNotificationMethod
  params: ThreadStatusChangedNotification1
  [k: string]: unknown
}
export interface ThreadStatusChangedNotification1 {
  status: ThreadStatus
  threadId: string
  [k: string]: unknown
}
export interface ThreadArchivedNotification {
  method: ThreadArchivedNotificationMethod
  params: ThreadArchivedNotification1
  [k: string]: unknown
}
export interface ThreadArchivedNotification1 {
  threadId: string
  [k: string]: unknown
}
export interface ThreadDeletedNotification {
  method: ThreadDeletedNotificationMethod
  params: ThreadDeletedNotification1
  [k: string]: unknown
}
export interface ThreadDeletedNotification1 {
  threadId: string
  [k: string]: unknown
}
export interface ThreadUnarchivedNotification {
  method: ThreadUnarchivedNotificationMethod
  params: ThreadUnarchivedNotification1
  [k: string]: unknown
}
export interface ThreadUnarchivedNotification1 {
  threadId: string
  [k: string]: unknown
}
export interface ThreadClosedNotification {
  method: ThreadClosedNotificationMethod
  params: ThreadClosedNotification1
  [k: string]: unknown
}
export interface ThreadClosedNotification1 {
  threadId: string
  [k: string]: unknown
}
export interface ThreadRevertedNotification {
  method: ThreadRevertedNotificationMethod
  params: ThreadRevertedNotification1
  [k: string]: unknown
}
export interface ThreadRevertedNotification1 {
  threadId: string
  [k: string]: unknown
}
export interface SkillsChangedNotification {
  method: SkillsChangedNotificationMethod
  params: SkillsChangedNotification1
  [k: string]: unknown
}
/**
 * Notification emitted when watched local skill files change.
 *
 * Treat this as an invalidation signal and re-run `skills/list` with the client's current parameters when refreshed skill metadata is needed.
 */
export interface SkillsChangedNotification1 {
  [k: string]: unknown
}
export interface ThreadNameUpdatedNotification {
  method: ThreadNameUpdatedNotificationMethod
  params: ThreadNameUpdatedNotification1
  [k: string]: unknown
}
export interface ThreadNameUpdatedNotification1 {
  threadId: string
  threadName?: string | null
  [k: string]: unknown
}
export interface ThreadGoalUpdatedNotification {
  method: ThreadGoalUpdatedNotificationMethod
  params: ThreadGoalUpdatedNotification1
  [k: string]: unknown
}
export interface ThreadGoalUpdatedNotification1 {
  goal: ThreadGoal
  threadId: string
  turnId?: string | null
  [k: string]: unknown
}
export interface ThreadGoal {
  createdAt: number
  objective: string
  status: ThreadGoalStatus
  threadId: string
  timeUsedSeconds: number
  tokenBudget?: number | null
  tokensUsed: number
  updatedAt: number
  [k: string]: unknown
}
export interface ThreadGoalClearedNotification {
  method: ThreadGoalClearedNotificationMethod
  params: ThreadGoalClearedNotification1
  [k: string]: unknown
}
export interface ThreadGoalClearedNotification1 {
  threadId: string
  [k: string]: unknown
}
export interface ThreadQueueChangedNotification {
  method: ThreadQueueChangedNotificationMethod
  params: ThreadQueueChangedNotification1
  [k: string]: unknown
}
export interface ThreadQueueChangedNotification1 {
  threadId: string
  [k: string]: unknown
}
export interface ProjectChangedNotification {
  method: ProjectChangedNotificationMethod
  params: ProjectChangedNotification1
  [k: string]: unknown
}
export interface ProjectChangedNotification1 {
  changeType: ProjectChangeType
  projectId: string
  [k: string]: unknown
}
export interface ThreadProjectUpdatedNotification {
  method: ThreadProjectUpdatedNotificationMethod
  params: ThreadProjectUpdatedNotification1
  [k: string]: unknown
}
export interface ThreadProjectUpdatedNotification1 {
  projectId: string | null
  threadId: string
  [k: string]: unknown
}
export interface ThreadEnvironmentConnectedNotification {
  method: ThreadEnvironmentConnectedNotificationMethod
  params: EnvironmentConnectionNotification
  [k: string]: unknown
}
export interface EnvironmentConnectionNotification {
  environmentId: string
  threadId: string
  [k: string]: unknown
}
export interface ThreadEnvironmentDisconnectedNotification {
  method: ThreadEnvironmentDisconnectedNotificationMethod
  params: EnvironmentConnectionNotification
  [k: string]: unknown
}
export interface ThreadSettingsUpdatedNotification {
  method: ThreadSettingsUpdatedNotificationMethod
  params: ThreadSettingsUpdatedNotification1
  [k: string]: unknown
}
export interface ThreadSettingsUpdatedNotification1 {
  threadId: string
  threadSettings: ThreadSettings
  [k: string]: unknown
}
export interface ThreadSettings {
  activePermissionProfile?: ActivePermissionProfile | null
  approvalPolicy: AskForApproval
  approvalsReviewer: ApprovalsReviewer
  collaborationMode: CollaborationMode
  cwd: AbsolutePathBuf
  effort?: ReasoningEffort | null
  model: string
  modelProvider: string
  personality?: Personality | null
  sandboxPolicy: SandboxPolicy
  serviceTier?: string | null
  summary?: ReasoningSummary | null
  [k: string]: unknown
}
export interface ActivePermissionProfile {
  /**
   * Parent profile identifier from the selected permissions profile's `extends` setting, when present.
   */
  extends?: string | null
  /**
   * Identifier from `default_permissions` or the implicit built-in default, such as `:workspace` or a user-defined `[permissions.<id>]` profile.
   */
  id: string
  [k: string]: unknown
}
export interface GranularAskForApproval {
  granular: {
    mcp_elicitations: boolean
    request_permissions?: boolean
    rules: boolean
    sandbox_approval: boolean
    skill_approval?: boolean
    [k: string]: unknown
  }
}
/**
 * Collaboration mode for a Codex session.
 */
export interface CollaborationMode {
  mode: ModeKind
  settings: Settings
  [k: string]: unknown
}
/**
 * Settings for a collaboration mode.
 */
export interface Settings {
  developer_instructions?: string | null
  model: string
  reasoning_effort?: ReasoningEffort | null
  [k: string]: unknown
}
export interface DangerFullAccessSandboxPolicy {
  type: DangerFullAccessSandboxPolicyType
  [k: string]: unknown
}
export interface ReadOnlySandboxPolicy {
  networkAccess?: boolean
  type: ReadOnlySandboxPolicyType
  [k: string]: unknown
}
export interface ExternalSandboxSandboxPolicy {
  networkAccess?: NetworkAccess & string
  type: ExternalSandboxSandboxPolicyType
  [k: string]: unknown
}
export interface WorkspaceWriteSandboxPolicy {
  excludeSlashTmp?: boolean
  excludeTmpdirEnvVar?: boolean
  networkAccess?: boolean
  type: WorkspaceWriteSandboxPolicyType
  writableRoots?: AbsolutePathBuf[]
  [k: string]: unknown
}
export interface ThreadTokenUsageUpdatedNotification {
  method: ThreadTokenUsageUpdatedNotificationMethod
  params: ThreadTokenUsageUpdatedNotification1
  [k: string]: unknown
}
export interface ThreadTokenUsageUpdatedNotification1 {
  threadId: string
  tokenUsage: ThreadTokenUsage
  turnId: string
  [k: string]: unknown
}
export interface ThreadTokenUsage {
  last: TokenUsageBreakdown
  modelContextWindow?: number | null
  total: TokenUsageBreakdown
  [k: string]: unknown
}
export interface TokenUsageBreakdown {
  cacheWriteInputTokens?: number
  cachedInputTokens: number
  inputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  [k: string]: unknown
}
export interface TurnStartedNotification {
  method: TurnStartedNotificationMethod
  params: TurnStartedNotification1
  [k: string]: unknown
}
export interface TurnStartedNotification1 {
  threadId: string
  turn: Turn
  [k: string]: unknown
}
export interface HookStartedNotification {
  method: HookStartedNotificationMethod
  params: HookStartedNotification1
  [k: string]: unknown
}
export interface HookStartedNotification1 {
  run: HookRunSummary
  threadId: string
  turnId?: string | null
  [k: string]: unknown
}
export interface HookRunSummary {
  completedAt?: number | null
  displayOrder: number
  durationMs?: number | null
  entries: HookOutputEntry[]
  eventName: HookEventName
  executionMode: HookExecutionMode
  handlerType: HookHandlerType
  id: string
  scope: HookScope
  source?: HookSource & string
  sourcePath: AbsolutePathBuf
  startedAt: number
  status: HookRunStatus
  statusMessage?: string | null
  [k: string]: unknown
}
export interface HookOutputEntry {
  kind: HookOutputEntryKind
  text: string
  [k: string]: unknown
}
export interface TurnCompletedNotification {
  method: TurnCompletedNotificationMethod
  params: TurnCompletedNotification1
  [k: string]: unknown
}
export interface TurnCompletedNotification1 {
  threadId: string
  turn: Turn
  [k: string]: unknown
}
export interface HookCompletedNotification {
  method: HookCompletedNotificationMethod
  params: HookCompletedNotification1
  [k: string]: unknown
}
export interface HookCompletedNotification1 {
  run: HookRunSummary
  threadId: string
  turnId?: string | null
  [k: string]: unknown
}
export interface TurnDiffUpdatedNotification {
  method: TurnDiffUpdatedNotificationMethod
  params: TurnDiffUpdatedNotification1
  [k: string]: unknown
}
/**
 * Notification that the turn-level unified diff has changed. Contains the latest aggregated diff across all file changes in the turn.
 */
export interface TurnDiffUpdatedNotification1 {
  diff: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface TurnPlanUpdatedNotification {
  method: TurnPlanUpdatedNotificationMethod
  params: TurnPlanUpdatedNotification1
  [k: string]: unknown
}
export interface TurnPlanUpdatedNotification1 {
  explanation?: string | null
  plan: TurnPlanStep[]
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface TurnPlanStep {
  status: TurnPlanStepStatus
  step: string
  [k: string]: unknown
}
export interface ItemStartedNotification {
  method: ItemStartedNotificationMethod
  params: ItemStartedNotification1
  [k: string]: unknown
}
export interface ItemStartedNotification1 {
  item: ThreadItem
  /**
   * Unix timestamp (in milliseconds) when this item lifecycle started.
   */
  startedAtMs: number
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ItemAutoApprovalReviewStartedNotification {
  method: ItemAutoApprovalReviewStartedNotificationMethod
  params: ItemGuardianApprovalReviewStartedNotification
  [k: string]: unknown
}
/**
 * [UNSTABLE] Temporary notification payload for approval auto-review. This shape is expected to change soon.
 */
export interface ItemGuardianApprovalReviewStartedNotification {
  action: GuardianApprovalReviewAction
  review: GuardianApprovalReview
  /**
   * Stable identifier for this review.
   */
  reviewId: string
  /**
   * Unix timestamp (in milliseconds) when this review started.
   */
  startedAtMs: number
  /**
   * Identifier for the reviewed item or tool call when one exists.
   *
   * In most cases, one review maps to one target item. The exceptions are - execve reviews, where a single command may contain multiple execve calls to review (only possible when using the shell_zsh_fork feature) - stdin reviews, which refer to the existing parent command item and have a separate approval ID in the action payload - network policy reviews, where there is no target item
   *
   * A network call is triggered by a CommandExecution item, so having a target_item_id set to the CommandExecution item would be misleading because the review is about the network call, not the command execution. Therefore, target_item_id is set to None for network policy reviews.
   */
  targetItemId?: string | null
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface CommandGuardianApprovalReviewAction {
  command: string
  cwd: AbsolutePathBuf
  source: GuardianCommandSource
  type: CommandGuardianApprovalReviewActionType
  [k: string]: unknown
}
export interface ExecveGuardianApprovalReviewAction {
  argv: string[]
  cwd: AbsolutePathBuf
  program: string
  source: GuardianCommandSource
  type: ExecveGuardianApprovalReviewActionType
  [k: string]: unknown
}
/**
 * A child approval for input to an existing command execution item.
 */
export interface WriteStdinGuardianApprovalReviewAction {
  approvalId: string
  cwd: LegacyAppPathString
  processId: string
  stdin: string
  type: WriteStdinGuardianApprovalReviewActionType
  [k: string]: unknown
}
export interface ApplyPatchGuardianApprovalReviewAction {
  cwd: AbsolutePathBuf
  files: AbsolutePathBuf[]
  type: ApplyPatchGuardianApprovalReviewActionType
  [k: string]: unknown
}
export interface NetworkAccessGuardianApprovalReviewAction {
  host: string
  port: number
  protocol: NetworkApprovalProtocol
  target: string
  type: NetworkAccessGuardianApprovalReviewActionType
  [k: string]: unknown
}
export interface McpToolCallGuardianApprovalReviewAction {
  connectorId?: string | null
  connectorName?: string | null
  server: string
  toolName: string
  toolTitle?: string | null
  type: McpToolCallGuardianApprovalReviewActionType
  [k: string]: unknown
}
export interface RequestPermissionsGuardianApprovalReviewAction {
  permissions: RequestPermissionProfile
  reason?: string | null
  type: RequestPermissionsGuardianApprovalReviewActionType
  [k: string]: unknown
}
export interface RequestPermissionProfile {
  fileSystem?: AdditionalFileSystemPermissions | null
  network?: AdditionalNetworkPermissions | null
}
export interface AdditionalFileSystemPermissions {
  entries?: FileSystemSandboxEntry[] | null
  globScanMaxDepth?: number | null
  /**
   * This will be removed in favor of `entries`.
   */
  read?: LegacyAppPathString[] | null
  /**
   * This will be removed in favor of `entries`.
   */
  write?: LegacyAppPathString[] | null
  [k: string]: unknown
}
export interface FileSystemSandboxEntry {
  access: FileSystemAccessMode
  path: FileSystemPath
  [k: string]: unknown
}
export interface PathFileSystemPath {
  path: LegacyAppPathString
  type: PathFileSystemPathType
  [k: string]: unknown
}
export interface GlobPatternFileSystemPath {
  pattern: string
  type: GlobPatternFileSystemPathType
  [k: string]: unknown
}
export interface SpecialFileSystemPath {
  type: SpecialFileSystemPathType
  value: FileSystemSpecialPath
  [k: string]: unknown
}
export interface RootFileSystemSpecialPath {
  kind: "root"
  [k: string]: unknown
}
export interface MinimalFileSystemSpecialPath {
  kind: "minimal"
  [k: string]: unknown
}
export interface KindFileSystemSpecialPath {
  kind: "project_roots"
  subpath?: LegacyAppPathString | null
  [k: string]: unknown
}
export interface TmpdirFileSystemSpecialPath {
  kind: "tmpdir"
  [k: string]: unknown
}
export interface SlashTmpFileSystemSpecialPath {
  kind: "slash_tmp"
  [k: string]: unknown
}
export interface AdditionalNetworkPermissions {
  enabled?: boolean | null
  [k: string]: unknown
}
/**
 * [UNSTABLE] Temporary approval auto-review payload used by `item/autoApprovalReview/*` notifications. This shape is expected to change soon.
 */
export interface GuardianApprovalReview {
  rationale?: string | null
  riskLevel?: GuardianRiskLevel | null
  status: GuardianApprovalReviewStatus
  userAuthorization?: GuardianUserAuthorization | null
  [k: string]: unknown
}
export interface ItemAutoApprovalReviewCompletedNotification {
  method: ItemAutoApprovalReviewCompletedNotificationMethod
  params: ItemGuardianApprovalReviewCompletedNotification
  [k: string]: unknown
}
/**
 * [UNSTABLE] Temporary notification payload for approval auto-review. This shape is expected to change soon.
 */
export interface ItemGuardianApprovalReviewCompletedNotification {
  action: GuardianApprovalReviewAction
  /**
   * Unix timestamp (in milliseconds) when this review completed.
   */
  completedAtMs: number
  decisionSource: AutoReviewDecisionSource
  review: GuardianApprovalReview
  /**
   * Stable identifier for this review.
   */
  reviewId: string
  /**
   * Unix timestamp (in milliseconds) when this review started.
   */
  startedAtMs: number
  /**
   * Identifier for the reviewed item or tool call when one exists.
   *
   * In most cases, one review maps to one target item. The exceptions are - execve reviews, where a single command may contain multiple execve calls to review (only possible when using the shell_zsh_fork feature) - stdin reviews, which refer to the existing parent command item and have a separate approval ID in the action payload - network policy reviews, where there is no target item
   *
   * A network call is triggered by a CommandExecution item, so having a target_item_id set to the CommandExecution item would be misleading because the review is about the network call, not the command execution. Therefore, target_item_id is set to None for network policy reviews.
   */
  targetItemId?: string | null
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface AutoApprovalReviewStrictReviewRequiredNotification {
  method: AutoApprovalReviewStrictReviewRequiredNotificationMethod
  params: StrictReviewRequiredNotification
  [k: string]: unknown
}
export interface StrictReviewRequiredNotification {
  /**
   * Unix timestamp (in milliseconds) when this review started.
   */
  startedAtMs: number
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ItemCompletedNotification {
  method: ItemCompletedNotificationMethod
  params: ItemCompletedNotification1
  [k: string]: unknown
}
export interface ItemCompletedNotification1 {
  /**
   * Unix timestamp (in milliseconds) when this item lifecycle completed.
   */
  completedAtMs: number
  item: ThreadItem
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ItemAgentMessageDeltaNotification {
  method: ItemAgentMessageDeltaNotificationMethod
  params: AgentMessageDeltaNotification
  [k: string]: unknown
}
export interface AgentMessageDeltaNotification {
  delta: string
  itemId: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - proposed plan streaming deltas for plan items.
 */
export interface ItemPlanDeltaNotification {
  method: ItemPlanDeltaNotificationMethod
  params: PlanDeltaNotification
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - proposed plan streaming deltas for plan items. Clients should not assume concatenated deltas match the completed plan item content.
 */
export interface PlanDeltaNotification {
  delta: string
  itemId: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
/**
 * Stream base64-encoded stdout/stderr chunks for a running `command/exec` session.
 */
export interface CommandExecOutputDeltaNotification {
  method: CommandExecOutputDeltaNotificationMethod
  params: CommandExecOutputDeltaNotification1
  [k: string]: unknown
}
/**
 * Base64-encoded output chunk emitted for a streaming `command/exec` request.
 *
 * These notifications are connection-scoped. If the originating connection closes, the server terminates the process.
 */
export interface CommandExecOutputDeltaNotification1 {
  /**
   * `true` on the final streamed chunk for a stream when `outputBytesCap` truncated later output on that stream.
   */
  capReached: boolean
  /**
   * Base64-encoded output bytes.
   */
  deltaBase64: string
  /**
   * Client-supplied, connection-scoped `processId` from the original `command/exec` request.
   */
  processId: string
  /**
   * Output stream for this chunk.
   */
  stream: CommandExecOutputStream
  [k: string]: unknown
}
/**
 * Stream base64-encoded stdout/stderr chunks for a running `process/spawn` session.
 */
export interface ProcessOutputDeltaNotification {
  method: ProcessOutputDeltaNotificationMethod
  params: ProcessOutputDeltaNotification1
  [k: string]: unknown
}
/**
 * Base64-encoded output chunk emitted for a streaming `process/spawn` request.
 */
export interface ProcessOutputDeltaNotification1 {
  /**
   * True on the final streamed chunk for this stream when output was truncated by `outputBytesCap`.
   */
  capReached: boolean
  /**
   * Base64-encoded output bytes.
   */
  deltaBase64: string
  /**
   * Client-supplied, connection-scoped `processHandle` from `process/spawn`.
   */
  processHandle: string
  /**
   * Output stream this chunk belongs to.
   */
  stream: ProcessOutputStream
  [k: string]: unknown
}
/**
 * Final exit notification for a `process/spawn` session.
 */
export interface ProcessExitedNotification {
  method: ProcessExitedNotificationMethod
  params: ProcessExitedNotification1
  [k: string]: unknown
}
/**
 * Final process exit notification for `process/spawn`.
 */
export interface ProcessExitedNotification1 {
  /**
   * Process exit code.
   */
  exitCode: number
  /**
   * Client-supplied, connection-scoped `processHandle` from `process/spawn`.
   */
  processHandle: string
  /**
   * Buffered stderr capture.
   *
   * Empty when stderr was streamed via `process/outputDelta`.
   */
  stderr: string
  /**
   * Whether stderr reached `outputBytesCap`.
   *
   * In streaming mode, stderr is empty and cap state is also reported on the final stderr `process/outputDelta` notification.
   */
  stderrCapReached: boolean
  /**
   * Buffered stdout capture.
   *
   * Empty when stdout was streamed via `process/outputDelta`.
   */
  stdout: string
  /**
   * Whether stdout reached `outputBytesCap`.
   *
   * In streaming mode, stdout is empty and cap state is also reported on the final stdout `process/outputDelta` notification.
   */
  stdoutCapReached: boolean
  [k: string]: unknown
}
export interface ItemCommandExecutionOutputDeltaNotification {
  method: ItemCommandExecutionOutputDeltaNotificationMethod
  params: CommandExecutionOutputDeltaNotification
  [k: string]: unknown
}
export interface CommandExecutionOutputDeltaNotification {
  delta: string
  itemId: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ItemCommandExecutionTerminalInteractionNotification {
  method: ItemCommandExecutionTerminalInteractionNotificationMethod
  params: TerminalInteractionNotification
  [k: string]: unknown
}
export interface TerminalInteractionNotification {
  itemId: string
  processId: string
  stdin: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
/**
 * Deprecated legacy apply_patch output stream notification.
 */
export interface ItemFileChangeOutputDeltaNotification {
  method: ItemFileChangeOutputDeltaNotificationMethod
  params: FileChangeOutputDeltaNotification
  [k: string]: unknown
}
/**
 * Deprecated legacy notification for `apply_patch` textual output.
 *
 * The server no longer emits this notification.
 */
export interface FileChangeOutputDeltaNotification {
  delta: string
  itemId: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ItemFileChangePatchUpdatedNotification {
  method: ItemFileChangePatchUpdatedNotificationMethod
  params: FileChangePatchUpdatedNotification
  [k: string]: unknown
}
export interface FileChangePatchUpdatedNotification {
  changes: FileUpdateChange[]
  itemId: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ServerRequestResolvedNotification {
  method: ServerRequestResolvedNotificationMethod
  params: ServerRequestResolvedNotification1
  [k: string]: unknown
}
export interface ServerRequestResolvedNotification1 {
  requestId: RequestId
  threadId: string
  [k: string]: unknown
}
export interface ItemMcpToolCallProgressNotification {
  method: ItemMcpToolCallProgressNotificationMethod
  params: McpToolCallProgressNotification
  [k: string]: unknown
}
export interface McpToolCallProgressNotification {
  itemId: string
  message: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface McpServerOauthLoginCompletedNotification {
  method: McpServerOauthLoginCompletedNotificationMethod
  params: McpServerOauthLoginCompletedNotification1
  [k: string]: unknown
}
export interface McpServerOauthLoginCompletedNotification1 {
  error?: string | null
  name: string
  success: boolean
  threadId?: string | null
  [k: string]: unknown
}
export interface McpServerStartupStatusUpdatedNotification {
  method: McpServerStartupStatusUpdatedNotificationMethod
  params: McpServerStatusUpdatedNotification
  [k: string]: unknown
}
export interface McpServerStatusUpdatedNotification {
  error?: string | null
  failureReason?: McpServerStartupFailureReason | null
  name: string
  status: McpServerStartupState
  threadId?: string | null
  [k: string]: unknown
}
export interface McpServerEventStreamNotificationNotification {
  method: McpServerEventStreamNotificationNotificationMethod
  params: McpServerEventStreamNotification
  [k: string]: unknown
}
export interface McpServerEventStreamNotification {
  notification: McpServerEventNotification
  subscriptionId: string
  [k: string]: unknown
}
export interface McpServerEventNotification {
  method: string
  params: unknown
  [k: string]: unknown
}
export interface AccountUpdatedNotification {
  method: AccountUpdatedNotificationMethod
  params: AccountUpdatedNotification1
  [k: string]: unknown
}
export interface AccountUpdatedNotification1 {
  authMode?: AuthMode | null
  planType?: PlanType | null
  [k: string]: unknown
}
export interface AccountRateLimitsUpdatedNotification {
  method: AccountRateLimitsUpdatedNotificationMethod
  params: AccountRateLimitsUpdatedNotification1
  [k: string]: unknown
}
/**
 * Sparse rolling rate-limit update.
 *
 * Clients should merge available values into the most recent `account/rateLimits/read` response or refetch that snapshot. Nullable account metadata may be unavailable in a rolling update and does not clear a previously observed value.
 */
export interface AccountRateLimitsUpdatedNotification1 {
  rateLimits: RateLimitSnapshot
  [k: string]: unknown
}
export interface RateLimitSnapshot {
  credits?: CreditsSnapshot | null
  individualLimit?: SpendControlLimitSnapshot | null
  limitId?: string | null
  limitName?: string | null
  planType?: PlanType | null
  primary?: RateLimitWindow | null
  rateLimitReachedType?: RateLimitReachedType | null
  secondary?: RateLimitWindow | null
  /**
   * Backend-reported spend-control state. `None` is unavailable, not a sparse-update recovery.
   */
  spendControlReached?: boolean | null
  [k: string]: unknown
}
export interface CreditsSnapshot {
  balance?: string | null
  hasCredits: boolean
  unlimited: boolean
  [k: string]: unknown
}
export interface SpendControlLimitSnapshot {
  limit: string
  remainingPercent: number
  resetsAt: number
  used: string
  [k: string]: unknown
}
export interface RateLimitWindow {
  resetsAt?: number | null
  usedPercent: number
  windowDurationMins?: number | null
  [k: string]: unknown
}
export interface AppListUpdatedNotification {
  method: AppListUpdatedNotificationMethod
  params: AppListUpdatedNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - notification emitted when the app list changes.
 */
export interface AppListUpdatedNotification1 {
  data: AppInfo[]
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - app metadata returned by app-list APIs.
 */
export interface AppInfo {
  appMetadata?: AppMetadata | null
  branding?: AppBranding | null
  description?: string | null
  distributionChannel?: string | null
  iconAssets?: {
    [k: string]: string
  } | null
  iconDarkAssets?: {
    [k: string]: string
  } | null
  id: string
  installUrl?: string | null
  isAccessible?: boolean
  /**
   * Whether this app is enabled in config.toml. Example: ```toml [apps.bad_app] enabled = false ```
   */
  isEnabled?: boolean
  labels?: {
    [k: string]: string
  } | null
  logoUrl?: string | null
  logoUrlDark?: string | null
  name: string
  pluginDisplayNames?: string[]
  [k: string]: unknown
}
export interface AppMetadata {
  categories?: string[] | null
  developer?: string | null
  firstPartyRequiresInstall?: boolean | null
  review?: AppReview | null
  screenshots?: AppScreenshot[] | null
  seoDescription?: string | null
  showInComposerWhenUnlinked?: boolean | null
  subCategories?: string[] | null
  version?: string | null
  versionId?: string | null
  versionNotes?: string | null
  [k: string]: unknown
}
export interface AppReview {
  status: string
  [k: string]: unknown
}
export interface AppScreenshot {
  fileId?: string | null
  url?: string | null
  userPrompt: string
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - app metadata returned by app-list APIs.
 */
export interface AppBranding {
  category?: string | null
  developer?: string | null
  isDiscoverableApp: boolean
  privacyPolicy?: string | null
  termsOfService?: string | null
  website?: string | null
  [k: string]: unknown
}
export interface RemoteControlStatusChangedNotification {
  method: RemoteControlStatusChangedNotificationMethod
  params: RemoteControlStatusChangedNotification1
  [k: string]: unknown
}
/**
 * Current remote-control connection status and remote identity exposed to clients.
 */
export interface RemoteControlStatusChangedNotification1 {
  environmentId?: string | null
  installationId: string
  serverName: string
  status: RemoteControlConnectionStatus
  [k: string]: unknown
}
export interface ExternalAgentConfigImportProgressNotification {
  method: ExternalAgentConfigImportProgressNotificationMethod
  params: ExternalAgentConfigImportProgressNotification1
  [k: string]: unknown
}
export interface ExternalAgentConfigImportProgressNotification1 {
  importId: string
  itemTypeResults: ExternalAgentConfigImportTypeResult[]
  [k: string]: unknown
}
export interface ExternalAgentConfigImportTypeResult {
  failures: ExternalAgentConfigImportItemTypeFailure[]
  itemType: ExternalAgentConfigMigrationItemType
  successes: ExternalAgentConfigImportItemTypeSuccess[]
  [k: string]: unknown
}
export interface ExternalAgentConfigImportItemTypeFailure {
  cwd?: string | null
  errorType?: string | null
  failureStage: string
  itemType: ExternalAgentConfigMigrationItemType
  message: string
  source?: string | null
  subErrorType?: string | null
  [k: string]: unknown
}
export interface ExternalAgentConfigImportItemTypeSuccess {
  cwd?: string | null
  itemType: ExternalAgentConfigMigrationItemType
  source?: string | null
  target?: string | null
  /**
   * Original title for an imported session; null for other item types.
   */
  title?: string | null
  [k: string]: unknown
}
export interface ExternalAgentConfigImportCompletedNotification {
  method: ExternalAgentConfigImportCompletedNotificationMethod
  params: ExternalAgentConfigImportCompletedNotification1
  [k: string]: unknown
}
export interface ExternalAgentConfigImportCompletedNotification1 {
  importId: string
  itemTypeResults: ExternalAgentConfigImportTypeResult[]
  [k: string]: unknown
}
export interface FsChangedNotification {
  method: FsChangedNotificationMethod
  params: FsChangedNotification1
  [k: string]: unknown
}
/**
 * Filesystem watch notification emitted for `fs/watch` subscribers.
 */
export interface FsChangedNotification1 {
  /**
   * File or directory paths associated with this event.
   */
  changedPaths: AbsolutePathBuf[]
  /**
   * Watch identifier previously provided to `fs/watch`.
   */
  watchId: string
  [k: string]: unknown
}
export interface ItemReasoningSummaryTextDeltaNotification {
  method: ItemReasoningSummaryTextDeltaNotificationMethod
  params: ReasoningSummaryTextDeltaNotification
  [k: string]: unknown
}
export interface ReasoningSummaryTextDeltaNotification {
  delta: string
  itemId: string
  summaryIndex: number
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ItemReasoningSummaryPartAddedNotification {
  method: ItemReasoningSummaryPartAddedNotificationMethod
  params: ReasoningSummaryPartAddedNotification
  [k: string]: unknown
}
export interface ReasoningSummaryPartAddedNotification {
  itemId: string
  summaryIndex: number
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ItemReasoningTextDeltaNotification {
  method: ItemReasoningTextDeltaNotificationMethod
  params: ReasoningTextDeltaNotification
  [k: string]: unknown
}
export interface ReasoningTextDeltaNotification {
  contentIndex: number
  delta: string
  itemId: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
/**
 * Deprecated: Use `ContextCompaction` item type instead.
 */
export interface ThreadCompactedNotification {
  method: ThreadCompactedNotificationMethod
  params: ContextCompactedNotification
  [k: string]: unknown
}
/**
 * Deprecated: Use `ContextCompaction` item type instead.
 */
export interface ContextCompactedNotification {
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ModelReroutedNotification {
  method: ModelReroutedNotificationMethod
  params: ModelReroutedNotification1
  [k: string]: unknown
}
export interface ModelReroutedNotification1 {
  fromModel: string
  reason: ModelRerouteReason
  threadId: string
  toModel: string
  turnId: string
  [k: string]: unknown
}
export interface ModelVerificationNotification {
  method: ModelVerificationNotificationMethod
  params: ModelVerificationNotification1
  [k: string]: unknown
}
export interface ModelVerificationNotification1 {
  threadId: string
  turnId: string
  verifications: ModelVerification[]
  [k: string]: unknown
}
export interface ModelProviderAuthRecoveryStartedNotification {
  method: ModelProviderAuthRecoveryStartedNotificationMethod
  params: AuthRecoveryNotification
  [k: string]: unknown
}
export interface AuthRecoveryNotification {
  message: string
  provider: string
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ModelProviderAuthRecoveryCompletedNotification {
  method: ModelProviderAuthRecoveryCompletedNotificationMethod
  params: AuthRecoveryNotification
  [k: string]: unknown
}
export interface TurnModerationMetadataNotification {
  method: TurnModerationMetadataNotificationMethod
  params: TurnModerationMetadataNotification1
  [k: string]: unknown
}
export interface TurnModerationMetadataNotification1 {
  metadata: unknown
  threadId: string
  turnId: string
  [k: string]: unknown
}
export interface ModelSafetyBufferingUpdatedNotification {
  method: ModelSafetyBufferingUpdatedNotificationMethod
  params: ModelSafetyBufferingUpdatedNotification1
  [k: string]: unknown
}
export interface ModelSafetyBufferingUpdatedNotification1 {
  fasterModel?: string | null
  model: string
  reasons: string[]
  showBufferingUi: boolean
  threadId: string
  turnId: string
  useCases: string[]
  [k: string]: unknown
}
export interface WarningNotification {
  method: WarningNotificationMethod
  params: WarningNotification1
  [k: string]: unknown
}
export interface WarningNotification1 {
  /**
   * Concise warning message for the user.
   */
  message: string
  /**
   * Optional thread target when the warning applies to a specific thread.
   */
  threadId?: string | null
  [k: string]: unknown
}
export interface GuardianWarningNotification {
  method: GuardianWarningNotificationMethod
  params: GuardianWarningNotification1
  [k: string]: unknown
}
export interface GuardianWarningNotification1 {
  /**
   * Concise guardian warning message for the user.
   */
  message: string
  /**
   * Thread target for the guardian warning.
   */
  threadId: string
  [k: string]: unknown
}
export interface DeprecationNoticeNotification {
  method: DeprecationNoticeNotificationMethod
  params: DeprecationNoticeNotification1
  [k: string]: unknown
}
export interface DeprecationNoticeNotification1 {
  /**
   * Optional extra guidance, such as migration steps or rationale.
   */
  details?: string | null
  /**
   * Concise summary of what is deprecated.
   */
  summary: string
  [k: string]: unknown
}
export interface ConfigWarningNotification {
  method: ConfigWarningNotificationMethod
  params: ConfigWarningNotification1
  [k: string]: unknown
}
export interface ConfigWarningNotification1 {
  /**
   * Optional extra guidance or error details.
   */
  details?: string | null
  /**
   * Optional path to the config file that triggered the warning.
   */
  path?: string | null
  /**
   * Optional range for the error location inside the config file.
   */
  range?: TextRange | null
  /**
   * Concise summary of the warning.
   */
  summary: string
  [k: string]: unknown
}
export interface TextRange {
  end: TextPosition
  start: TextPosition
  [k: string]: unknown
}
export interface TextPosition {
  /**
   * 1-based column number (in Unicode scalar values).
   */
  column: number
  /**
   * 1-based line number.
   */
  line: number
  [k: string]: unknown
}
export interface FuzzyFileSearchSessionUpdatedNotification {
  method: FuzzyFileSearchSessionUpdatedNotificationMethod
  params: FuzzyFileSearchSessionUpdatedNotification1
  [k: string]: unknown
}
export interface FuzzyFileSearchSessionUpdatedNotification1 {
  files: FuzzyFileSearchResult[]
  query: string
  sessionId: string
  [k: string]: unknown
}
/**
 * Superset of [`codex_file_search::FileMatch`]
 */
export interface FuzzyFileSearchResult {
  file_name: string
  indices?: number[] | null
  match_type: FuzzyFileSearchMatchType
  path: string
  root: string
  score: number
  [k: string]: unknown
}
export interface FuzzyFileSearchSessionCompletedNotification {
  method: FuzzyFileSearchSessionCompletedNotificationMethod
  params: FuzzyFileSearchSessionCompletedNotification1
  [k: string]: unknown
}
export interface FuzzyFileSearchSessionCompletedNotification1 {
  sessionId: string
  [k: string]: unknown
}
export interface ThreadRealtimeStartedNotification {
  method: ThreadRealtimeStartedNotificationMethod
  params: ThreadRealtimeStartedNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - emitted when thread realtime startup is accepted.
 */
export interface ThreadRealtimeStartedNotification1 {
  realtimeSessionId?: string | null
  threadId: string
  version: RealtimeConversationVersion
  [k: string]: unknown
}
export interface ThreadRealtimeItemAddedNotification {
  method: ThreadRealtimeItemAddedNotificationMethod
  params: ThreadRealtimeItemAddedNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - raw non-audio thread realtime item emitted by the backend.
 */
export interface ThreadRealtimeItemAddedNotification1 {
  item: unknown
  threadId: string
  [k: string]: unknown
}
export interface ThreadRealtimeItemStartedNotification {
  method: ThreadRealtimeItemStartedNotificationMethod
  params: ThreadRealtimeItemStartedNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - a realtime timeline item started before its content streams.
 */
export interface ThreadRealtimeItemStartedNotification1 {
  item: ThreadRealtimeItem
  threadId: string
  [k: string]: unknown
}
export interface RealtimeSessionStartedThreadRealtimeItem {
  type: RealtimeSessionStartedThreadRealtimeItemType
  [k: string]: unknown
}
export interface TranscriptSegmentThreadRealtimeItem {
  role: ThreadRealtimeTranscriptRole
  text: string
  type: TranscriptSegmentThreadRealtimeItemType
  [k: string]: unknown
}
export interface BemItemPromotedThreadRealtimeItem {
  item_id: string
  presentation: ThreadRealtimeBemItemPresentation
  turn_id: string
  type: BemItemPromotedThreadRealtimeItemType
  [k: string]: unknown
}
export interface WholeItemThreadRealtimeBemItemPresentation {
  type: WholeItemThreadRealtimeBemItemPresentationType
  [k: string]: unknown
}
export interface InlineMarkdownThreadRealtimeBemItemPresentation {
  type: InlineMarkdownThreadRealtimeBemItemPresentationType
  [k: string]: unknown
}
export interface InlineVisualizationThreadRealtimeBemItemPresentation {
  index: number
  type: InlineVisualizationThreadRealtimeBemItemPresentationType
  [k: string]: unknown
}
export interface RealtimeSessionClosedThreadRealtimeItem {
  outcome: ThreadRealtimeSessionOutcome
  type: RealtimeSessionClosedThreadRealtimeItemType
  [k: string]: unknown
}
export interface ThreadRealtimeItemTranscriptDeltaNotification {
  method: ThreadRealtimeItemTranscriptDeltaNotificationMethod
  params: ThreadRealtimeItemTranscriptDeltaNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - text appended to an active realtime transcript item.
 */
export interface ThreadRealtimeItemTranscriptDeltaNotification1 {
  delta: string
  itemId: string
  threadId: string
  [k: string]: unknown
}
export interface ThreadRealtimeItemCompletedNotification {
  method: ThreadRealtimeItemCompletedNotificationMethod
  params: ThreadRealtimeItemCompletedNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - a realtime timeline item published after canonical commit.
 */
export interface ThreadRealtimeItemCompletedNotification1 {
  item: ThreadRealtimeItem
  threadId: string
  [k: string]: unknown
}
export interface ThreadRealtimeTranscriptDeltaNotification {
  method: ThreadRealtimeTranscriptDeltaNotificationMethod
  params: ThreadRealtimeTranscriptDeltaNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - flat transcript delta emitted whenever realtime transcript text changes.
 */
export interface ThreadRealtimeTranscriptDeltaNotification1 {
  /**
   * Live transcript delta from the realtime event.
   */
  delta: string
  role: string
  threadId: string
  [k: string]: unknown
}
export interface ThreadRealtimeTranscriptDoneNotification {
  method: ThreadRealtimeTranscriptDoneNotificationMethod
  params: ThreadRealtimeTranscriptDoneNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - final transcript text emitted when realtime completes a transcript part.
 */
export interface ThreadRealtimeTranscriptDoneNotification1 {
  role: string
  /**
   * Final complete text for the transcript part.
   */
  text: string
  threadId: string
  [k: string]: unknown
}
export interface ThreadRealtimeOutputAudioDeltaNotification {
  method: ThreadRealtimeOutputAudioDeltaNotificationMethod
  params: ThreadRealtimeOutputAudioDeltaNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - streamed output audio emitted by thread realtime.
 */
export interface ThreadRealtimeOutputAudioDeltaNotification1 {
  audio: ThreadRealtimeAudioChunk
  threadId: string
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - thread realtime audio chunk.
 */
export interface ThreadRealtimeAudioChunk {
  data: string
  itemId?: string | null
  numChannels: number
  sampleRate: number
  samplesPerChannel?: number | null
  [k: string]: unknown
}
export interface ThreadRealtimeSdpNotification {
  method: ThreadRealtimeSdpNotificationMethod
  params: ThreadRealtimeSdpNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - emitted with the remote SDP for a WebRTC realtime session.
 */
export interface ThreadRealtimeSdpNotification1 {
  sdp: string
  threadId: string
  [k: string]: unknown
}
export interface ThreadRealtimeErrorNotification {
  method: ThreadRealtimeErrorNotificationMethod
  params: ThreadRealtimeErrorNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - emitted when thread realtime encounters an error.
 */
export interface ThreadRealtimeErrorNotification1 {
  message: string
  threadId: string
  [k: string]: unknown
}
export interface ThreadRealtimeClosedNotification {
  method: ThreadRealtimeClosedNotificationMethod
  params: ThreadRealtimeClosedNotification1
  [k: string]: unknown
}
/**
 * EXPERIMENTAL - emitted when thread realtime transport closes.
 */
export interface ThreadRealtimeClosedNotification1 {
  reason?: string | null
  threadId: string
  [k: string]: unknown
}
/**
 * Notifies the user of world-writable directories on Windows, which cannot be protected by the sandbox.
 */
export interface WindowsWorldWritableWarningNotification {
  method: WindowsWorldWritableWarningNotificationMethod
  params: WindowsWorldWritableWarningNotification1
  [k: string]: unknown
}
export interface WindowsWorldWritableWarningNotification1 {
  extraCount: number
  failedScan: boolean
  samplePaths: string[]
  [k: string]: unknown
}
export interface WindowsSandboxSetupCompletedNotification {
  method: WindowsSandboxSetupCompletedNotificationMethod
  params: WindowsSandboxSetupCompletedNotification1
  [k: string]: unknown
}
export interface WindowsSandboxSetupCompletedNotification1 {
  error?: string | null
  mode: WindowsSandboxSetupMode
  success: boolean
  [k: string]: unknown
}
export interface AccountLoginCompletedNotification {
  method: AccountLoginCompletedNotificationMethod
  params: AccountLoginCompletedNotification1
  [k: string]: unknown
}
export interface AccountLoginCompletedNotification1 {
  error?: string | null
  loginId?: string | null
  onboardingEntrypoint?: DesktopOnboardingEntrypoint | null
  success: boolean
  [k: string]: unknown
}
