import { Schema } from "effect"
import { Rpc, RpcGroup } from "@effect/rpc"
import {
  AppSnapshot,
  RecordThreadInput,
  ThreadLocation,
  ThreadWorktree,
  SetThreadTitleInput,
  SetThreadStatusInput,
  UpdateProviderInput,
  UpsertModelInput,
  SyncProviderCatalogInput,
  SetThreadSettingsInput,
  SetAppSettingsInput,
  SubmitTurnInput,
  TranscriptQuery,
  TranscriptPage,
  ThreadPageQuery,
  ThreadPage,
  SubmitTurnResult,
  RuntimeEventInput,
  RuntimeEventResult,
  ProviderSessionInput,
  InterruptedTurn,
  RenameWorkspaceInput,
  SetThreadPinnedInput,
  SearchTranscriptsInput,
  TranscriptSearchPage,
} from "./models"
import { CoreError } from "./errors"

const snapshotRpc = <const Tag extends string, Payload extends Schema.Schema.Any>(
  tag: Tag,
  payload: Payload,
) => Rpc.make(tag, { payload, success: AppSnapshot, error: CoreError })

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
    "SetDraftWorktree",
    Schema.Struct({
      threadId: Schema.String,
      worktree: Schema.NullOr(ThreadWorktree.pipe(Schema.omit("state"))),
    }),
  ),
  snapshotRpc(
    "SetWorktreeState",
    Schema.Struct({ threadId: Schema.String, state: ThreadWorktree.fields.state }),
  ),
  snapshotRpc("SetThreadStatus", SetThreadStatusInput),
  snapshotRpc("SetThreadTitle", SetThreadTitleInput),
  snapshotRpc("DeleteThread", Schema.Struct({ threadId: Schema.String })),
  snapshotRpc("UpdateProvider", UpdateProviderInput),
  snapshotRpc("UpsertModel", UpsertModelInput),
  snapshotRpc("DeleteModel", Schema.Struct({ modelId: Schema.String })),
  snapshotRpc("ResetProviderCatalog", Schema.Struct({ providerId: Schema.String })),
  snapshotRpc("SyncProviderCatalog", SyncProviderCatalogInput),
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
  Rpc.make("RecordRuntimeEvent", {
    payload: RuntimeEventInput,
    success: RuntimeEventResult,
    error: CoreError,
  }),
  snapshotRpc("SetProviderSession", ProviderSessionInput),
  snapshotRpc("ResolveApproval", Schema.Struct({ approvalId: Schema.String })),
  Rpc.make("GetApprovalHarness", {
    payload: Schema.Struct({ approvalId: Schema.String }),
    success: Schema.NullOr(Schema.String),
    error: CoreError,
  }),
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
) {}
