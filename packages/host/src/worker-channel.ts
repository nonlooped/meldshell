import { randomUUID } from "node:crypto"
import {
  asRecord,
  CommandsResult,
  toError,
  UsageResult,
  type CodexUsage,
  type ComposerCommand,
  type ProviderWorkerInput,
  type WorkerCommand,
} from "@meldshell/contracts"
import { Effect, Result, Schema } from "effect"
import type { HostProcess } from "./platform"

/*
 * Request and reply over a provider worker's message port. Every exchange ends when the reply
 * arrives, the worker exits, or the caller is interrupted, and removes its listeners in each case.
 */

type Reply<A> = (message: unknown) => Effect.Effect<A, Error> | undefined

const exchange = <A>(
  child: HostProcess,
  send: () => void,
  reply: Reply<A>,
  exited: string,
  cancel?: () => void,
): Effect.Effect<A, Error> =>
  Effect.callback<A, Error>((resume) => {
    const cleanup = (): void => {
      child.off("message", onMessage)
      child.off("exit", onExit)
    }
    const finish = (result: Effect.Effect<A, Error>): void => {
      cleanup()
      resume(result)
    }
    const onMessage = (message: unknown): void => {
      const result = reply(message)
      if (result !== undefined) finish(result)
    }
    const onExit = (): void => finish(Effect.fail(new Error(exited)))
    child.on("message", onMessage)
    child.once("exit", onExit)
    try {
      send()
    } catch (cause) {
      finish(Effect.fail(toError(cause)))
    }
    return Effect.sync(() => {
      cleanup()
      try {
        cancel?.()
      } catch {
        /* Worker already exited. */
      }
    })
  })

/** Delivers a command and waits for the worker to acknowledge it; a silent worker is stopped. */
export const deliverCommand = (
  child: HostProcess,
  message: ProviderWorkerInput,
  label: string,
): Effect.Effect<void, Error> => {
  if (typeof message === "string")
    return Effect.try({ try: () => child.postMessage(message), catch: toError })
  const commandId = randomUUID()
  return exchange(
    child,
    () => child.postMessage({ ...message, commandId }),
    (reply) => {
      const ack = asRecord(reply)
      if (ack.type !== "command-ack" || ack.commandId !== commandId) return undefined
      return typeof ack.error === "string" ? Effect.fail(new Error(ack.error)) : Effect.void
    },
    `${label} worker exited before acknowledging delivery. Retry explicitly after reconciliation.`,
  ).pipe(
    Effect.timeoutOrElse({
      duration: "8 seconds",
      orElse: () => {
        child.kill()
        return Effect.fail(
          new Error(
            `${label} delivery was not acknowledged. The worker was stopped; explicit retry is required.`,
          ),
        )
      },
    }),
  )
}

/** Matches the reply to one request. A malformed reply fails the request instead of timing out. */
const replyFor =
  <R extends { readonly error?: string | undefined }, I, A>(
    type: string,
    requestId: string,
    schema: Schema.Codec<R, I>,
    read: (reply: R) => A | undefined,
    invalid: string,
  ): Reply<A> =>
  (message) => {
    const raw = asRecord(message)
    if (raw.type !== type || raw.requestId !== requestId) return undefined
    if (typeof raw.error === "string") return Effect.fail(new Error(raw.error))
    const decoded = Schema.decodeUnknownResult(schema)(message)
    const value = Result.isSuccess(decoded) ? read(decoded.success) : undefined
    return value === undefined ? Effect.fail(new Error(invalid)) : Effect.succeed(value)
  }

const post = (child: HostProcess, command: WorkerCommand) => () => child.postMessage(command)

export const requestUsage = (
  child: HostProcess,
  label: string,
): Effect.Effect<CodexUsage, Error> => {
  const requestId = randomUUID()
  return exchange(
    child,
    post(child, { type: "get-usage", requestId }),
    replyFor(
      "usage-result",
      requestId,
      UsageResult,
      (reply) => reply.usage,
      `${label} returned an invalid usage response.`,
    ),
    `${label} disconnected. Try again shortly.`,
    post(child, { type: "cancel-usage", requestId }),
  ).pipe(
    Effect.timeoutOrElse({
      duration: "20 seconds",
      orElse: () => Effect.fail(new Error(`${label} usage took too long to load. Try again.`)),
    }),
  )
}

export const requestCommands = (
  child: HostProcess,
  label: string,
  workspacePath: string,
): Effect.Effect<ReadonlyArray<ComposerCommand>, Error> => {
  const requestId = randomUUID()
  return exchange(
    child,
    post(child, { type: "list-commands", requestId, workspacePath }),
    replyFor(
      "commands-result",
      requestId,
      CommandsResult,
      (reply) => reply.commands,
      `${label} returned an invalid commands response.`,
    ),
    `${label} disconnected. Try again shortly.`,
  ).pipe(
    Effect.timeoutOrElse({
      duration: "30 seconds",
      orElse: () => Effect.fail(new Error(`${label} commands took too long to load.`)),
    }),
  )
}
