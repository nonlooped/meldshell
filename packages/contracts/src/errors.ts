import { Schema } from "effect"

export class TurnSubmissionError extends Schema.TaggedError<TurnSubmissionError>(
  "TurnSubmissionError",
)("TurnSubmissionError", {
  reason: Schema.Literal("empty"),
  message: Schema.String,
}) {}

export class ProviderConfigurationError extends Schema.TaggedError<ProviderConfigurationError>(
  "ProviderConfigurationError",
)("ProviderConfigurationError", {
  threadId: Schema.String,
  message: Schema.String,
}) {}

export class CoreProtocolError extends Schema.TaggedError<CoreProtocolError>("CoreProtocolError")(
  "CoreProtocolError",
  { message: Schema.String },
) {}

export class CoreDatabaseError extends Schema.TaggedError<CoreDatabaseError>("CoreDatabaseError")(
  "CoreDatabaseError",
  { message: Schema.String },
) {}

export class CoreUnexpectedError extends Schema.TaggedError<CoreUnexpectedError>(
  "CoreUnexpectedError",
)("CoreUnexpectedError", { message: Schema.String }) {}

export const CoreError = Schema.Union(
  TurnSubmissionError,
  ProviderConfigurationError,
  CoreProtocolError,
  CoreDatabaseError,
  CoreUnexpectedError,
)

export type CoreError = typeof CoreError.Type
