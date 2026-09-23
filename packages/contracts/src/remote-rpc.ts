import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"
import { AppSnapshot } from "./models"

/** Read-only pilot inside the authenticated v1 relay envelope. */
export const REMOTE_RPC_METHOD = "meldshell:rpc-snapshot"
export class RemoteRpcs extends RpcGroup.make(
  Rpc.make("GetSnapshot", { success: AppSnapshot, error: Schema.String }),
) {}
export const RemoteRpcRequest = Schema.Struct({
  _tag: Schema.Literal("Request"),
  id: Schema.String.pipe(Schema.pattern(/^\d{1,40}$/)),
  tag: Schema.Literal("GetSnapshot"),
  payload: Schema.Unknown,
  headers: Schema.Array(Schema.Tuple(Schema.String, Schema.String)),
})
export const remoteRpcId = (id: string) => `rpc_${id.padStart(16, "0")}`
