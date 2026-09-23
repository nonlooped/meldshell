import { Schema } from "effect"

const REMOTE_VERSION = 1
export const MAX_FRAME_BYTES = 8 * 1024 * 1024
export const MAX_BUFFER_BYTES = 16 * 1024 * 1024
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
