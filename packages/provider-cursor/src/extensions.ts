import { RequestError } from "@agentclientprotocol/sdk"
import { CursorQuestion as Question } from "@meldshell/contracts"
import { Result, Schema } from "effect"

const CursorQuestion = Schema.StructWithRest(
  Schema.Struct({
    toolCallId: Schema.String,
    questions: Schema.Array(Question).pipe(Schema.check(Schema.isMinLength(1))),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)
export type CursorQuestion = typeof CursorQuestion.Type

const CursorPlan = Schema.StructWithRest(
  Schema.Struct({
    toolCallId: Schema.String,
    plan: Schema.String,
    todos: Schema.Array(Schema.Unknown),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)
export type CursorPlan = typeof CursorPlan.Type

const parse = <A, I>(schema: Schema.Codec<A, I>, value: unknown): A => {
  const decoded = Schema.decodeUnknownResult(schema)(value)
  if (Result.isFailure(decoded))
    throw RequestError.invalidParams(undefined, decoded.failure.message)
  return decoded.success
}
export const parseCursorQuestion = (value: unknown): CursorQuestion => parse(CursorQuestion, value)
export const parseCursorPlan = (value: unknown): CursorPlan => parse(CursorPlan, value)
