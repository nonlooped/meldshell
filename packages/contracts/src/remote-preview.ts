import { Schema } from "effect"

export const RemotePreviewInput = Schema.Struct({
  id: Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-zA-Z0-9_-]{16,100}$/))),
  action: Schema.Literals([
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
  ]),
  url: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(8192)))),
  width: Schema.optional(
    Schema.Number.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 320, maximum: 1920 })),
    ),
  ),
  height: Schema.optional(
    Schema.Number.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 240, maximum: 1080 })),
    ),
  ),
  x: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1920 }))),
  ),
  y: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1080 }))),
  ),
  deltaX: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -10000, maximum: 10000 }))),
  ),
  deltaY: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: -10000, maximum: 10000 }))),
  ),
  button: Schema.optional(Schema.Literals(["left", "middle", "right"])),
  key: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(64)))),
  text: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(65536)))),
  modifiers: Schema.optional(
    Schema.Array(Schema.Literals(["shift", "control", "alt", "meta"])).pipe(
      Schema.check(Schema.isMaxLength(4)),
    ),
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
