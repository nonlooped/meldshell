import { Effect, Semaphore } from "effect"

/**
 * Runs effects that share a key one at a time, while effects with different keys run freely. A
 * key's lock exists only while something holds or awaits it.
 */
export const makeKeyedLock = () => {
  const locks = new Map<string, { readonly semaphore: Semaphore.Semaphore; users: number }>()
  return <A, E, R>(key: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        let lock = locks.get(key)
        if (lock === undefined) {
          lock = { semaphore: Semaphore.makeUnsafe(1), users: 0 }
          locks.set(key, lock)
        }
        lock.users++
        return lock
      }),
      (lock) => lock.semaphore.withPermit(effect),
      (lock) =>
        Effect.sync(() => {
          lock.users--
          if (lock.users === 0) locks.delete(key)
        }),
    )
}
