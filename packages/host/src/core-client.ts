import { logStartupTiming } from "./startup-timing"
import { RpcClient } from "effect/rpc"
import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError"
import type { FromServerEncoded } from "effect/rpc/RpcMessage"
import { asRecord, CoreRpcs } from "@meldshell/contracts"
import { HostPlatform } from "./platform"
import { FiberSet, Schema, Context, Deferred, Effect, Layer } from "effect"

const protocolError = (message: string, cause?: unknown): RpcClientError =>
  new RpcClientError({ reason: new RpcClientDefect({ message, cause }) })

const makeHostProtocol = RpcClient.Protocol.make((writeResponse) =>
  Effect.gen(function* () {
    const platform = yield* HostPlatform
    const runFork = yield* FiberSet.makeRuntime<never>()
    const ready = yield* Deferred.make<void, RpcClientError>()
    const { child } = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const child = platform.fork("core-worker.js", "MeldShell Core", {
            MELDSHELL_DATABASE_PATH: platform.databasePath,
          })
          const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
          child.stdout?.pipe(process.stdout)
          child.stderr?.pipe(process.stderr)
          return { child, exited }
        },
        catch: (cause) => protocolError("MeldShell core could not start.", cause),
      }),
      // Windows keeps the database file locked until the core process is gone, so close waits for
      // exit. The deadline keeps shutdown bounded if the exit event never arrives.
      ({ child, exited }) =>
        Effect.promise(() => {
          child.kill()
          return Promise.race([
            exited,
            new Promise<void>((resolve) => setTimeout(resolve, 5_000).unref()),
          ])
        }),
    )

    // One RPC client owns this worker. Capture its ID before sending: v4 starts the
    // receive fiber lazily, so an immediate reply must be buffered for that ID.
    let clientId = 0
    let didBecomeReady = false
    const onMessage = (message: unknown): void => {
      if (asRecord(message).type === "ready") {
        if (!didBecomeReady) logStartupTiming("core ready")
        didBecomeReady = true
        runFork(Deferred.succeed(ready, undefined))
        return
      }
      runFork(writeResponse(clientId, message as FromServerEncoded))
    }
    const onExit = (code: number): void => {
      const error = protocolError(`MeldShell core exited with code ${code}.`)
      platform.onCoreExit?.()
      if (!didBecomeReady) runFork(Deferred.fail(ready, error))
      runFork(writeResponse(clientId, { _tag: "ClientProtocolError", error }))
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
      send: (id: number, request: unknown) =>
        Effect.try({
          try: () => {
            clientId = id
            child.postMessage(request)
          },
          catch: (cause) => protocolError("Could not send a request to MeldShell core.", cause),
        }),
      supportsAck: false,
      supportsTransferables: false,
      codecFor: Schema.toCodecJson,
    }
  }),
)

const HostProtocolLive = Layer.effect(RpcClient.Protocol, makeHostProtocol)

export class CoreClient extends Context.Service<CoreClient>()("MeldShell/CoreClient", {
  make: RpcClient.make(CoreRpcs),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(HostProtocolLive))
}
