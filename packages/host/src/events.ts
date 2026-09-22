import { IPC, type ProviderStatus, type RemoteEvent } from "@meldshell/contracts"
import { Effect, PubSub } from "effect"

export type HostEvent =
  | { readonly _tag: "ProviderStatusChanged"; readonly status: ProviderStatus }
  | {
      readonly _tag: "RuntimeChanged"
      readonly threadId: string
      readonly snapshotChanged?: boolean
    }
  | { readonly _tag: "AttentionRequested"; readonly threadId: string }

export class HostEvents extends Effect.Service<HostEvents>()("MeldShell/HostEvents", {
  scoped: Effect.gen(function* () {
    const pubsub = yield* Effect.acquireRelease(PubSub.bounded<HostEvent>(64), PubSub.shutdown)
    return {
      publish: (event: HostEvent) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
      subscribe: PubSub.subscribe(pubsub),
    }
  }),
}) {}

/** Collapses a batch of events into client frames, with one runtime change per thread. */
export function eventFrames(batch: Iterable<HostEvent>): RemoteEvent[] {
  const frames: RemoteEvent[] = []
  const changed = new Map<string, boolean>()
  for (const event of batch) {
    if (event._tag === "RuntimeChanged")
      changed.set(
        event.threadId,
        changed.get(event.threadId) === true || event.snapshotChanged !== false,
      )
    else if (event._tag === "ProviderStatusChanged")
      frames.push({ type: "event", channel: IPC.providerStatusChanged, args: [event.status] })
    else frames.push({ type: "event", channel: IPC.attentionRequested, args: [event.threadId] })
  }
  for (const [threadId, snapshotChanged] of changed)
    frames.push({ type: "event", channel: IPC.runtimeChanged, args: [threadId, snapshotChanged] })
  return frames
}
