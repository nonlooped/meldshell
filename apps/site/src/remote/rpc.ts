import { RpcClient } from "@effect/rpc"
import { RpcClientError } from "@effect/rpc/RpcClientError"
import type { FromServerEncoded } from "@effect/rpc/RpcMessage"
import { Effect, Layer, ManagedRuntime } from "effect"
import { RemoteRpcs, REMOTE_RPC_METHOD, remoteRpcId, type RemoteResult } from "@meldshell/contracts"

export function snapshotRpc(send: (text: string) => boolean) {
  let receive: (value: FromServerEncoded) => void = () => undefined
  const error = (message: string) => new RpcClientError({ reason: "Protocol", message })
  const protocol = Layer.scoped(
    RpcClient.Protocol,
    RpcClient.Protocol.make((write) =>
      Effect.sync(() => {
        receive = (value) => {
          Effect.runFork(write(value))
        }
        return {
          send: (request) =>
            Effect.try({
              try: () => {
                if (request._tag !== "Request") return
                if (
                  !send(
                    JSON.stringify({
                      v: 1,
                      id: remoteRpcId(request.id),
                      method: REMOTE_RPC_METHOD,
                      args: [request],
                    }),
                  )
                )
                  throw error("Not connected to this computer. Nothing was sent.")
              },
              catch: (cause) => (cause instanceof RpcClientError ? cause : error(String(cause))),
            }),
          supportsAck: false,
          supportsTransferables: false,
        }
      }),
    ),
  )
  class Client extends Effect.Service<Client>()("RemoteSnapshotClient", {
    scoped: RpcClient.make(RemoteRpcs),
    dependencies: [protocol],
  }) {}
  const runtime = ManagedRuntime.make(Client.Default)
  return {
    getSnapshot: () => runtime.runPromise(Effect.flatMap(Client, (client) => client.GetSnapshot())),
    receive: (frame: RemoteResult) => {
      if (frame.ok) receive(frame.value as FromServerEncoded)
      else
        receive({ _tag: "ClientProtocolError", error: error(frame.error ?? "Remote RPC failed") })
    },
    disconnect: () =>
      receive({
        _tag: "ClientProtocolError",
        error: error("The connection dropped before this was confirmed. Check the conversation."),
      }),
    dispose: () => runtime.dispose(),
  }
}
