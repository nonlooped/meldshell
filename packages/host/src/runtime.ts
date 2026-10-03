import { Layer, ManagedRuntime, Effect } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents } from "./events"
import { HostPlatform } from "./platform"
import {
  codexProviderLive,
  claudeProviderLive,
  cursorProviderLive,
  piProviderLive,
  CodexProvider,
  ClaudeProvider,
  CursorProvider,
  PiProvider,
  providerFor,
} from "./worker-provider"
import { ProviderUpdates, providerUpdatesLive } from "./provider-updates"
import { stopAllWorktreeSetups } from "./workspace-scripts"
import { stopDictation } from "./dictation"

export const createHostRuntime = (platform: typeof HostPlatform.Service) =>
  ManagedRuntime.make(
    providerUpdatesLive.pipe(
      Layer.provideMerge(
        Layer.mergeAll(codexProviderLive, claudeProviderLive, cursorProviderLive, piProviderLive),
      ),
      Layer.provideMerge(Layer.merge(CoreClient.layer, HostEvents.layer)),
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
  | PiProvider
  | ProviderUpdates
export const stopHost = Effect.gen(function* () {
  const core = yield* CoreClient
  yield* stopAllWorktreeSetups.pipe(Effect.catch(Effect.logError))
  stopDictation()
  const turns = yield* core
    .BeginShutdown()
    .pipe(Effect.catch((cause) => Effect.as(Effect.logError(cause), [])))
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
          ).pipe(Effect.catch(Effect.logError))
        : Effect.void,
    { discard: true },
  )
  const providers = [
    yield* CodexProvider,
    yield* ClaudeProvider,
    yield* CursorProvider,
    yield* PiProvider,
  ]
  yield* Effect.all(
    providers.map((provider) => provider.shutdown),
    { concurrency: providers.length },
  )
  yield* core.FinishShutdown().pipe(Effect.catch(Effect.logError))
})
