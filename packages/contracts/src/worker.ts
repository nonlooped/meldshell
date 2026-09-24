import { Schema } from "effect"
import { ApprovalDecision, TitleRequest, TurnDispatch } from "./models"

export const WorkerCommand = Schema.Union(
  Schema.Struct({ type: Schema.Literal("start-turn"), dispatch: TurnDispatch }),
  Schema.Struct({ type: Schema.Literal("generate-title"), request: TitleRequest }),
  Schema.Struct({
    type: Schema.Literal("interrupt-turn"),
    nativeThreadId: Schema.String,
    nativeTurnId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("resolve-approval"),
    requestId: Schema.Union(Schema.String, Schema.Number),
    decision: ApprovalDecision,
    optionId: Schema.optional(Schema.String),
    answers: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }),
    ),
  }),
  Schema.Struct({ type: Schema.Literal("shutdown") }),
  Schema.Struct({ type: Schema.Literal("get-usage"), requestId: Schema.String }),
  Schema.Struct({ type: Schema.Literal("cancel-usage"), requestId: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("list-commands"),
    requestId: Schema.String,
    workspacePath: Schema.String,
  }),
)
export type WorkerCommand = typeof WorkerCommand.Type
export type ProviderWorkerInput = WorkerCommand | "probe-now"
