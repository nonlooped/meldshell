import type { RuntimeEventInput } from "@meldshell/contracts"
import { Effect } from "effect"
import { isRuntimeDelta, mergeRuntimeDelta } from "./runtime-deltas"

/** More pending work than this means the worker outpaces persistence, so its producer is stopped. */
const QUEUE_LIMIT = 1024

/** Streaming deltas that arrive within this window are persisted as one event. */
const DELTA_WINDOW_MS = 16

interface Task {
  effect: Effect.Effect<void>
  input?: RuntimeEventInput | undefined
}

/**
 * Persists a provider's events one at a time, in arrival order. Consecutive streaming deltas merge
 * into one write, both while they wait out a short window and while persistence is busy.
 */
export const makeEventQueue = (options: {
  readonly persist: (input: RuntimeEventInput) => Effect.Effect<void>
  /** Runs the drain loop in the provider's scope. */
  readonly runFork: (effect: Effect.Effect<void>) => void
  /** Called instead of queueing once the queue is full; it should stop the producer. */
  readonly overflow: (pending: number, input: RuntimeEventInput | undefined) => void
}) => {
  const tasks: Task[] = []
  let draining = false
  let delta: RuntimeEventInput | null = null
  let deltaTimer: ReturnType<typeof setTimeout> | undefined

  const drain = (): void => {
    if (draining) return
    draining = true
    options.runFork(
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

  /** Queues work behind every pending event. `recovery` work is never refused on overflow. */
  const enqueue = (effect: Effect.Effect<void>, recovery = false, input?: RuntimeEventInput) => {
    const previous = tasks.at(-1)
    const merged = input === undefined ? undefined : mergeRuntimeDelta(previous?.input, input)
    if (previous !== undefined && merged !== undefined) {
      // Continue batching while persistence is busy, without crossing intervening events.
      previous.input = merged
      previous.effect = options.persist(merged)
      return
    }
    if (!recovery && tasks.length >= QUEUE_LIMIT) {
      // Never drop a terminal event and keep running: the producer's exit reconciles its turns.
      options.overflow(tasks.length, input)
      return
    }
    tasks.push({ effect, input })
    drain()
  }

  /** Queues the delta waiting out its window, if any. */
  const flush = (): void => {
    clearTimeout(deltaTimer)
    deltaTimer = undefined
    if (delta !== null) enqueue(options.persist(delta), false, delta)
    delta = null
  }

  const event = (input: RuntimeEventInput): void => {
    if (!isRuntimeDelta(input)) {
      flush()
      enqueue(options.persist(input), false, input)
      return
    }
    const merged = mergeRuntimeDelta(delta ?? undefined, input)
    if (merged !== undefined) {
      delta = merged
      return
    }
    flush()
    delta = input
    deltaTimer = setTimeout(flush, DELTA_WINDOW_MS)
  }

  return {
    enqueue,
    event,
    flush,
    pending: (): number => tasks.length,
    dispose: (): void => clearTimeout(deltaTimer),
  }
}
