import { Schema } from "effect"

export const RemotePreviewInput = Schema.Struct({
  id: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{16,100}$/)),
  action: Schema.Literal(
    "navigate",
    "capture",
    "back",
    "forward",
    "reload",
    "close",
    "mouseDown",
    "mouseUp",
    "mouseMove",
    "mouseWheel",
    "keyDown",
    "keyUp",
    "text",
  ),
  url: Schema.optional(Schema.String.pipe(Schema.maxLength(8192))),
  width: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.between(320, 1920))),
  height: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.between(240, 1080))),
  x: Schema.optional(Schema.Number.pipe(Schema.between(0, 1920))),
  y: Schema.optional(Schema.Number.pipe(Schema.between(0, 1080))),
  deltaX: Schema.optional(Schema.Number.pipe(Schema.between(-10000, 10000))),
  deltaY: Schema.optional(Schema.Number.pipe(Schema.between(-10000, 10000))),
  button: Schema.optional(Schema.Literal("left", "middle", "right")),
  key: Schema.optional(Schema.String.pipe(Schema.maxLength(64))),
  text: Schema.optional(Schema.String.pipe(Schema.maxLength(65536))),
  modifiers: Schema.optional(
    Schema.Array(Schema.Literal("shift", "control", "alt", "meta")).pipe(Schema.maxItems(4)),
  ),
})
export type RemotePreviewInput = typeof RemotePreviewInput.Type
export interface RemotePreviewFrame {
  readonly image: string
  readonly url: string
  readonly title: string
  readonly width: number
  readonly height: number
  readonly back: boolean
  readonly forward: boolean
  readonly error: string | null
}
