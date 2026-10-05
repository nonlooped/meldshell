import { Effect, Stream, Fiber } from "effect"
import { CoreClient } from "./core-client"
import { HostEvents, eventFrames } from "./events"
import { createHostApi } from "./api"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { reconcileWorktrees, scopePath } from "./thread-worktrees"
import { createHostRuntime, stopHost } from "./runtime"
import type { HostPlatform } from "./platform"
import { connectRelay } from "./remote-connection"
import { beginLink, LinkCancelled, unlinkDevice } from "./identity"
import { readWorkspaceScripts, scriptEnvironment } from "./workspace-scripts"
import { scheduleLoop } from "./scheduler"
import {
  errorMessage,
  decodeCommand,
  IPC,
  type RemoteLinking,
  type RemoteStatus,
} from "@meldshell/contracts"
import { remoteTerminals } from "./remote-terminals"
import { administrationBridge } from "./administration"
import { threadPort } from "./workspace-scripts"
import { cliResumeScript } from "./cli-sessions"

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
      Effect.catch(Effect.logError),
    ),
  )
  const schedulerFiber = runtime.runFork(scheduleLoop)
  const terminalContext = async (
    scope: { workspaceId: string; threadId: string },
    run: string | undefined,
    cli = false,
  ) => {
    const cwd = await runtime.runPromise(scopePath(scope))
    const location = await core((client) => client.GetThreadLocation({ threadId: scope.threadId }))
    const env = await scriptEnvironment(location)
    if (cli) return { cwd, env, run: await runtime.runPromise(cliResumeScript(scope.threadId)) }
    if (run === undefined) return { cwd, env, run: null }
    const script = (await readWorkspaceScripts(location.workspacePath)).run.find(
      (entry) => entry.name === run,
    )
    if (script === undefined)
      throw new Error(`meldshell.json no longer has a run script named "${run}".`)
    return { cwd, env, run: script }
  }

  const administration = administrationBridge(onEvent)
  const terminals = remoteTerminals({ terminalContext }, (frame) => relay.publish(frame))
  let linking: (RemoteLinking & { cancel: () => void }) | null = null
  let linkError: string | null = null
  const remoteStatus = (): RemoteStatus => {
    const state = relay.state()
    return {
      linked: state.credential !== null,
      desktop: platform.desktop === true,
      account: state.credential?.account ?? null,
      siteURL: state.credential?.siteURL ?? null,
      deviceName: state.credential?.deviceName ?? null,
      connection: state.connection,
      status: state.status,
      viewers: state.viewers,
      linking:
        linking === null
          ? null
          : { userCode: linking.userCode, verificationURL: linking.verificationURL },
      error: linkError,
    }
  }
  // The desktop renders this live; browsers are not told about each other.
  const announceRemote = () => onEvent(IPC.remoteStatusChanged, [remoteStatus()])
  const relay = connectRelay(
    directory,
    async (raw, clientId) => {
      try {
        const command = decodeCommand(raw)
        const value = await remoteCall(command.method, command.args, clientId)
        return { type: "result", id: command.id, ok: true, value }
      } catch (cause) {
        return {
          type: "result",
          id: String((raw as { id?: unknown })?.id ?? ""),
          ok: false,
          error: errorMessage(cause),
        }
      }
    },
    terminals.clients,
    announceRemote,
  )
  const desktopCall = (method: string, args: readonly unknown[]) => {
    if (platform.desktop) return administration.call(method, args)
    if (method === IPC.getDesktopEnvironment) return null
    if (method === IPC.getUpdateStatus)
      return {
        state: "unavailable",
        currentVersion: "",
        channel: "stable",
        availableVersion: null,
        progressPercent: null,
        message: "This standalone host is updated by its installation manager.",
      }
    throw new Error(
      "This host runs without a desktop installation. Manage its process through its service manager.",
    )
  }
  const remoteCall = async (
    method: string,
    args: readonly unknown[],
    clientId: string,
  ): Promise<unknown> => {
    if (terminals.handles(method)) return terminals.execute(method, args[0], clientId)
    if (method === IPC.getRemoteStatus) return remote.status()
    if (method === IPC.unlinkRemote) {
      setTimeout(() => {
        void remote.unlink().catch(console.error)
      }, 500)
      return null
    }
    if (method === IPC.retryRemote) {
      setTimeout(() => {
        void remote.retry().catch(console.error)
      }, 500)
      return null
    }
    if (method === IPC.threadPort && typeof args[0] === "string") return threadPort(args[0])
    if (administration.handles(method)) return desktopCall(method, args)
    return api.call(method, args)
  }
  // Batch bursts such as streamed deltas into one change per thread every 32 ms.
  const eventFiber = runtime.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        const events = yield* HostEvents
        yield* Stream.fromSubscription(yield* events.subscribe).pipe(
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

  const remote = {
    status: async () => remoteStatus(),
    link: async (url: string): Promise<RemoteLinking> => {
      if (linking) return { userCode: linking.userCode, verificationURL: linking.verificationURL }
      const pending = await beginLink(directory, url)
      const current = {
        userCode: pending.userCode,
        verificationURL: pending.verificationURL,
        cancel: pending.cancel,
      }
      linking = current
      linkError = null
      announceRemote()
      pending.complete
        .then(relay.sync, (cause: unknown) => {
          if (!(cause instanceof LinkCancelled)) linkError = errorMessage(cause)
        })
        .finally(() => {
          if (linking === current) linking = null
          announceRemote()
        })
      return { userCode: current.userCode, verificationURL: current.verificationURL }
    },
    /** Abandons a sign-in that is still waiting for the browser. */
    cancelLink: async () => {
      linking?.cancel()
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
      administration.close()
      await terminals.close()
      await Effect.runPromise(Fiber.interrupt(schedulerFiber))
      await Effect.runPromise(Fiber.interrupt(eventFiber))
      try {
        await runtime.runPromise(stopHost)
      } finally {
        await runtime.dispose()
      }
    })())
  onCoreExit = () => {
    void close()
      .catch((cause) => console.error("Host stopped after core failure", cause))
      .finally(() => platform.onCoreExit?.())
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
     * one, the workspace run script it should start. With `cli`, the shell instead continues the
     * thread's session in its harness's CLI.
     */
    terminalContext,
    administrationResult: administration.result,
    remote,
    close,
  }
}
export type Host = Awaited<ReturnType<typeof startHost>>
