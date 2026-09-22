import { logStartupTiming } from "./startup-timing"
import { RpcClient } from "@effect/rpc"
import { RpcClientError } from "@effect/rpc/RpcClientError"
import type { FromServerEncoded } from "@effect/rpc/RpcMessage"
import { CoreRpcs } from "@meldshell/contracts"
import { HostPlatform } from "./platform"
import { Deferred, Effect, Layer, Runtime } from "effect"

const protocolError = (message: string, cause?: unknown): RpcClientError =>
  new RpcClientError({ reason: "Protocol", message, cause })

const makeHostProtocol = RpcClient.Protocol.make((writeResponse) =>
  Effect.gen(function* () {
    const platform = yield* HostPlatform
    const runtime = yield* Effect.runtime<never>()
    const runFork = Runtime.runFork(runtime)
    const ready = yield* Deferred.make<void, RpcClientError>()
    const child = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const child = platform.fork("core-worker.js", "MeldShell Core", {
            MELDSHELL_DATABASE_PATH: platform.databasePath,
          })
          child.stdout?.pipe(process.stdout)
          child.stderr?.pipe(process.stderr)
          return child
        },
        catch: (cause) => protocolError("MeldShell core could not start.", cause),
      }),
      (process) => Effect.sync(() => process.kill()),
    )

    let didBecomeReady = false
    const onMessage = (message: unknown): void => {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "ready"
      ) {
        if (!didBecomeReady) logStartupTiming("core ready")
        didBecomeReady = true
        runFork(Deferred.succeed(ready, undefined))
        return
      }
      runFork(writeResponse(message as FromServerEncoded))
    }
    const onExit = (code: number): void => {
      const error = protocolError(`MeldShell core exited with code ${code}.`)
      platform.onCoreExit?.()
      if (!didBecomeReady) runFork(Deferred.fail(ready, error))
      runFork(writeResponse({ _tag: "ClientProtocolError", error }))
    }

    child.on("message", onMessage)
    child.once("exit", onExit)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        child.off("message", onMessage)
        child.off("exit", onExit)
      }),
    )
    yield* Deferred.await(ready)

    return {
      send: (request: unknown) =>
        Effect.try({
          try: () => child.postMessage(request),
          catch: (cause) => protocolError("Could not send a request to MeldShell core.", cause),
        }),
      supportsAck: false,
      supportsTransferables: false,
    }
  }),
)

const HostProtocolLive = Layer.scoped(RpcClient.Protocol, makeHostProtocol)

export class CoreClient extends Effect.Service<CoreClient>()("MeldShell/CoreClient", {
  scoped: RpcClient.make(CoreRpcs),
  dependencies: [HostProtocolLive],
}) {}
