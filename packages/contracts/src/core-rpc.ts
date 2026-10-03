import { Schema, Struct } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import {
  AppSnapshot,
  RecordThreadInput,
  ThreadLocation,
  ThreadWorktree,
  WorktreeSetup,
  SetThreadTitleInput,
  RenameThreadInput,
  SetThreadStatusInput,
  UpdateProviderInput,
  UpsertModelInput,
  SyncProviderCatalogInput,
  SetThreadSettingsInput,
  SetAppSettingsInput,
  SubmitTurnInput,
  QueuedInputContent,
  TranscriptQuery,
  TranscriptPage,
  ThreadPageQuery,
  ThreadPage,
  SubmitTurnResult,
  RuntimeEventInput,
  RuntimeEventResult,
  ProviderSessionInput,
  OpenProviderTurnInput,
  InterruptedTurn,
  RenameWorkspaceInput,
  SetThreadPinnedInput,
  SearchTranscriptsInput,
  TranscriptSearchPage,
  SaveScheduleInput,
  ScheduledPrompt,
  RewindResult,
  UndoRewindResult,
  TurnHandoff,
} from "./models"
import { CoreError } from "./errors"

const snapshotRpc = <const Tag extends string, Payload extends Schema.Top>(
  tag: Tag,
  payload: Payload,
) => Rpc.make(tag, { payload, success: AppSnapshot, error: CoreError })

const completionRpc = <const Tag extends string, Payload extends Schema.Top>(
  tag: Tag,
  payload: Payload,
) => Rpc.make(tag, { payload, success: Schema.Void, error: CoreError })

export class CoreRpcs extends RpcGroup.make(
  snapshotRpc("RenameWorkspace", RenameWorkspaceInput),
  snapshotRpc("RemoveWorkspace", Schema.Struct({ workspaceId: Schema.String })),
  snapshotRpc("SetThreadPinned", SetThreadPinnedInput),
  Rpc.make("SearchTranscripts", {
    payload: SearchTranscriptsInput,
    success: TranscriptSearchPage,
    error: CoreError,
  }),
  Rpc.make("GetSnapshot", { success: AppSnapshot, error: CoreError }),
  snapshotRpc("AddWorkspace", Schema.Struct({ path: Schema.String })),
  snapshotRpc("CreateThread", RecordThreadInput),
  Rpc.make("GetThreadLocation", {
    payload: Schema.Struct({ threadId: Schema.String }),
    success: ThreadLocation,
    error: CoreError,
  }),
  Rpc.make("ListWorktreeThreads", {
    payload: Schema.Struct({ workspaceId: Schema.optional(Schema.String) }),
    success: Schema.Array(ThreadLocation),
    error: CoreError,
  }),
  snapshotRpc(
    "SetDraftLocation",
    Schema.Struct({
      threadId: Schema.String,
      workspaceId: Schema.String,
      worktree: Schema.NullOr(ThreadWorktree.mapFields(Struct.omit(["state", "setup"]))),
    }),
  ),
  snapshotRpc(
    "SetWorktreeState",
    Schema.Struct({ threadId: Schema.String, state: ThreadWorktree.fields.state }),
  ),
  completionRpc(
    "SetWorktreeSetup",
    Schema.Struct({
      threadId: Schema.String,
      setup: Schema.NullOr(WorktreeSetup),
    }),
  ),
  snapshotRpc("SetThreadStatus", SetThreadStatusInput),
  completionRpc("SetThreadTitle", SetThreadTitleInput),
  snapshotRpc("RenameThread", RenameThreadInput),
  snapshotRpc("DeleteThread", Schema.Struct({ threadId: Schema.String })),
  snapshotRpc("UpdateProvider", UpdateProviderInput),
  snapshotRpc("UpsertModel", UpsertModelInput),
  snapshotRpc("DeleteModel", Schema.Struct({ modelId: Schema.String })),
  snapshotRpc("ResetProviderCatalog", Schema.Struct({ providerId: Schema.String })),
  completionRpc("SyncProviderCatalog", SyncProviderCatalogInput),
  snapshotRpc("SetThreadSettings", SetThreadSettingsInput),
  snapshotRpc("SetAppSettings", SetAppSettingsInput),
  Rpc.make("GetTranscript", {
    payload: TranscriptQuery,
    success: TranscriptPage,
    error: CoreError,
  }),
  Rpc.make("ListThreads", {
    payload: ThreadPageQuery,
    success: ThreadPage,
    error: CoreError,
  }),
  Rpc.make("SubmitTurn", {
    payload: SubmitTurnInput,
    success: SubmitTurnResult,
    error: CoreError,
  }),
  /** The summary the thread's next turn would start with; null when its agent has seen everything. */
  Rpc.make("PreviewHandoff", {
    payload: Schema.Struct({ threadId: Schema.String }),
    success: Schema.NullOr(TurnHandoff),
    error: CoreError,
  }),
  /** Takes a turn and every later one out of the conversation; the next turn starts a new session. */
  Rpc.make("RewindThread", {
    payload: Schema.Struct({
      threadId: Schema.String,
      turnId: Schema.String,
      filesRestored: Schema.Boolean,
    }),
    success: RewindResult,
    error: CoreError,
  }),
  /** Returns the latest rewind's turns and provider sessions, until the next turn starts. */
  Rpc.make("UndoRewind", {
    payload: Schema.Struct({ threadId: Schema.String }),
    success: UndoRewindResult,
    error: CoreError,
  }),
  Rpc.make("RecordRuntimeEvent", {
    payload: RuntimeEventInput,
    success: RuntimeEventResult,
    error: CoreError,
  }),
  completionRpc("SetProviderSession", ProviderSessionInput),
  /** False when the thread is gone, already running a turn, or MeldShell is shutting down. */
  Rpc.make("OpenProviderTurn", {
    payload: OpenProviderTurnInput,
    success: Schema.Boolean,
    error: CoreError,
  }),
  completionRpc("ResolveApproval", Schema.Struct({ approvalId: Schema.String })),
  Rpc.make("GetApprovalHarness", {
    payload: Schema.Struct({ approvalId: Schema.String }),
    success: Schema.NullOr(Schema.String),
    error: CoreError,
  }),
  Rpc.make("GetQueuedInput", {
    payload: Schema.Struct({ id: Schema.Number }),
    success: Schema.NullOr(QueuedInputContent),
    error: CoreError,
  }),
  Rpc.make("RemoveQueuedInput", {
    payload: Schema.Struct({ id: Schema.Number }),
    success: Schema.NullOr(Schema.String),
    error: CoreError,
  }),
  completionRpc("PrioritizeQueuedInput", Schema.Struct({ id: Schema.Number })),
  Rpc.make("InterruptTurn", {
    payload: Schema.Struct({ threadId: Schema.String }),
    success: Schema.NullOr(InterruptedTurn),
    error: CoreError,
  }),
  Rpc.make("BindTurnWorker", {
    payload: Schema.Struct({ turnId: Schema.String, generation: Schema.String }),
    success: Schema.Void,
    error: CoreError,
  }),
  Rpc.make("ReconcileWorker", {
    payload: Schema.Struct({ generation: Schema.String }),
    success: Schema.Void,
    error: CoreError,
  }),
  Rpc.make("FinishShutdown", { success: Schema.Void, error: CoreError }),
  Rpc.make("BeginShutdown", {
    success: Schema.Array(
      Schema.Struct({
        threadId: Schema.String,
        turnId: Schema.String,
        harness: Schema.String,
        nativeThreadId: Schema.NullOr(Schema.String),
        nativeTurnId: Schema.NullOr(Schema.String),
      }),
    ),
    error: CoreError,
  }),
  Rpc.make("GetActiveTurnCount", { success: Schema.Number, error: CoreError }),
  Rpc.make("ListSchedules", {
    payload: Schema.Struct({ threadId: Schema.optional(Schema.String) }),
    success: Schema.Array(ScheduledPrompt),
    error: CoreError,
  }),
  Rpc.make("SaveSchedule", {
    payload: SaveScheduleInput,
    success: ScheduledPrompt,
    error: CoreError,
  }),
  Rpc.make("DeleteSchedule", {
    payload: Schema.Struct({ scheduleId: Schema.String }),
    success: Schema.Void,
    error: CoreError,
  }),
  /** Hands out the schedules due now and moves each on to its next run. */
  Rpc.make("ClaimDueSchedules", {
    payload: Schema.Struct({ now: Schema.String }),
    success: Schema.Array(ScheduledPrompt),
    error: CoreError,
  }),
  Rpc.make("RecordScheduleRun", {
    payload: Schema.Struct({ scheduleId: Schema.String, error: Schema.NullOr(Schema.String) }),
    success: Schema.Void,
    error: CoreError,
  }),
) {}
