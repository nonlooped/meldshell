import { Schema } from "effect"
import {
  ApprovalDecision,
  CodexUsage,
  ComposerCommand,
  ProviderModelCatalogEntry,
  ProviderStatus,
  RuntimeEventInput,
  TitleRequest,
  TurnDispatch,
} from "./models"

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

const Pid = Schema.Number.pipe(Schema.int(), Schema.positive())

/** A worker's answer to `get-usage`: the usage, or why it could not be read. */
export const UsageResult = Schema.Struct({
  type: Schema.Literal("usage-result"),
  requestId: Schema.String,
  usage: Schema.optional(CodexUsage),
  error: Schema.optional(Schema.String),
})

/** A worker's answer to `list-commands`. */
export const CommandsResult = Schema.Struct({
  type: Schema.Literal("commands-result"),
  requestId: Schema.String,
  commands: Schema.optional(Schema.Array(ComposerCommand)),
  error: Schema.optional(Schema.String),
})

/**
 * Everything a provider worker reports to the host. Runtime events carry the harness's native
 * payload untouched; the host and core project it later.
 */
export const WorkerEvent = Schema.Union(
  /** Settles one command; `error` explains a command the worker refused or could not deliver. */
  Schema.Struct({
    type: Schema.Literal("command-ack"),
    commandId: Schema.String,
    error: Schema.optional(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("provider-status"), status: ProviderStatus }),
  /** The harness is usable, with the models it offers. */
  Schema.Struct({
    type: Schema.Literal("provider-ready"),
    status: ProviderStatus,
    providerKey: Schema.String,
    models: Schema.Array(ProviderModelCatalogEntry),
    /** Workspace-scoped catalogs add models without removing other workspaces' entries. */
    partial: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({ type: Schema.Literal("runtime-event"), input: RuntimeEventInput }),
  Schema.Struct({
    type: Schema.Literal("provider-session"),
    threadId: Schema.String,
    nativeThreadId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("turn-start-failed"),
    threadId: Schema.String,
    turnId: Schema.String,
    message: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("thread-title"),
    threadId: Schema.String,
    title: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("title-failed"),
    threadId: Schema.String,
    message: Schema.String,
  }),
  UsageResult,
  CommandsResult,
  /** A harness process the worker started; the host stops it if the worker dies first. */
  Schema.Struct({ type: Schema.Literal("process-started"), pid: Pid }),
  Schema.Struct({ type: Schema.Literal("process-stopped"), pid: Pid }),
  Schema.Struct({
    type: Schema.Literal("protocol-error"),
    message: Schema.String,
    raw: Schema.optional(Schema.Unknown),
  }),
)

export type WorkerEvent = typeof WorkerEvent.Type
