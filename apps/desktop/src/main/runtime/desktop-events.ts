import type { ProviderStatus } from "@meldshell/contracts"
import { IPC } from "@meldshell/contracts"
import type { BrowserWindow } from "electron"
import { Effect, Layer, PubSub, Stream } from "effect"

type DesktopEvent =
  | { readonly _tag: "ProviderStatusChanged"; readonly status: ProviderStatus }
  | {
      readonly _tag: "RuntimeChanged"
      readonly threadId: string
      readonly snapshotChanged?: boolean
    }
  | { readonly _tag: "AttentionRequested"; readonly threadId: string }

export class DesktopEvents extends Effect.Service<DesktopEvents>()("MeldShell/DesktopEvents", {
  scoped: Effect.gen(function* () {
    const pubsub = yield* Effect.acquireRelease(PubSub.bounded<DesktopEvent>(64), PubSub.shutdown)
    return {
      publish: (event: DesktopEvent) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
      subscribe: PubSub.subscribe(pubsub),
    }
  }),
}) {}

export const eventDeliveryLive = (
  getWindow: () => BrowserWindow | null,
): Layer.Layer<never, never, DesktopEvents> =>
  Layer.scopedDiscard(
    Effect.gen(function* () {
      const events = yield* DesktopEvents
      const subscription = yield* events.subscribe
      yield* Stream.fromQueue(subscription).pipe(
        Stream.groupedWithin(64, "32 millis"),
        Stream.runForEach((batch) =>
          Effect.sync(() => {
            const window = getWindow()
            if (window === null || window.isDestroyed()) return
            const changed = new Map<string, boolean>()
            for (const event of batch) {
              switch (event._tag) {
                case "ProviderStatusChanged":
                  window.webContents.send(IPC.providerStatusChanged, event.status)
                  break
                case "RuntimeChanged":
                  changed.set(
                    event.threadId,
                    changed.get(event.threadId) === true || event.snapshotChanged !== false,
                  )
                  break
                case "AttentionRequested":
                  window.webContents.send(IPC.attentionRequested, event.threadId)
                  break
              }
            }
            for (const [threadId, snapshotChanged] of changed)
              window.webContents.send(IPC.runtimeChanged, threadId, snapshotChanged)
          }),
        ),
        Effect.forkScoped,
      )
    }),
  )
