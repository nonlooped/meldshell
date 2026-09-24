import { handleGeneratedText } from "./generated-text"
import { logStartupTiming } from "./startup-timing"
import { stopProcessTree } from "@meldshell/provider-runtime/process-tree"
import { randomUUID } from "node:crypto"
import {
  ProviderStatus as ProviderStatusSchema,
  CodexUsage as CodexUsageSchema,
  ComposerCommand as ComposerCommandSchema,
  ProviderSessionInput as ProviderSessionInputSchema,
  RuntimeEventInput as RuntimeEventInputSchema,
  SetThreadTitleInput as SetThreadTitleInputSchema,
  SyncProviderCatalogInput as SyncProviderCatalogInputSchema,
  type AppSnapshot,
  type ProviderStatus,
  type CodexUsage,
  type ComposerCommand,
  type RuntimeEventInput,
  type TurnDispatch,
  type ProviderWorkerInput,
} from "@meldshell/contracts"
import { HostPlatform, type HostProcess } from "./platform"
import { Context, Effect, Either, Layer, Ref, Runtime, Schedule, Schema, type Scope } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { interruptWithRecovery } from "./interrupt-turn"
import { isRuntimeDelta, mergeRuntimeDelta } from "./runtime-deltas"

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

type ProviderConfig = {
  readonly provider: "openai" | "anthropic" | "cursor"
  readonly harness: "codex" | "claude-code" | "cursor"
  readonly label: string
  readonly worker: string
}

const messageText = (cause: unknown): string =>
  cause instanceof Error || (typeof cause === "object" && cause !== null && "message" in cause)
    ? String(cause.message)
    : String(cause)

const deliverCommand = (
  child: HostProcess,
  message: ProviderWorkerInput,
  label: string,
): Effect.Effect<void, Error> =>
  Effect.async<void, Error>((resume) => {
    const commandId = randomUUID()
    const cleanup = (): void => {
      child.off("message", onMessage)
      child.off("exit", onExit)
    }
    const finish = (error?: string): void => {
      cleanup()
      resume(error === undefined ? Effect.void : Effect.fail(new Error(error)))
    }
    const onMessage = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return
      const record = value as Record<string, unknown>
      if (record.type === "command-ack" && record.commandId === commandId)
        finish(typeof record.error === "string" ? record.error : undefined)
    }
    const onExit = (): void =>
      finish(
        `${label} worker exited before acknowledging delivery. Retry explicitly after reconciliation.`,
      )
    child.on("message", onMessage)
    child.once("exit", onExit)
    try {
      child.postMessage(typeof message === "string" ? message : { ...message, commandId })
      if (typeof message === "string") finish()
    } catch (cause) {
      finish(messageText(cause))
    }
    return Effect.sync(cleanup)
  }).pipe(
    Effect.timeoutFail({
      duration: "8 seconds",
      onTimeout: () => {
        child.kill()
        return new Error(
          `${label} delivery was not acknowledged. The worker was stopped; explicit retry is required.`,
        )
      },
    }),
  )

/** Sends one request to a worker and decodes the reply that carries the same request ID. */
const requestWorker = <A, I>(
  child: HostProcess,
  label: string,
  request: { readonly type: string; readonly result: string; readonly cancel?: string },
  fields: Record<string, unknown>,
  schema: Schema.Schema<A, I, never>,
  field: string,
  timeout: { readonly duration: `${number} seconds`; readonly message: string },
): Effect.Effect<A, Error> =>
  Effect.async<A, Error>((resume) => {
    const requestId = randomUUID()
    const finish = (result: Effect.Effect<A, Error>): void => {
      child.off("message", onMessage)
      child.off("exit", onExit)
      resume(result)
    }
    const onMessage = (message: unknown): void => {
      if (typeof message !== "object" || message === null) return
      const record = message as Record<string, unknown>
      if (record.type !== request.result || record.requestId !== requestId) return
      if (typeof record.error === "string") {
        finish(Effect.fail(new Error(record.error)))
        return
      }
      const decoded = Schema.decodeUnknownEither(schema)(record[field])
      finish(
        Either.isRight(decoded)
          ? Effect.succeed(decoded.right)
          : Effect.fail(new Error(`${label} returned an invalid ${field} response.`)),
      )
    }
    const onExit = (): void =>
      finish(Effect.fail(new Error(`${label} disconnected. Try again shortly.`)))
    child.on("message", onMessage)
    child.once("exit", onExit)
    try {
      child.postMessage({ ...fields, type: request.type, requestId })
    } catch (cause) {
      finish(Effect.fail(new Error(messageText(cause))))
    }
    return Effect.sync(() => {
      child.off("message", onMessage)
      child.off("exit", onExit)
      if (request.cancel === undefined) return
      try {
        child.postMessage({ type: request.cancel, requestId })
      } catch {
        /* Worker already exited. */
      }
    })
  }).pipe(
    Effect.timeoutFail({
      duration: timeout.duration,
      onTimeout: () => new Error(timeout.message),
    }),
  )

const requestUsage = (child: HostProcess, label: string): Effect.Effect<CodexUsage, Error> =>
  requestWorker(
    child,
    label,
    { type: "get-usage", result: "usage-result", cancel: "cancel-usage" },
    {},
    CodexUsageSchema,
    "usage",
    { duration: "20 seconds", message: `${label} usage took too long to load. Try again.` },
  )

const ComposerCommands = Schema.Array(ComposerCommandSchema)

const requestCommands = (
  child: HostProcess,
  label: string,
  workspacePath: string,
): Effect.Effect<ReadonlyArray<ComposerCommand>, Error> =>
  requestWorker(
    child,
    label,
    { type: "list-commands", result: "commands-result" },
    { workspacePath },
    ComposerCommands,
    "commands",
    { duration: "30 seconds", message: `${label} commands took too long to load.` },
  )

const providerRuntime = (
  config: ProviderConfig,
): Effect.Effect<ProviderService, never, CoreClient | HostEvents | HostPlatform | Scope.Scope> =>
  Effect.gen(function* () {
    const probingStatus = (): ProviderStatus => ({
      ...(config.harness === "cursor"
        ? { provider: "cursor" as const, harness: "cursor" as const }
        : config.harness === "codex"
          ? { provider: "openai" as const, harness: "codex" as const }
          : { provider: "anthropic" as const, harness: "claude-code" as const }),
      availability: "probing",
      executablePath: null,
      version: null,
      detail: `Connecting to ${config.label}...`,
      checkedAt: new Date().toISOString(),
    })
    const platform = yield* HostPlatform
    const core = yield* CoreClient
    const hostEvents = yield* HostEvents
    const runtime = yield* Effect.runtime<never>()
    const scope = yield* Effect.scope
    const runFork = (effect: Effect.Effect<void>): void => {
      Runtime.runFork(runtime)(effect.pipe(Effect.forkIn(scope)))
    }
    const processRef = yield* Ref.make<HostProcess | null>(null)
    const statusRef = yield* Ref.make(probingStatus())
    type RuntimeTask = { effect: Effect.Effect<void>; input?: RuntimeEventInput | undefined }
    const descendants = new WeakMap<HostProcess, Set<number>>()
    const generations = new WeakMap<HostProcess, string>()
    let stopping = false
    let draining = false
    const tasks: RuntimeTask[] = []
    const publishStatus = (status: ProviderStatus): Effect.Effect<void> =>
      Ref.set(statusRef, status).pipe(
        Effect.andThen(hostEvents.publish({ _tag: "ProviderStatusChanged", status })),
      )

    const bindDispatch = (
      dispatch: TurnDispatch | null,
      child: HostProcess | null,
    ): Effect.Effect<void, Error> =>
      Effect.gen(function* () {
        if (dispatch !== null && dispatch.harness !== config.harness)
          return yield* Effect.fail(new Error("Turn routed to the wrong provider."))
        if (dispatch !== null) {
          yield* core
            .BindTurnWorker({
              turnId: dispatch.turnId,
              generation: child === null ? "unavailable" : generations.get(child)!,
            })
            .pipe(Effect.mapError((cause) => new Error(messageText(cause))))
        }
      })

    const send = (message: ProviderWorkerInput): Effect.Effect<void, Error> =>
      Effect.gen(function* () {
        const dispatch =
          typeof message !== "string" && message.type === "start-turn" ? message.dispatch : null
        const child = yield* Ref.get(processRef)
        yield* bindDispatch(dispatch, child)
        const delivery =
          child === null ||
          (stopping && (typeof message === "string" || message.type !== "shutdown"))
            ? Effect.fail(new Error(`${config.label} is unavailable or shutting down.`))
            : deliverCommand(child, message, config.label)
        yield* delivery.pipe(
          Effect.tapError(() => {
            if (dispatch === null) return Effect.void
            return persistRuntimeEvent({
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
            })
          }),
        )
      })

    const dispatchTurn = (dispatch: TurnDispatch | null): Effect.Effect<void, Error> =>
      dispatch === null ? Effect.void : send({ type: "start-turn", dispatch })

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
          title: approval ? `${config.label} needs approval` : `${config.label} turn finished`,
          body: thread.title,
          threadId,
          onClick: () => runFork(hostEvents.publish({ _tag: "AttentionRequested", threadId })),
        })
      })

    const persistRuntimeEvent = (input: RuntimeEventInput): Effect.Effect<void> =>
      core.RecordRuntimeEvent(input).pipe(
        Effect.tapErrorCause(() =>
          Effect.sync(() => {
            const child = Effect.runSync(Ref.get(processRef))
            if (child !== null && input.generation === generations.get(child)) child.kill()
          }),
        ),
        Effect.tap((result) =>
          result.changed
            ? hostEvents
                .publish({
                  _tag: "RuntimeChanged",
                  threadId: input.threadId,
                  snapshotChanged: !isRuntimeDelta(input),
                })
                .pipe(
                  Effect.andThen(
                    input.method === "turn/completed" || input.requestId !== undefined
                      ? core.GetSnapshot().pipe(
                          Effect.flatMap((snapshot) =>
                            notifyForSnapshot(snapshot, input.threadId, input.method),
                          ),
                          Effect.catchAllCause(Effect.logError),
                        )
                      : Effect.void,
                  ),
                  Effect.andThen(dispatchTurn(result.nextDispatch)),
                )
            : Effect.void,
        ),
        Effect.asVoid,
        Effect.catchAllCause((cause) =>
          Effect.sync(() => console.error(`Could not persist a ${config.label} event.`, cause)),
        ),
      )

    const enqueue = (
      effect: Effect.Effect<void>,
      recovery = false,
      input?: RuntimeEventInput,
    ): void => {
      const previous = tasks.at(-1)
      const merged = input === undefined ? undefined : mergeRuntimeDelta(previous?.input, input)
      if (previous !== undefined && merged !== undefined) {
        // Continue batching while persistence is busy, without crossing intervening events.
        previous.input = merged
        previous.effect = persistRuntimeEvent(merged)
        return
      }
      if (!recovery && tasks.length >= 1024) {
        // Stop the producer on overflow. Its exit reconciles all owned turns; never drop a terminal event and continue running.
        const child = Effect.runSync(Ref.get(processRef))
        console.error(`${config.label} event queue overflow; stopping worker.`, {
          generation: child === null ? undefined : generations.get(child),
          pending: tasks.length,
          method: input?.method,
        })
        child?.kill()
        return
      }
      tasks.push({ effect, input })
      if (draining) return
      draining = true
      runFork(
        Effect.gen(function* () {
          while (tasks.length > 0)
            yield* tasks.shift()!.effect.pipe(Effect.catchAllCause(Effect.logError))
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              draining = false
            }),
          ),
        ),
      )
    }

    let delta: RuntimeEventInput | null = null
    let deltaTimer: ReturnType<typeof setTimeout> | undefined
    const flushDelta = (): void => {
      clearTimeout(deltaTimer)
      deltaTimer = undefined
      if (delta !== null) enqueue(persistRuntimeEvent(delta), false, delta)
      delta = null
    }
    yield* Effect.addFinalizer(() => Effect.sync(() => clearTimeout(deltaTimer)))
    const enqueueEvent = (input: RuntimeEventInput): void => {
      if (isRuntimeDelta(input)) {
        const merged = mergeRuntimeDelta(delta ?? undefined, input)
        if (merged !== undefined) {
          delta = merged
          return
        }
        flushDelta()
        delta = input
        deltaTimer = setTimeout(flushDelta, 16)
        return
      }
      flushDelta()
      enqueue(persistRuntimeEvent(input), false, input)
    }

    const handleProviderReady = (record: Record<string, unknown>): void => {
      const decodedStatus = Schema.decodeUnknownEither(ProviderStatusSchema)(record.status)
      const decodedCatalog = Schema.decodeUnknownEither(SyncProviderCatalogInputSchema)({
        providerKey: record.providerKey,
        models: record.models,
        ...(record.partial === true ? { partial: true } : {}),
      })
      if (
        Either.isLeft(decodedStatus) ||
        Either.isLeft(decodedCatalog) ||
        decodedStatus.right.harness !== config.harness ||
        decodedCatalog.right.providerKey !== config.provider
      ) {
        console.error(`${config.label} returned an invalid model catalog message.`)
        return
      }
      logStartupTiming("provider ready", `${config.harness} ${decodedStatus.right.availability}`)
      enqueue(
        core.SyncProviderCatalog(decodedCatalog.right).pipe(
          Effect.tap(() => publishStatus(decodedStatus.right)),
          Effect.tap(() => hostEvents.publish({ _tag: "RuntimeChanged", threadId: "" })),
          Effect.asVoid,
          Effect.catchAll((cause) =>
            publishStatus({
              ...decodedStatus.right,
              availability: "error",
              detail: `Could not store the ${config.label} model catalog: ${messageText(cause)}`,
            }),
          ),
        ),
      )
    }

    const handleRuntimeEvent = (record: Record<string, unknown>, owner: HostProcess): void => {
      const input = Schema.decodeUnknownEither(RuntimeEventInputSchema)(record.input)
      if (Either.isLeft(input)) {
        console.error(`${config.label} returned an invalid runtime event.`)
        return
      }
      enqueueEvent({
        ...input.right,
        generation: generations.get(owner),
        validated: record.known === true || record.known === "validated",
      })
    }

    const handleThreadTitle = (record: Record<string, unknown>): void => {
      if (handleGeneratedText(record)) return
      const input = Schema.decodeUnknownEither(SetThreadTitleInputSchema)({
        threadId: record.threadId,
        title: record.title,
      })
      if (Either.isLeft(input)) {
        console.error(`${config.label} returned an invalid thread title.`)
        return
      }
      enqueue(
        core.SetThreadTitle(input.right).pipe(
          Effect.tap(() =>
            hostEvents.publish({
              _tag: "RuntimeChanged",
              threadId: input.right.threadId,
            }),
          ),
          Effect.asVoid,
          Effect.catchAll((cause) =>
            Effect.sync(() => console.error("Could not store a generated thread title.", cause)),
          ),
        ),
      )
    }

    const handleProviderSession = (record: Record<string, unknown>): void => {
      const input = Schema.decodeUnknownEither(ProviderSessionInputSchema)({
        threadId: record.threadId,
        harness: config.harness,
        nativeThreadId: record.nativeThreadId,
      })
      if (Either.isLeft(input)) {
        console.error(`${config.label} returned an invalid provider session.`)
        return
      }
      enqueue(
        core.SetProviderSession(input.right).pipe(
          Effect.tap(() =>
            hostEvents.publish({
              _tag: "RuntimeChanged",
              threadId: input.right.threadId,
            }),
          ),
          Effect.asVoid,
          Effect.catchAll((cause) =>
            Effect.sync(() =>
              console.error(`Could not store the ${config.label} thread id.`, cause),
            ),
          ),
        ),
      )
    }

    const handleTurnStartFailure = (record: Record<string, unknown>): void => {
      const input = Schema.decodeUnknownEither(RuntimeEventInputSchema)({
        threadId: record.threadId,
        turnId: record.turnId,
        method: "error",
        params: { error: { message: record.message } },
      })
      if (Either.isLeft(input) || typeof record.message !== "string") {
        console.error(`${config.label} returned an invalid turn failure.`)
        return
      }
      enqueue(
        persistRuntimeEvent(input.right).pipe(
          Effect.andThen(
            persistRuntimeEvent({
              ...input.right,
              validated: true,
              method: "turn/completed",
              params: { turn: { status: "failed", error: record.message } },
            }),
          ),
        ),
      )
    }

    const handleTitleFailure = (record: Record<string, unknown>): void => {
      if (!handleGeneratedText(record))
        console.error("Could not generate a thread title.", record.message)
    }

    const handleWorkerMessage = (message: unknown, owner: HostProcess): void => {
      const record =
        typeof message === "object" && message !== null
          ? (message as Record<string, unknown>)
          : null
      switch (record?.type) {
        case "app-server-started":
          if (typeof record.pid === "number" && Number.isSafeInteger(record.pid) && record.pid > 0)
            descendants.get(owner)?.add(record.pid)
          return
        case "app-server-stopped":
          if (typeof record.pid === "number") descendants.get(owner)?.delete(record.pid)
          return
        case "provider-ready":
          return handleProviderReady(record)
        case "runtime-event":
          return handleRuntimeEvent(record, owner)
        case "thread-title":
          return handleThreadTitle(record)
        case "provider-session":
          return handleProviderSession(record)
        case "turn-start-failed":
          return handleTurnStartFailure(record)
        case "title-failed":
          handleTitleFailure(record)
          return
        case "protocol-error":
          console.error(`${config.label} protocol error:`, record.message, record.raw)
          return
      }
      const decoded = Schema.decodeUnknownEither(ProviderStatusSchema)(message)
      if (Either.isRight(decoded) && decoded.right.harness === config.harness)
        runFork(publishStatus(decoded.right))
    }

    const runWorker = Effect.suspend(() =>
      stopping ? Effect.never : publishStatus(probingStatus()),
    ).pipe(
      Effect.andThen(
        Effect.acquireUseRelease(
          Effect.try({
            try: () => {
              const child = platform.fork(config.worker, `MeldShell ${config.label}`)
              generations.set(child, randomUUID())
              descendants.set(child, new Set())
              child.stdout?.pipe(process.stdout)
              child.stderr?.pipe(process.stderr)
              return child
            },
            catch: (cause) => new Error(messageText(cause)),
          }),
          (child) =>
            Ref.set(processRef, child).pipe(
              Effect.andThen(
                Effect.async<void>((resume) => {
                  const onExit = (code: number): void => {
                    if (!stopping)
                      console.error(`${config.label} worker exited.`, {
                        code,
                        generation: generations.get(child),
                        pending: tasks.length,
                      })
                    flushDelta()
                    enqueue(
                      Effect.forEach(
                        [...(descendants.get(child) ?? [])],
                        (pid) =>
                          Effect.tryPromise({
                            try: () => stopProcessTree(pid),
                            catch: (cause) => new Error(messageText(cause)),
                          }).pipe(Effect.catchAll(Effect.logError)),
                        { discard: true },
                      ).pipe(
                        Effect.andThen(
                          stopping
                            ? Effect.void
                            : core.ReconcileWorker({ generation: generations.get(child)! }),
                        ),
                        Effect.andThen(
                          hostEvents.publish({ _tag: "RuntimeChanged", threadId: "" }),
                        ),
                        Effect.catchAll(Effect.logError),
                      ),
                      true,
                    )
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
            ),
          (child) =>
            Ref.set(processRef, null).pipe(Effect.andThen(Effect.sync(() => child.kill()))),
        ),
      ),
      Effect.andThen(
        publishStatus({
          ...probingStatus(),
          availability: "error",
          detail: `The ${config.label} integration stopped. MeldShell is restarting it with backoff.`,
        }),
      ),
      Effect.catchAll((cause) =>
        publishStatus({
          ...probingStatus(),
          availability: "error",
          detail: `The ${config.label} integration could not start: ${messageText(cause)}`,
        }),
      ),
    )

    const restartSchedule = Schedule.exponential("1 second").pipe(
      Schedule.union(Schedule.spaced("30 seconds")),
    )
    // Provider processes are isolated and catalog writes are serialized by the core worker,
    // so probes can start concurrently without weakening provider or database boundaries.
    yield* runWorker.pipe(Effect.repeat(restartSchedule), Effect.forkScoped)

    const shutdown = Effect.gen(function* () {
      if (stopping) return
      stopping = true
      flushDelta()
      const child = yield* Ref.get(processRef)
      if (child !== null) {
        yield* send({ type: "shutdown" }).pipe(Effect.catchAll((cause) => Effect.logError(cause)))
        yield* Effect.forEach(
          [...(descendants.get(child) ?? [])],
          (pid) =>
            Effect.tryPromise({
              try: () => stopProcessTree(pid),
              catch: (cause) => new Error(messageText(cause)),
            }).pipe(Effect.catchAll(Effect.logError)),
          { discard: true },
        )
        child.kill()
      }
    })
    yield* Effect.addFinalizer(() => shutdown)

    return {
      interrupt: (threadId, turnId) =>
        interruptWithRecovery(
          turnId,
          core
            .InterruptTurn({ threadId })
            .pipe(Effect.mapError((cause) => new Error(messageText(cause)))),
          (turn) =>
            send({
              type: "interrupt-turn",
              nativeThreadId: turn.native_thread_id!,
              nativeTurnId: turn.native_turn_id!,
            }),
          (turn) =>
            Effect.gen(function* () {
              const child = yield* Ref.get(processRef)
              const generation = turn.worker_generation ?? randomUUID()
              if (turn.worker_generation === null)
                yield* core
                  .BindTurnWorker({ turnId: turn.id, generation })
                  .pipe(Effect.mapError((cause) => new Error(messageText(cause))))
              if (child !== null && generations.get(child) === generation) {
                console.error(
                  `${config.label} did not settle cancellation; stopping its worker and active turns.`,
                )
                yield* Effect.forEach(
                  [...(descendants.get(child) ?? [])],
                  (pid) =>
                    Effect.tryPromise({
                      try: () => stopProcessTree(pid),
                      catch: (cause) => new Error(messageText(cause)),
                    }),
                  { discard: true, concurrency: "unbounded" },
                )
                yield* Effect.async<void, Error>((resume) => {
                  if (child.pid === undefined) {
                    resume(Effect.void)
                    return
                  }
                  const onExit = (): void => resume(Effect.void)
                  child.once("exit", onExit)
                  if (!child.kill())
                    resume(Effect.fail(new Error(`Could not stop the ${config.label} worker.`)))
                  return Effect.sync(() => child.off("exit", onExit))
                }).pipe(
                  Effect.timeoutFail({
                    duration: "5 seconds",
                    onTimeout: () =>
                      new Error(`${config.label} worker did not exit after cancellation.`),
                  }),
                )
              }
              yield* core
                .ReconcileWorker({ generation })
                .pipe(Effect.mapError((cause) => new Error(messageText(cause))))
              yield* hostEvents.publish({ _tag: "RuntimeChanged", threadId })
            }),
        ),
      shutdown,
      usage: Ref.get(processRef).pipe(
        Effect.flatMap((child) => {
          if (child === null)
            return Effect.fail(new Error(`${config.label} is restarting. Try again shortly.`))
          return requestUsage(child, config.label)
        }),
      ),
      commands: (workspacePath) =>
        Ref.get(processRef).pipe(
          Effect.flatMap((child) =>
            child === null
              ? Effect.fail(new Error(`${config.label} is restarting. Try again shortly.`))
              : requestCommands(child, config.label, workspacePath),
          ),
        ),
      status: Ref.get(statusRef),
      refresh: Effect.suspend(() =>
        publishStatus(probingStatus()).pipe(Effect.andThen(send("probe-now"))),
      ),
      send,
    }
  })

export const codexProviderLive = (): Layer.Layer<
  CodexProvider,
  never,
  CoreClient | HostEvents | HostPlatform
> =>
  Layer.scoped(
    CodexProvider,
    providerRuntime({
      provider: "openai",
      harness: "codex",
      label: "Codex",
      worker: "codex-worker.js",
    }),
  )

export const claudeProviderLive = (): Layer.Layer<
  ClaudeProvider,
  never,
  CoreClient | HostEvents | HostPlatform
> =>
  Layer.scoped(
    ClaudeProvider,
    providerRuntime({
      provider: "anthropic",
      harness: "claude-code",
      label: "Claude Code",
      worker: "claude-worker.js",
    }),
  )

export class CursorProvider extends Context.Tag("MeldShell/CursorProvider")<
  CursorProvider,
  ProviderService
>() {}

export const cursorProviderLive = (): Layer.Layer<
  CursorProvider,
  never,
  CoreClient | HostEvents | HostPlatform
> =>
  Layer.scoped(
    CursorProvider,
    providerRuntime({
      provider: "cursor",
      harness: "cursor",
      label: "Cursor",
      worker: "cursor-worker.js",
    }),
  )

export const providerFor = (
  harness: string,
): Effect.Effect<ProviderService, never, CodexProvider | ClaudeProvider | CursorProvider> =>
  harness === "cursor" ? CursorProvider : harness === "claude-code" ? ClaudeProvider : CodexProvider
