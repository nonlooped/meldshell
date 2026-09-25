import { randomUUID } from "node:crypto"
import {
  asRecord,
  errorMessage,
  HARNESSES,
  isHarness,
  probingStatus,
  toError,
  WorkerEvent,
  type AppSnapshot,
  type CodexUsage,
  type ComposerCommand,
  type Harness,
  type ProviderStatus,
  type ProviderWorkerInput,
  type RuntimeEventInput,
  type TurnDispatch,
} from "@meldshell/contracts"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"
import { Context, Effect, Either, Layer, Ref, Runtime, Schedule, Schema, type Scope } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { handleGeneratedText } from "./generated-text"
import { interruptWithRecovery } from "./interrupt-turn"
import { HostPlatform, type HostProcess } from "./platform"
import { isRuntimeDelta } from "./runtime-deltas"
import { makeEventQueue } from "./runtime-queue"
import { logStartupTiming } from "./startup-timing"
import { deliverCommand, requestCommands, requestUsage } from "./worker-channel"

export interface ProviderService {
  readonly interrupt: (threadId: string, turnId: string) => Effect.Effect<void, Error>
  readonly status: Effect.Effect<ProviderStatus>
  readonly usage: Effect.Effect<CodexUsage, Error>
  readonly commands: (workspacePath: string) => Effect.Effect<ReadonlyArray<ComposerCommand>, Error>
  readonly refresh: Effect.Effect<void, Error>
  readonly send: (message: ProviderWorkerInput) => Effect.Effect<void, Error>
  readonly shutdown: Effect.Effect<void>
}

export class CodexProvider extends Context.Tag("MeldShell/CodexProvider")<
  CodexProvider,
  ProviderService
>() {}

export class ClaudeProvider extends Context.Tag("MeldShell/ClaudeProvider")<
  ClaudeProvider,
  ProviderService
>() {}

export class CursorProvider extends Context.Tag("MeldShell/CursorProvider")<
  CursorProvider,
  ProviderService
>() {}

type ProviderConfig = {
  readonly harness: Harness
  /** The worker bundle the platform forks for this harness. */
  readonly worker: string
}

const decodeEvent = Schema.decodeUnknownEither(WorkerEvent)

const stopPid = (pid: number): Effect.Effect<void, Error> =>
  Effect.tryPromise({ try: () => stopProcessTree(pid), catch: toError })

const restartSchedule = Schedule.exponential("1 second").pipe(
  Schedule.union(Schedule.spaced("30 seconds")),
)

const providerRuntime = (
  config: ProviderConfig,
): Effect.Effect<ProviderService, never, CoreClient | HostEvents | HostPlatform | Scope.Scope> =>
  Effect.gen(function* () {
    const { provider, label } = HARNESSES[config.harness]
    const probing = (): ProviderStatus => probingStatus(config.harness)
    const platform = yield* HostPlatform
    const core = yield* CoreClient
    const hostEvents = yield* HostEvents
    const runtime = yield* Effect.runtime<never>()
    const scope = yield* Effect.scope
    const runFork = (effect: Effect.Effect<void>): void => {
      Runtime.runFork(runtime)(effect.pipe(Effect.forkIn(scope)))
    }
    const processRef = yield* Ref.make<HostProcess | null>(null)
    const statusRef = yield* Ref.make(probing())
    /** Harness processes each worker started, stopped with it if it dies first. */
    const descendants = new WeakMap<HostProcess, Set<number>>()
    /** Identifies one worker process, so events from a replaced worker are recognised. */
    const generations = new WeakMap<HostProcess, string>()
    let stopping = false

    const currentChild = (): HostProcess | null => Effect.runSync(Ref.get(processRef))
    const publishStatus = (status: ProviderStatus): Effect.Effect<void> =>
      Ref.set(statusRef, status).pipe(
        Effect.andThen(hostEvents.publish({ _tag: "ProviderStatusChanged", status })),
      )
    const publishChange = (threadId: string): Effect.Effect<void> =>
      hostEvents.publish({ _tag: "RuntimeChanged", threadId })
    const stopDescendants = (child: HostProcess): Effect.Effect<void> =>
      Effect.forEach(
        [...(descendants.get(child) ?? [])],
        (pid) => stopPid(pid).pipe(Effect.catchAll(Effect.logError)),
        { discard: true },
      )

    const bindDispatch = (
      dispatch: TurnDispatch | null,
      child: HostProcess | null,
    ): Effect.Effect<void, Error> =>
      Effect.gen(function* () {
        if (dispatch === null) return
        if (dispatch.harness !== config.harness)
          return yield* Effect.fail(new Error("Turn routed to the wrong provider."))
        yield* core
          .BindTurnWorker({
            turnId: dispatch.turnId,
            generation: child === null ? "unavailable" : generations.get(child)!,
          })
          .pipe(Effect.mapError(toError))
      })

    const send = (message: ProviderWorkerInput): Effect.Effect<void, Error> =>
      Effect.gen(function* () {
        const dispatch =
          typeof message !== "string" && message.type === "start-turn" ? message.dispatch : null
        const child = yield* Ref.get(processRef)
        yield* bindDispatch(dispatch, child)
        const refused =
          child === null ||
          (stopping && (typeof message === "string" || message.type !== "shutdown"))
        const delivery = refused
          ? Effect.fail(new Error(`${label} is unavailable or shutting down.`))
          : deliverCommand(child, message, label)
        yield* delivery.pipe(
          Effect.tapError(() =>
            dispatch === null
              ? Effect.void
              : persistRuntimeEvent({
                  threadId: dispatch.threadId,
                  turnId: dispatch.turnId,
                  validated: true,
                  method: "turn/completed",
                  params: {
                    turn: {
                      status: "failed",
                      error: "Worker delivery failed or was ambiguous; explicit retry required.",
                    },
                  },
                  promoteQueue: false,
                }),
          ),
        )
      })

    const notifyForSnapshot = (
      snapshot: AppSnapshot,
      threadId: string,
      method: string,
    ): Effect.Effect<void> =>
      Effect.sync(() => {
        const thread = snapshot.threads.find((candidate) => candidate.id === threadId)
        if (thread === undefined) return
        const approval = snapshot.approvals.some((candidate) => candidate.threadId === threadId)
        if (!approval && method !== "turn/completed") return
        platform.notify({
          title: approval ? `${label} needs approval` : `${label} turn finished`,
          body: thread.title,
          threadId,
          onClick: () => runFork(hostEvents.publish({ _tag: "AttentionRequested", threadId })),
        })
      })

    /** Tells clients about a stored event, notifies the user when it needs them, and starts queued input. */
    const announce = (input: RuntimeEventInput, nextDispatch: TurnDispatch | null) =>
      Effect.gen(function* () {
        yield* hostEvents.publish({
          _tag: "RuntimeChanged",
          threadId: input.threadId,
          snapshotChanged: !isRuntimeDelta(input),
        })
        if (input.method === "turn/completed" || input.requestId !== undefined)
          yield* core.GetSnapshot().pipe(
            Effect.flatMap((snapshot) => notifyForSnapshot(snapshot, input.threadId, input.method)),
            Effect.catchAllCause(Effect.logError),
          )
        if (nextDispatch !== null) yield* send({ type: "start-turn", dispatch: nextDispatch })
      })

    const persistRuntimeEvent = (input: RuntimeEventInput): Effect.Effect<void> =>
      core.RecordRuntimeEvent(input).pipe(
        Effect.tapErrorCause(() =>
          Effect.sync(() => {
            // An event the core cannot store leaves its turn unknowable; restart the worker.
            const child = currentChild()
            if (child !== null && input.generation === generations.get(child)) child.kill()
          }),
        ),
        Effect.tap((result) =>
          result.changed ? announce(input, result.nextDispatch) : Effect.void,
        ),
        Effect.asVoid,
        Effect.catchAllCause((cause) =>
          Effect.sync(() => console.error(`Could not persist a ${label} event.`, cause)),
        ),
      )

    const queue = makeEventQueue({
      persist: persistRuntimeEvent,
      runFork,
      overflow: (pending, input) => {
        const child = currentChild()
        console.error(`${label} event queue overflow; stopping worker.`, {
          generation: child === null ? undefined : generations.get(child),
          pending,
          method: input?.method,
        })
        child?.kill()
      },
    })
    yield* Effect.addFinalizer(() => Effect.sync(queue.dispose))

    /** Queues a core write whose failure is only logged. */
    const store = (write: Effect.Effect<unknown, unknown>, threadId: string, failure: string) =>
      queue.enqueue(
        write.pipe(
          Effect.andThen(publishChange(threadId)),
          Effect.catchAll((cause) => Effect.sync(() => console.error(failure, cause))),
        ),
      )

    const handleProviderReady = (event: Extract<WorkerEvent, { type: "provider-ready" }>) => {
      const { status } = event
      if (status.harness !== config.harness || event.providerKey !== provider) {
        console.error(`${label} returned a model catalog for another provider.`)
        return
      }
      logStartupTiming("provider ready", `${config.harness} ${status.availability}`)
      queue.enqueue(
        core
          .SyncProviderCatalog({
            providerKey: event.providerKey,
            models: event.models,
            ...(event.partial === true ? { partial: true } : {}),
          })
          .pipe(
            Effect.tap(() => publishStatus(status)),
            Effect.tap(() => publishChange("")),
            Effect.asVoid,
            Effect.catchAll((cause) =>
              publishStatus({
                ...status,
                availability: "error",
                detail: `Could not store the ${label} model catalog: ${errorMessage(cause)}`,
              }),
            ),
          ),
      )
    }

    const handleTurnStartFailure = (event: Extract<WorkerEvent, { type: "turn-start-failed" }>) => {
      const failure = { threadId: event.threadId, turnId: event.turnId }
      queue.enqueue(
        persistRuntimeEvent({
          ...failure,
          method: "error",
          params: { error: { message: event.message } },
        }).pipe(
          Effect.andThen(
            persistRuntimeEvent({
              ...failure,
              validated: true,
              method: "turn/completed",
              params: { turn: { status: "failed", error: event.message } },
            }),
          ),
        ),
      )
    }

    const handleWorkerMessage = (message: unknown, owner: HostProcess): void => {
      const decoded = decodeEvent(message)
      if (Either.isLeft(decoded)) {
        console.error(`${label} sent an invalid message.`, asRecord(message).type)
        return
      }
      const event = decoded.right
      switch (event.type) {
        case "process-started":
          descendants.get(owner)?.add(event.pid)
          return
        case "process-stopped":
          descendants.get(owner)?.delete(event.pid)
          return
        case "provider-status":
          if (event.status.harness === config.harness) runFork(publishStatus(event.status))
          return
        case "provider-ready":
          return handleProviderReady(event)
        case "runtime-event":
          return queue.event({
            ...event.input,
            generation: generations.get(owner),
            validated: event.input.validated === true,
          })
        case "thread-title":
          if (handleGeneratedText(event)) return
          return store(
            core.SetThreadTitle({ threadId: event.threadId, title: event.title }),
            event.threadId,
            "Could not store a generated thread title.",
          )
        case "title-failed":
          if (!handleGeneratedText(event))
            console.error("Could not generate a thread title.", event.message)
          return
        case "provider-session":
          return store(
            core.SetProviderSession({
              threadId: event.threadId,
              harness: config.harness,
              nativeThreadId: event.nativeThreadId,
            }),
            event.threadId,
            `Could not store the ${label} thread id.`,
          )
        case "turn-start-failed":
          return handleTurnStartFailure(event)
        case "protocol-error":
          console.error(`${label} protocol error:`, event.message, event.raw)
          return
        case "command-ack":
        case "usage-result":
        case "commands-result":
          // The exchange that sent the command or request is waiting for these.
          return
      }
    }

    /** Settles everything a worker owned once it exits: its processes and its running turns. */
    const workerExited = (child: HostProcess, code: number): void => {
      if (!stopping)
        console.error(`${label} worker exited.`, {
          code,
          generation: generations.get(child),
          pending: queue.pending(),
        })
      queue.flush()
      queue.enqueue(
        stopDescendants(child).pipe(
          Effect.andThen(
            stopping ? Effect.void : core.ReconcileWorker({ generation: generations.get(child)! }),
          ),
          Effect.andThen(publishChange("")),
          Effect.catchAll(Effect.logError),
        ),
        true,
      )
    }

    const forkWorker = Effect.try({
      try: () => {
        const child = platform.fork(config.worker, `MeldShell ${label}`)
        generations.set(child, randomUUID())
        descendants.set(child, new Set())
        child.stdout?.pipe(process.stdout)
        child.stderr?.pipe(process.stderr)
        return child
      },
      catch: toError,
    })

    /** Runs until the worker exits, routing its messages meanwhile. */
    const superviseWorker = (child: HostProcess) =>
      Ref.set(processRef, child).pipe(
        Effect.andThen(
          Effect.async<void>((resume) => {
            const onExit = (code: number): void => {
              workerExited(child, code)
              resume(Effect.void)
            }
            const onMessage = (message: unknown): void => handleWorkerMessage(message, child)
            child.on("message", onMessage)
            child.once("exit", onExit)
            return Effect.sync(() => {
              child.off("message", onMessage)
              child.off("exit", onExit)
            })
          }),
        ),
      )

    const runWorker = Effect.suspend(() =>
      stopping ? Effect.never : publishStatus(probing()),
    ).pipe(
      Effect.andThen(
        Effect.acquireUseRelease(forkWorker, superviseWorker, (child) =>
          Ref.set(processRef, null).pipe(Effect.andThen(Effect.sync(() => child.kill()))),
        ),
      ),
      Effect.andThen(
        publishStatus({
          ...probing(),
          availability: "error",
          detail: `The ${label} integration stopped. MeldShell is restarting it with backoff.`,
        }),
      ),
      Effect.catchAll((cause) =>
        publishStatus({
          ...probing(),
          availability: "error",
          detail: `The ${label} integration could not start: ${errorMessage(cause)}`,
        }),
      ),
    )

    // Provider processes are isolated and catalog writes are serialized by the core worker,
    // so probes can start concurrently without weakening provider or database boundaries.
    yield* runWorker.pipe(Effect.repeat(restartSchedule), Effect.forkScoped)

    const shutdown = Effect.gen(function* () {
      if (stopping) return
      stopping = true
      queue.flush()
      const child = yield* Ref.get(processRef)
      if (child === null) return
      yield* send({ type: "shutdown" }).pipe(Effect.catchAll(Effect.logError))
      yield* stopDescendants(child)
      child.kill()
    })
    yield* Effect.addFinalizer(() => shutdown)

    /** Waits for a worker to exit after stopping it; a worker that will not stop fails. */
    const killWorker = (child: HostProcess): Effect.Effect<void, Error> =>
      Effect.async<void, Error>((resume) => {
        if (child.pid === undefined) {
          resume(Effect.void)
          return
        }
        const onExit = (): void => resume(Effect.void)
        child.once("exit", onExit)
        if (!child.kill()) resume(Effect.fail(new Error(`Could not stop the ${label} worker.`)))
        return Effect.sync(() => child.off("exit", onExit))
      }).pipe(
        Effect.timeoutFail({
          duration: "5 seconds",
          onTimeout: () => new Error(`${label} worker did not exit after cancellation.`),
        }),
      )

    /** The last resort for a turn the harness would not cancel: stop the worker that runs it. */
    const abandonTurn = (turn: {
      readonly id: string
      readonly worker_generation: string | null
    }) =>
      Effect.gen(function* () {
        const child = yield* Ref.get(processRef)
        const generation = turn.worker_generation ?? randomUUID()
        if (turn.worker_generation === null)
          yield* core.BindTurnWorker({ turnId: turn.id, generation }).pipe(Effect.mapError(toError))
        if (child !== null && generations.get(child) === generation) {
          console.error(
            `${label} did not settle cancellation; stopping its worker and active turns.`,
          )
          yield* Effect.forEach([...(descendants.get(child) ?? [])], stopPid, {
            discard: true,
            concurrency: "unbounded",
          })
          yield* killWorker(child)
        }
        yield* core.ReconcileWorker({ generation }).pipe(Effect.mapError(toError))
      })

    const withWorker = <A>(
      request: (child: HostProcess) => Effect.Effect<A, Error>,
    ): Effect.Effect<A, Error> =>
      Ref.get(processRef).pipe(
        Effect.flatMap((child) =>
          child === null
            ? Effect.fail(new Error(`${label} is restarting. Try again shortly.`))
            : request(child),
        ),
      )

    return {
      interrupt: (threadId, turnId) =>
        interruptWithRecovery(
          turnId,
          core.InterruptTurn({ threadId }).pipe(Effect.mapError(toError)),
          (turn) =>
            send({
              type: "interrupt-turn",
              nativeThreadId: turn.native_thread_id!,
              nativeTurnId: turn.native_turn_id!,
            }),
          (turn) => abandonTurn(turn).pipe(Effect.andThen(publishChange(threadId))),
        ),
      shutdown,
      usage: withWorker((child) => requestUsage(child, label)),
      commands: (workspacePath) =>
        withWorker((child) => requestCommands(child, label, workspacePath)),
      status: Ref.get(statusRef),
      refresh: Effect.suspend(() =>
        publishStatus(probing()).pipe(Effect.andThen(send("probe-now"))),
      ),
      send,
    }
  })

const providerLayer = <Id>(
  tag: Context.Tag<Id, ProviderService>,
  config: ProviderConfig,
): Layer.Layer<Id, never, CoreClient | HostEvents | HostPlatform> =>
  Layer.scoped(tag, providerRuntime(config))

export const codexProviderLive = () =>
  providerLayer(CodexProvider, { harness: "codex", worker: "codex-worker.js" })

export const claudeProviderLive = () =>
  providerLayer(ClaudeProvider, { harness: "claude-code", worker: "claude-worker.js" })

export const cursorProviderLive = () =>
  providerLayer(CursorProvider, { harness: "cursor", worker: "cursor-worker.js" })

const providerTags = {
  codex: CodexProvider,
  "claude-code": ClaudeProvider,
  cursor: CursorProvider,
} as const

/** The provider service for a harness; an unknown harness is routed to Codex, as it predates the others. */
export const providerFor = (
  harness: string,
): Effect.Effect<ProviderService, never, CodexProvider | ClaudeProvider | CursorProvider> =>
  providerTags[isHarness(harness) ? harness : "codex"]
