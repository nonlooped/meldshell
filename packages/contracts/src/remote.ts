import { Schema } from "effect"

const REMOTE_VERSION = 1
export const MAX_FRAME_BYTES = 8 * 1024 * 1024
export const MAX_BUFFER_BYTES = 16 * 1024 * 1024
/**
 * Hosts and browsers send this text frame every interval; the relay answers with the pong without
 * waking, so idle connections stay free. A connection that hears nothing for the timeout is dead.
 */
export const HEARTBEAT_PING = "ping"
export const HEARTBEAT_PONG = "pong"
export const HEARTBEAT_INTERVAL_MS = 15_000
export const HEARTBEAT_TIMEOUT_MS = 45_000
const RemoteCommand = Schema.Struct({
  v: Schema.Literal(REMOTE_VERSION),
  id: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{16,80}$/)),
  method: Schema.String.pipe(Schema.maxLength(80)),
  args: Schema.Array(Schema.Unknown).pipe(Schema.maxItems(2)),
})
export type RemoteResult = {
  type: "result"
  id: string
  ok: boolean
  value?: unknown
  error?: string
}
export type RemoteEvent = { type: "event"; channel: string; args: readonly unknown[] }
export const decodeCommand = Schema.decodeUnknownSync(RemoteCommand)
