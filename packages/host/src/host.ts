import { Effect, Stream, Fiber } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents, eventFrames } from "./events"
import { createHostApi } from "./api"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { reconcileWorktrees, scopePath } from "./thread-worktrees"
import { createHostRuntime, stopHost } from "./runtime"
import type { HostPlatform } from "./platform"
import { connectRelay } from "./remote-connection"
import { beginLink, readCredential, unlinkDevice } from "./identity"
import { readWorkspaceScripts, scriptEnvironment } from "./workspace-scripts"
import { scheduleLoop } from "./scheduler"

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
  runtime.runFork(
    reconcileWorktrees.pipe(
      Effect.flatMap((changed) =>
        changed
          ? Effect.flatMap(HostEvents, (events) =>
              events.publish({ _tag: "RuntimeChanged", threadId: "" }),
            )
          : Effect.void,
      ),
      Effect.catchAll(Effect.logError),
    ),
  )
  const schedulerFiber = runtime.runFork(scheduleLoop)
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
    /** Reconnects now instead of waiting out the relay's backoff. */
    retry: () => relay.sync(),
  }

  let closing: Promise<void> | undefined
  const close = () =>
    (closing ??= (async () => {
      relay.close()
      await Effect.runPromise(Fiber.interrupt(schedulerFiber))
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
    /** The folder a thread works in: its worktree when it has one, otherwise its workspace. */
    scopePath: (scope: WorkspaceScope) => runtime.runPromise(scopePath(scope)),
    /**
     * Where a thread's terminal starts, the script variables it receives, and, when `run` names
     * one, the workspace run script it should start.
     */
    terminalContext: async (
      scope: { workspaceId: string; threadId: string },
      run: string | undefined,
    ) => {
      const cwd = await runtime.runPromise(scopePath(scope))
      const location = await core((client) =>
        client.GetThreadLocation({ threadId: scope.threadId }),
      )
      const env = await scriptEnvironment(location)
      if (run === undefined) return { cwd, env, run: null }
      const script = (await readWorkspaceScripts(location.workspacePath)).run.find(
        (entry) => entry.name === run,
      )
      if (script === undefined)
        throw new Error(`meldshell.json no longer has a run script named "${run}".`)
      return { cwd, env, run: script }
    },
    remote,
    close,
  }
}
export type Host = Awaited<ReturnType<typeof startHost>>
