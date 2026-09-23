import { RpcServer } from "@effect/rpc"
import type { FromServerEncoded } from "@effect/rpc/RpcMessage"
import { Deferred, Effect, Mailbox, Option, Schema } from "effect"
import {
  AppSnapshot,
  IPC,
  RemoteRpcs,
  RemoteRpcRequest,
  decodeCommand,
  remoteRpcId,
  type RemoteResult,
} from "@meldshell/contracts"

/** A bounded, one-request server scope: relay routing stays outside Effect RPC. */
export async function executeRemoteRpc(
  raw: unknown,
  execute: (command: unknown) => Promise<RemoteResult>,
): Promise<RemoteResult> {
  const command = decodeCommand(raw)
  try {
    const request = Schema.decodeUnknownSync(RemoteRpcRequest)(command.args[0])
    if (command.id !== remoteRpcId(request.id)) throw new Error("Invalid RPC correlation")
    const value = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const response = yield* Deferred.make<FromServerEncoded>()
          const disconnects = yield* Mailbox.make<number>()
          const protocol = yield* RpcServer.Protocol.make((write) =>
            Effect.gen(function* () {
              yield* write(0, {
                ...request,
                headers: request.headers.map(([key, value]) => [key, value]),
              })
              return {
                disconnects,
                send: (_clientId: number, value: FromServerEncoded) =>
                  Deferred.succeed(response, value).pipe(Effect.asVoid),
                end: () => Effect.void,
                clientIds: Effect.succeed(new Set([0])),
                initialMessage: Effect.succeed(Option.none()),
                supportsAck: false,
                supportsTransferables: false,
                supportsSpanPropagation: false,
              }
            }),
          )
          yield* RpcServer.make(RemoteRpcs).pipe(
            Effect.provideService(RpcServer.Protocol, protocol),
            Effect.provide(
              RemoteRpcs.toLayer({
                GetSnapshot: () =>
                  Effect.tryPromise({
                    try: async () => {
                      const result = await execute({
                        v: 1,
                        id: command.id,
                        method: IPC.getSnapshot,
                        args: [],
                      })
                      if (!result.ok) throw new Error(result.error)
                      return Schema.decodeUnknownSync(AppSnapshot)(result.value)
                    },
                    catch: (error) => String(error),
                  }),
              }),
            ),
            Effect.forkScoped,
          )
          return yield* Deferred.await(response)
        }),
      ),
    )
    return { type: "result", id: command.id, ok: true, value }
  } catch (error) {
    return { type: "result", id: command.id, ok: false, error: String(error) }
  }
}
