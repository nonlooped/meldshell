import { acquireOwnership } from "./ownership"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { RpcServer } from "@effect/rpc"
import type { FromClientEncoded, FromServerEncoded } from "@effect/rpc/RpcMessage"
import {
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
  reconcileWorker,
  beginShutdown,
  refreshTranscriptSearch,
  addWorkspace,
  renameWorkspace,
  removeWorkspace,
  setThreadPinned,
  searchTranscripts,
  createThread,
  getThreadLocation,
  listWorktreeThreads,
  setWorktreeState,
  deleteModel,
  deleteThread,
  getActiveTurnCount,
  getSnapshot,
  getTranscript,
  initializeDatabase,
  interruptTurn,
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
} from "@meldshell/core"
import { Cause, Effect, Layer, Mailbox, ManagedRuntime, Option, Runtime, Schedule } from "effect"

export interface CorePort {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { readonly data: unknown }) => void): unknown
  off(event: "message", listener: (event: { readonly data: unknown }) => void): unknown
}

export const startCore = (parentPort: CorePort, databasePath: string) => {
  const DatabaseLive = SqliteClient.layer({
    filename: databasePath,
    // better-sqlite3 statements register native cleanup hooks. Keeping MeldShell's bounded set of
    // prepared statements for the utility lifetime avoids evicting live native handles under a
    // burst of concurrent turn events.
    prepareCacheSize: 1_024,
    prepareCacheTTL: "24 hours",
  })

  const errorMessage = (value: unknown): string =>
    value instanceof Error ? value.message : String(value)

  const coreErrorFromCause = (cause: Cause.Cause<unknown>): CoreError => {
    const failure = Option.getOrUndefined(Cause.failureOption(cause))
    if (
      failure instanceof TurnSubmissionError ||
      failure instanceof ProviderConfigurationError ||
      failure instanceof CoreProtocolError
    ) {
      return failure
    }
    if (typeof failure === "object" && failure !== null && "_tag" in failure) {
      if (failure._tag === "ParseError") {
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
  const writer = Effect.runSync(Effect.makeSemaphore(1))

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
    SetWorktreeState: (input) => exposeCoreError(setWorktreeState(input.threadId, input.state)),
    SetThreadStatus: (input) => exposeCoreError(setThreadStatus(input.threadId, input.status)),
    SetThreadTitle: (input) => exposeCoreError(setThreadTitle(input)),
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
    RecordRuntimeEvent: (input) => exposeCoreError(recordRuntimeEvent(input)),
    SetProviderSession: (input) =>
      exposeCoreError(setProviderSession(input.threadId, input.nativeThreadId, input.harness)),
    ResolveApproval: ({ approvalId }) => exposeCoreError(resolveApproval(approvalId)),
    InterruptTurn: ({ threadId }) => exposeCoreError(interruptTurn(threadId)),
    BindTurnWorker: (input) => exposeCoreError(bindTurnWorker(input.turnId, input.generation)),
    ReconcileWorker: (input) => exposeCoreError(reconcileWorker(input.generation)),
    FinishShutdown: () => exposeCoreError(finishShutdown),
    BeginShutdown: () => exposeCoreError(beginShutdown),
    GetActiveTurnCount: () => exposeCoreRead(getActiveTurnCount),
  })

  const makeElectronProtocol = RpcServer.Protocol.make((writeRequest) =>
    Effect.gen(function* () {
      const runtime = yield* Effect.runtime<never>()
      const runFork = Runtime.runFork(runtime)
      const disconnects = yield* Mailbox.make<number>()
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
      }
    }),
  )

  const ProtocolLive = Layer.scoped(
    RpcServer.Protocol,
    initializeDatabase.pipe(
      Effect.tap(() =>
        refreshTranscriptSearch.pipe(
          writer.withPermits(1),
          Effect.catchAll(Effect.logError),
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
