/* Generated from the checked-in Codex JSON Schema. Run npm run generate:protocol --workspace=@meldshell/provider-codex. */

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
/**
 * A non-empty reasoning effort value advertised by the model.
 */
export type ReasoningEffort = string
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
/**
 * A path that is guaranteed to be absolute and normalized (though it is not guaranteed to be canonicalized or exist on the filesystem).
 *
 * IMPORTANT: When deserializing an `AbsolutePathBuf`, a base path must be set using [AbsolutePathBufGuard::new]. If no base path is set, the deserialization will fail unless the path being deserialized is already absolute.
 */
export type AbsolutePathBuf = string
export type ImageGenerationThreadItemType = "imageGeneration"
export type EnteredReviewModeThreadItemType = "enteredReviewMode"
export type ExitedReviewModeThreadItemType = "exitedReviewMode"
export type ContextCompactionThreadItemType = "contextCompaction"
export type TurnItemsView = "notLoaded" | "summary" | "full"
export type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress"

export interface TurnStartResponse {
  turn: Turn
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
