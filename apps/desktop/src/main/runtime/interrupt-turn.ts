import type { InterruptedTurn } from "@meldshell/contracts"
import { Effect } from "effect"

export const interruptWithRecovery = (
  turnId: string,
  getTurn: Effect.Effect<InterruptedTurn | null, Error>,
  requestInterrupt: (turn: InterruptedTurn) => Effect.Effect<void, Error>,
  stopWorker: (turn: InterruptedTurn) => Effect.Effect<void, Error>,
): Effect.Effect<void, Error> => {
  const waitForCompletion = (request: boolean) =>
    Effect.gen(function* () {
      let sent = false
      while (true) {
        const turn = yield* getTurn
        if (turn === null || turn.id !== turnId) return
        if (request && !sent && turn.native_turn_id !== null && turn.native_thread_id !== null) {
          yield* requestInterrupt(turn)
          sent = true
        }
        yield* Effect.sleep("100 millis")
      }
    })

  return waitForCompletion(true).pipe(
    Effect.timeoutFail({
      duration: "5 seconds",
      onTimeout: () => new Error("The provider did not finish cancelling the turn."),
    }),
    Effect.catchAll(() =>
      Effect.gen(function* () {
        const turn = yield* getTurn
        if (turn === null || turn.id !== turnId) return
        yield* stopWorker(turn)
        yield* waitForCompletion(false)
      }).pipe(
        Effect.timeoutFail({
          duration: "15 seconds",
          onTimeout: () =>
            new Error("Could not stop the provider. Restart MeldShell to recover this turn."),
        }),
      ),
    ),
  )
}
