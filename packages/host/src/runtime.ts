import { Layer, ManagedRuntime, Effect } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { HostPlatform } from "./platform"
import {
  codexProviderLive,
  claudeProviderLive,
  cursorProviderLive,
  CodexProvider,
  ClaudeProvider,
  CursorProvider,
  providerFor,
} from "./worker-provider"
import { stopAllWorktreeSetups } from "./workspace-scripts"

export const createHostRuntime = (platform: typeof HostPlatform.Service) =>
  ManagedRuntime.make(
    Layer.mergeAll(codexProviderLive, claudeProviderLive, cursorProviderLive).pipe(
      Layer.provideMerge(Layer.merge(CoreClient.Default, HostEvents.Default)),
      Layer.provideMerge(Layer.succeed(HostPlatform, platform)),
    ),
  )
export type HostRuntime = ReturnType<typeof createHostRuntime>
export type HostServices =
  | CoreClient
  | HostEvents
  | HostPlatform
  | CodexProvider
  | ClaudeProvider
  | CursorProvider
export const stopHost = Effect.gen(function* () {
  const core = yield* CoreClient
  yield* stopAllWorktreeSetups.pipe(Effect.catchAll(Effect.logError))
  const turns = yield* core
    .BeginShutdown()
    .pipe(Effect.catchAll((cause) => Effect.as(Effect.logError(cause), [])))
  yield* Effect.forEach(
    turns,
    (turn) =>
      turn.nativeTurnId !== null && turn.nativeThreadId !== null
        ? Effect.flatMap(providerFor(turn.harness), (provider) =>
            provider.send({
              type: "interrupt-turn",
              nativeThreadId: turn.nativeThreadId!,
              nativeTurnId: turn.nativeTurnId!,
            }),
          ).pipe(Effect.catchAll(Effect.logError))
        : Effect.void,
    { discard: true },
  )
  const providers = [yield* CodexProvider, yield* ClaudeProvider, yield* CursorProvider]
  yield* Effect.all(
    providers.map((provider) => provider.shutdown),
    { concurrency: 3 },
  )
  yield* core.FinishShutdown().pipe(Effect.catchAll(Effect.logError))
})
