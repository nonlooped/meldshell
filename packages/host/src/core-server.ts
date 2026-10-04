import { acquireOwnership } from "./ownership"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { RpcServer } from "effect/rpc"
import type { FromClientEncoded, FromServerEncoded } from "effect/rpc/RpcMessage"
import {
  errorMessage,
  CoreDatabaseError,
  CoreProtocolError,
  CoreRpcs,
  CoreUnexpectedError,
  ProviderConfigurationError,
  TurnSubmissionError,
  type CoreError,
} from "@meldshell/contracts"
import {
  getApprovalHarness,
  finishShutdown,
  bindTurnWorker,
  openProviderTurn,
  reconcileWorker,
  beginShutdown,
  refreshTranscriptSearch,
  addWorkspace,
  renameWorkspace,
  removeWorkspace,
  setThreadPinned,
  renameThread,
  searchTranscripts,
  createThread,
  getThreadLocation,
  listWorktreeThreads,
  setWorktreeState,
  setWorktreeSetup,
  setDraftLocation,
  deleteModel,
  deleteThread,
  getActiveTurnCount,
  getSnapshot,
  getTranscript,
  initializeDatabase,
  interruptTurn,
  getQueuedInput,
  removeQueuedInput,
  prioritizeQueuedInput,
  listThreads,
  recordRuntimeEvent,
  resetProviderCatalog,
  resolveApproval,
  setAppSettings,
  setProviderSession,
  setThreadSettings,
  setThreadStatus,
  setThreadTitle,
  submitTurn,
  syncProviderCatalog,
  updateProvider,
  upsertModel,
  listSchedules,
  saveSchedule,
  deleteSchedule,
  claimDueSchedules,
  recordScheduleRun,
  rewindThread,
  undoRewind,
  forkThread,
  previewHandoff,
  sideQuestionPrompt,
} from "@meldshell/core"
import {
  FiberSet,
  Schema,
  Cause,
  Effect,
  Layer,
  Queue,
  ManagedRuntime,
  Option,
  Schedule,
  Semaphore,
} from "effect"

export interface CorePort {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { readonly data: unknown }) => void): unknown
  off(event: "message", listener: (event: { readonly data: unknown }) => void): unknown
}

export const startCore = (parentPort: CorePort, databasePath: string) => {
  const DatabaseLive = SqliteClient.layer({
    filename: databasePath,
    // Retain MeldShell's bounded set of prepared statements across bursts of turn events.
    prepareCacheSize: 1_024,
    prepareCacheTTL: "24 hours",
  })

  const coreErrorFromCause = (cause: Cause.Cause<unknown>): CoreError => {
    const failure = Option.getOrUndefined(Cause.findErrorOption(cause))
    if (
      failure instanceof TurnSubmissionError ||
      failure instanceof ProviderConfigurationError ||
      failure instanceof CoreProtocolError
    ) {
      return failure
    }
    if (typeof failure === "object" && failure !== null && "_tag" in failure) {
      if (failure._tag === "SchemaError") {
        return new CoreProtocolError({ message: errorMessage(failure) })
      }
      if (failure._tag === "SqlError") {
        return new CoreDatabaseError({ message: errorMessage(failure) })
      }
    }
    return new CoreUnexpectedError({ message: errorMessage(Cause.squash(cause)) })
  }

  // Serialize whole mutation handlers (including their post-commit snapshots). The SQLite
  // client also holds its connection semaphore for transactions, so reads cannot see
  // another fiber's uncommitted writes. Read RPCs need not wait on this writer gate.
  const writer = Semaphore.makeUnsafe(1)

  const exposeCoreRead = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, CoreError, R> =>
    effect.pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => Effect.fail(coreErrorFromCause(cause)),
        onSuccess: Effect.succeed,
      }),
    )

  const exposeCoreError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    exposeCoreRead(writer.withPermits(1)(effect))

  const CoreHandlersLive = CoreRpcs.toLayer({
    GetApprovalHarness: ({ approvalId }) => exposeCoreRead(getApprovalHarness(approvalId)),
    RenameWorkspace: (input) => exposeCoreError(renameWorkspace(input.workspaceId, input.name)),
    RemoveWorkspace: (input) => exposeCoreError(removeWorkspace(input.workspaceId)),
    SetThreadPinned: (input) => exposeCoreError(setThreadPinned(input.threadId, input.pinned)),
    SearchTranscripts: (input) => exposeCoreRead(searchTranscripts(input)),
    GetSnapshot: () => exposeCoreRead(getSnapshot),
    AddWorkspace: ({ path }) => exposeCoreError(addWorkspace(path)),
    CreateThread: (input) => exposeCoreError(createThread(input)),
    GetThreadLocation: ({ threadId }) => exposeCoreRead(getThreadLocation(threadId)),
    ListWorktreeThreads: ({ workspaceId }) => exposeCoreRead(listWorktreeThreads(workspaceId)),
    SetDraftLocation: (input) => exposeCoreError(setDraftLocation(input)),
    SetWorktreeState: (input) => exposeCoreError(setWorktreeState(input.threadId, input.state)),
    SetWorktreeSetup: (input) => exposeCoreError(setWorktreeSetup(input.threadId, input.setup)),
    SetThreadStatus: (input) => exposeCoreError(setThreadStatus(input.threadId, input.status)),
    SetThreadTitle: (input) => exposeCoreError(setThreadTitle(input)),
    RenameThread: (input) => exposeCoreError(renameThread(input.threadId, input.title)),
    DeleteThread: ({ threadId }) => exposeCoreError(deleteThread(threadId)),
    UpdateProvider: (input) => exposeCoreError(updateProvider(input)),
    UpsertModel: (input) => exposeCoreError(upsertModel(input)),
    DeleteModel: ({ modelId }) => exposeCoreError(deleteModel(modelId)),
    ResetProviderCatalog: ({ providerId }) => exposeCoreError(resetProviderCatalog(providerId)),
    SyncProviderCatalog: (input) => exposeCoreError(syncProviderCatalog(input)),
    SetThreadSettings: (input) => exposeCoreError(setThreadSettings(input)),
    SetAppSettings: (input) => exposeCoreError(setAppSettings(input)),
    GetTranscript: (input) => exposeCoreRead(getTranscript(input)),
    ListThreads: (input) =>
      exposeCoreRead(
        listThreads({
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        }),
      ),
    SubmitTurn: (input) => exposeCoreError(submitTurn(input)),
    PreviewHandoff: ({ threadId }) => exposeCoreRead(previewHandoff(threadId)),
    SideQuestionPrompt: ({ threadId, question }) =>
      exposeCoreRead(sideQuestionPrompt(threadId, question)),
    RewindThread: (input) => exposeCoreError(rewindThread(input)),
    UndoRewind: ({ threadId }) => exposeCoreError(undoRewind(threadId)),
    ForkThread: (input) => exposeCoreError(forkThread(input)),
    RecordRuntimeEvent: (input) => exposeCoreError(recordRuntimeEvent(input)),
    SetProviderSession: (input) =>
      exposeCoreError(setProviderSession(input.threadId, input.nativeThreadId, input.harness)),
    ResolveApproval: ({ approvalId }) => exposeCoreError(resolveApproval(approvalId)),
    GetQueuedInput: ({ id }) => exposeCoreRead(getQueuedInput(id)),
    RemoveQueuedInput: ({ id }) => exposeCoreError(removeQueuedInput(id)),
    PrioritizeQueuedInput: ({ id }) => exposeCoreError(prioritizeQueuedInput(id)),
    InterruptTurn: ({ threadId }) => exposeCoreError(interruptTurn(threadId)),
    OpenProviderTurn: (input) => exposeCoreError(openProviderTurn(input)),
    BindTurnWorker: (input) => exposeCoreError(bindTurnWorker(input.turnId, input.generation)),
    ReconcileWorker: (input) => exposeCoreError(reconcileWorker(input.generation)),
    FinishShutdown: () => exposeCoreError(finishShutdown),
    BeginShutdown: () => exposeCoreError(beginShutdown),
    GetActiveTurnCount: () => exposeCoreRead(getActiveTurnCount),
    ListSchedules: ({ threadId }) => exposeCoreRead(listSchedules(threadId)),
    SaveSchedule: (input) => exposeCoreError(saveSchedule(input)),
    DeleteSchedule: ({ scheduleId }) => exposeCoreError(deleteSchedule(scheduleId)),
    ClaimDueSchedules: ({ now }) => exposeCoreError(claimDueSchedules(new Date(now))),
    RecordScheduleRun: (input) => exposeCoreError(recordScheduleRun(input.scheduleId, input.error)),
  })

  const makeElectronProtocol = RpcServer.Protocol.make((writeRequest) =>
    Effect.gen(function* () {
      const runFork = yield* FiberSet.makeRuntime<never>()
      const disconnects = yield* Queue.make<number>()
      const clientIds = new Set([0])
      const onMessage = (event: { readonly data: unknown }): void => {
        runFork(writeRequest(0, event.data as FromClientEncoded))
      }

      parentPort.on("message", onMessage)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          parentPort.off("message", onMessage)
          clientIds.clear()
        }),
      )
      parentPort.postMessage({ type: "ready" })

      return {
        disconnects,
        send: (clientId: number, response: FromServerEncoded) =>
          Effect.sync(() => {
            if (clientId === 0) parentPort.postMessage(response)
          }),
        end: (clientId: number) =>
          Effect.sync(() => clientIds.delete(clientId)).pipe(Effect.asVoid),
        clientIds: Effect.sync(() => clientIds as ReadonlySet<number>),
        initialMessage: Effect.succeed(Option.none()),
        supportsAck: false,
        supportsTransferables: false,
        supportsSpanPropagation: false,
        supportsNotifications: false,
        codecFor: Schema.toCodecJson,
      }
    }),
  )

  const ProtocolLive = Layer.effect(
    RpcServer.Protocol,
    initializeDatabase.pipe(
      Effect.tap(() =>
        refreshTranscriptSearch.pipe(
          writer.withPermits(1),
          Effect.catch(Effect.logError),
          Effect.repeat(Schedule.spaced("1 second")),
          Effect.forkScoped,
        ),
      ),
      Effect.andThen(makeElectronProtocol),
    ),
  )

  const RpcDependenciesLive = Layer.merge(CoreHandlersLive, ProtocolLive).pipe(
    Layer.provide(DatabaseLive),
  )

  const CoreServerLive = RpcServer.layer(CoreRpcs, { concurrency: 8 }).pipe(
    Layer.provide(RpcDependenciesLive),
  )

  const runtime = ManagedRuntime.make(CoreServerLive)

  const ownership = acquireOwnership(databasePath)
  return {
    ready: ownership.then(() => runtime.runPromise(Effect.void)),
    dispose: async () => {
      await runtime.dispose()
      const release = await ownership.catch(() => null)
      await release?.()
    },
  }
}
