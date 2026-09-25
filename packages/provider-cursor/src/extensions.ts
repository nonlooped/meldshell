import { RequestError } from "@agentclientprotocol/sdk"
import { CursorQuestion as Question } from "@meldshell/contracts"
import { Either, Schema } from "effect"

const CursorQuestion = Schema.Struct(
  {
    toolCallId: Schema.String,
    questions: Schema.Array(Question).pipe(Schema.minItems(1)),
  },
  Schema.Record({ key: Schema.String, value: Schema.Unknown }),
)
export type CursorQuestion = typeof CursorQuestion.Type

const CursorPlan = Schema.Struct(
  {
    toolCallId: Schema.String,
    plan: Schema.String,
    todos: Schema.Array(Schema.Unknown),
  },
  Schema.Record({ key: Schema.String, value: Schema.Unknown }),
)
export type CursorPlan = typeof CursorPlan.Type

const parse = <A, I>(schema: Schema.Schema<A, I>, value: unknown): A => {
  const decoded = Schema.decodeUnknownEither(schema, { onExcessProperty: "preserve" })(value)
  if (Either.isLeft(decoded)) throw RequestError.invalidParams(undefined, decoded.left.message)
  return decoded.right
}
export const parseCursorQuestion = (value: unknown): CursorQuestion => parse(CursorQuestion, value)
export const parseCursorPlan = (value: unknown): CursorPlan => parse(CursorPlan, value)
