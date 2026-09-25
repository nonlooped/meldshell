import { toError } from "@meldshell/contracts"
import { Effect } from "effect"

/** Runs a promise as an Effect that fails with its rejection as an Error. */
export const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise({ try: run, catch: toError })
