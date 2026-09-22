import { Effect, Stream, Fiber } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents, eventFrames } from "./events"
import { createHostApi } from "./api"
import { createHostRuntime, stopHost } from "./runtime"
import type { HostPlatform } from "./platform"
import { connectRelay } from "./remote-connection"
import { beginLink, readCredential, unlinkDevice } from "./identity"

/** Runs the host in this process: core writer, provider workers, and the relay connection. */
export async function startHost(
  directory: string,
  platform: typeof HostPlatform.Service,
  onEvent: (channel: string, args: readonly unknown[]) => void = () => undefined,
) {
  let onCoreExit = () => undefined
  const runtime = createHostRuntime({ ...platform, onCoreExit: () => onCoreExit() })
  const core = <A, E>(run: (core: typeof CoreClient.Service) => Effect.Effect<A, E>) =>
    runtime.runPromise(Effect.flatMap(CoreClient, run))
  try {
    await core((client) => client.GetSnapshot())
  } catch (cause) {
    await runtime.dispose()
    throw cause
  }
  const api = createHostApi(runtime)
  const relay = connectRelay(directory, api.execute)
  // Batch bursts such as streamed deltas into one change per thread every 32 ms.
  const eventFiber = runtime.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        const events = yield* HostEvents
        yield* Stream.fromQueue(yield* events.subscribe).pipe(
          Stream.groupedWithin(64, "32 millis"),
          Stream.runForEach((batch) =>
            Effect.sync(() => {
              for (const frame of eventFrames(batch)) {
                relay.publish(frame)
                onEvent(frame.channel, frame.args)
              }
            }),
          ),
        )
      }),
    ),
  )

  let linking: { userCode: string; verificationURL: string } | null = null
  let linkError: string | null = null
  const remote = {
    status: async () => {
      const credential = await readCredential(directory)
      return {
        linked: !!credential,
        account: credential?.account ?? null,
        siteURL: credential?.siteURL ?? null,
        status: relay.status(),
        linking,
        error: linkError,
      }
    },
    link: async (url: string) => {
      if (linking) return linking
      const pending = await beginLink(directory, url)
      linking = { userCode: pending.userCode, verificationURL: pending.verificationURL }
      linkError = null
      pending.complete
        .then(relay.sync, (cause: unknown) => {
          linkError = cause instanceof Error ? cause.message : String(cause)
        })
        .finally(() => {
          linking = null
        })
      return linking
    },
    unlink: async () => {
      if (linking) throw new Error("Wait for sign-in to finish before signing out.")
      linkError = null
      await unlinkDevice(directory)
      await relay.sync()
    },
  }

  let closing: Promise<void> | undefined
  const close = () =>
    (closing ??= (async () => {
      relay.close()
      await Effect.runPromise(Fiber.interrupt(eventFiber))
      try {
        await runtime.runPromise(stopHost)
      } finally {
        await runtime.dispose()
      }
    })())
  onCoreExit = () => {
    void close().catch((cause) => console.error("Host stopped after core failure", cause))
  }
  return {
    call: api.call,
    addWorkspace: async (path: string) => {
      const snapshot = await core((client) => client.AddWorkspace({ path }))
      await runtime.runPromise(
        Effect.flatMap(HostEvents, (events) =>
          events.publish({ _tag: "RuntimeChanged", threadId: "" }),
        ),
      )
      return snapshot
    },
    activeTurns: () => core((client) => client.GetActiveTurnCount()),
    remote,
    close,
  }
}
export type Host = Awaited<ReturnType<typeof startHost>>
