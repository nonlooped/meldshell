import { SqlSchema } from "@effect/sql"
import { Effect, Either, ParseResult, Schema } from "effect"
import {
  CursorQuestion,
  ApprovalPolicy,
  ApprovalRequest,
  CanonicalEvent,
  CanonicalEventKind,
  CollaborationMode,
  Provider,
  ProviderModel,
  ProviderModelCatalogEntry,
  ReasoningEffort,
  SandboxMode,
  Thread,
  ThreadSettings,
  ThreadWorktree,
  Workspace,
} from "@meldshell/contracts"

const Text = Schema.String
const NullableText = Schema.NullOr(Text)
const Flag = Schema.Literal(0, 1)
const Metadata = Schema.partial(ProviderModelCatalogEntry)

const WorkspaceRow = Schema.Struct({
  id: Text,
  path: Text,
  name: Text,
  created_at: Text,
  last_opened_at: Text,
})
type WorkspaceRow = typeof WorkspaceRow.Type

export const WorktreeColumns = Schema.Struct({
  worktree_path: NullableText,
  worktree_branch: NullableText,
  worktree_base: NullableText,
  worktree_state: Schema.NullOr(ThreadWorktree.fields.state),
  worktree_setup: Schema.NullOr(Schema.Literal("running", "succeeded", "failed", "interrupted")),
})
export const ThreadRow = Schema.Struct({
  ...WorktreeColumns.fields,
  id: Text,
  workspace_id: Text,
  title: Text,
  pinned: Flag,
  status: Thread.fields.status,
  created_at: Text,
  updated_at: Text,
  activity: Thread.fields.activity,
  queued_count: Schema.Number,
  turn_count: Schema.Number,
})
export type ThreadRow = typeof ThreadRow.Type

const EventRow = Schema.Struct({
  id: Text,
  thread_id: Text,
  turn_id: NullableText,
  sequence: Schema.Number,
  kind: CanonicalEventKind,
  method: Text,
  text: NullableText,
  provider_data: Text,
  created_at: Text,
})
type EventRow = typeof EventRow.Type

const ApprovalParams = Schema.Record({ key: Schema.String, value: Schema.Unknown })
export const ApprovalRow = Schema.Struct({
  id: Text,
  thread_id: Text,
  turn_id: Text,
  request_data: Schema.parseJson(ApprovalParams),
  request_id: Text,
  method: Text,
  title: Text,
  detail: Text,
  created_at: Text,
})
export type ApprovalRow = typeof ApprovalRow.Type

export const ProviderRow = Schema.Struct({
  id: Text,
  key: Text,
  harness: Text,
  display_name: Text,
  enabled: Flag,
  sort_order: Schema.Number,
  built_in: Flag,
})
export type ProviderRow = typeof ProviderRow.Type

export const ProviderModelRow = Schema.Struct({
  id: Text,
  provider_id: Text,
  slug: Text,
  display_name: Text,
  reasoning_efforts: Schema.parseJson(Schema.Array(ReasoningEffort)),
  metadata: Schema.parseJson(Metadata),
  supports_fast: Flag,
  enabled: Flag,
  hidden: Flag,
  sort_order: Schema.Number,
  built_in: Flag,
})
export type ProviderModelRow = typeof ProviderModelRow.Type

export const ThreadSettingsRow = Schema.Struct({
  thread_id: Text,
  provider_id: Text,
  model_id: NullableText,
  reasoning_effort: NullableText,
  speed: ThreadSettings.fields.speed,
  mode: CollaborationMode,
  sandbox: SandboxMode,
  approval_policy: ApprovalPolicy,
})
export type ThreadSettingsRow = typeof ThreadSettingsRow.Type

/** SQL results enter the application through a schema, including their column names and JSON. */
export const readRows = <A, I, E, R>(
  Result: Schema.Schema<A, I>,
  query: Effect.Effect<ReadonlyArray<unknown>, E, R>,
) => SqlSchema.findAll({ Request: Schema.Void, Result, execute: () => query })(undefined)

/** Read-only database projection; writes have separate input contracts. */
const project = <A, I, B>(
  row: Schema.Schema<A, I>,
  result: Schema.Schema<B>,
  decode: (value: A) => unknown | Effect.Effect<unknown, ParseResult.ParseError>,
) =>
  Schema.transformOrFail(row, result, {
    strict: false,
    decode: (value) => {
      const decoded = decode(value)
      return Effect.isEffect(decoded)
        ? (decoded as Effect.Effect<unknown, ParseResult.ParseError>).pipe(
            Effect.mapError((error) => error.issue),
          )
        : ParseResult.succeed(decoded)
    },
    encode: (value, _options, ast) =>
      ParseResult.fail(new ParseResult.Forbidden(ast, value, "Use the write API")),
  })

/** A column list for SQL, each column prefixed with the table alias when one is given. */
const columnList =
  (names: ReadonlyArray<string>) =>
  (alias?: string): string =>
    names.map((name) => (alias === undefined ? name : `${alias}.${name}`)).join(", ")

export const providerColumns = columnList([
  "id",
  "key",
  "harness",
  "display_name",
  "enabled",
  "sort_order",
  "built_in",
] satisfies ReadonlyArray<keyof ProviderRow>)

export const modelColumns = columnList([
  "id",
  "provider_id",
  "slug",
  "display_name",
  "reasoning_efforts",
  "metadata",
  "supports_fast",
  "enabled",
  "hidden",
  "sort_order",
  "built_in",
] satisfies ReadonlyArray<keyof ProviderModelRow>)

export const threadSettingsColumns = columnList([
  "thread_id",
  "provider_id",
  "model_id",
  "reasoning_effort",
  "speed",
  "mode",
  "sandbox",
  "approval_policy",
] satisfies ReadonlyArray<keyof ThreadSettingsRow>)

export const threadColumns = columnList([
  "id",
  "workspace_id",
  "title",
  "status",
  "pinned",
  "created_at",
  "updated_at",
  "worktree_path",
  "worktree_branch",
  "worktree_base",
  "worktree_state",
  "worktree_setup",
] satisfies ReadonlyArray<keyof ThreadRow>)

const fromWorkspaceRow = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  path: row.path,
  name: row.name,
  createdAt: row.created_at,
  lastOpenedAt: row.last_opened_at,
})

export const fromThreadRow = (row: ThreadRow): Thread => {
  const worktree = fromWorktreeColumns(row)
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    status: row.status,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activity: row.activity,
    queuedCount: Number(row.queued_count),
    turnCount: Number(row.turn_count),
    ...(worktree === null ? {} : { worktree }),
  }
}

type WorktreeColumns = typeof WorktreeColumns.Type

export const fromWorktreeColumns = (row: WorktreeColumns): ThreadWorktree | null =>
  row.worktree_path === null
    ? null
    : {
        path: row.worktree_path,
        branch: row.worktree_branch ?? "",
        baseBranch: row.worktree_base,
        state: row.worktree_state ?? "ready",
        ...(row.worktree_setup === null ? {} : { setup: row.worktree_setup }),
      }

const parseProviderData = (value: string): unknown => {
  const decoded = Schema.decodeUnknownEither(Schema.parseJson())(value)
  // Legacy events may contain plain text. Keep it as the native payload.
  return Either.isRight(decoded) ? decoded.right : value
}

const fromEventRow = (row: EventRow): CanonicalEvent => ({
  id: row.id,
  threadId: row.thread_id,
  turnId: row.turn_id,
  sequence: row.sequence,
  kind: row.kind,
  method: row.method,
  text: row.text,
  payload: parseProviderData(row.provider_data),
  createdAt: row.created_at,
})

const fromApprovalRow = (row: ApprovalRow) =>
  Effect.gen(function* () {
    const params = row.request_data
    const fields = {
      approvalScope: params.approvalScope === "turn" ? ("turn" as const) : ("session" as const),
      id: row.id,
      threadId: row.thread_id,
      turnId: row.turn_id,
      requestId: row.request_id,
      title: row.title,
      detail: row.detail,
      createdAt: row.created_at,
    }
    switch (row.method) {
      case "cursor/acp/session/request_permission":
        return {
          ...fields,
          kind: "cursor-permission",
          method: row.method,
          params,
          options: params.options,
        }
      case "cursor/create_plan":
      case "claude/exit_plan_mode":
        return {
          ...fields,
          kind: "plan",
          method: row.method,
          params,
          plan: params.plan ?? "",
        }
      case "cursor/ask_question":
        return {
          ...fields,
          kind: "user-input",
          method: row.method,
          questions: (yield* Schema.decodeUnknown(Schema.Array(CursorQuestion))(
            params.questions,
          )).map((question) => ({
            id: question.id,
            header: question.prompt,
            question: question.prompt,
            multiSelect: question.allowMultiple ?? false,
            isOther: false,
            options: question.options.map((option) => ({
              label: option.label,
              value: option.id,
              description: "",
            })),
          })),
        }
      case "item/tool/requestUserInput":
        return {
          ...fields,
          kind: "user-input",
          method: row.method,
          questions: params.questions,
        }
      case "item/permissions/requestApproval":
        return {
          ...fields,
          kind: "permissions",
          method: row.method,
          permissions: params.permissions,
        }
      case "item/fileChange/requestApproval":
        return { ...fields, kind: "file-change", method: row.method, params }
      default:
        return {
          ...fields,
          kind: "command",
          method: "item/commandExecution/requestApproval",
          params,
        }
    }
  })

const fromProviderRow = (row: ProviderRow): Provider => ({
  id: row.id,
  key: row.key,
  harness: row.harness,
  displayName: row.display_name,
  enabled: row.enabled === 1,
  sortOrder: row.sort_order,
  builtIn: row.built_in === 1,
})

export const fromProviderModelRow = (row: ProviderModelRow): ProviderModel => {
  const metadata = row.metadata
  const serviceTiers = metadata.serviceTiers ?? []
  const additionalSpeedTiers = metadata.additionalSpeedTiers ?? []
  const inputModalities = metadata.inputModalities ?? ["text", "image"]
  return {
    id: row.id,
    providerId: row.provider_id,
    slug: row.slug,
    catalogId: metadata.catalogId ?? row.slug,
    displayName: row.display_name,
    description: metadata.description ?? "",
    reasoningEfforts: row.reasoning_efforts.filter((effort) => effort.trim() !== ""),
    defaultReasoningEffort: metadata.defaultReasoningEffort ?? null,
    serviceTiers,
    defaultServiceTier: metadata.defaultServiceTier ?? null,
    additionalSpeedTiers,
    fastServiceTier: metadata.fastServiceTier ?? (row.supports_fast === 1 ? "fast" : null),
    inputModalities,
    supportsPersonality: metadata.supportsPersonality ?? false,
    isDefault: metadata.isDefault ?? false,
    upgrade: metadata.upgrade ?? null,
    modelSpecialty: metadata.modelSpecialty ?? null,
    multiAgentVersion: metadata.multiAgentVersion ?? null,
    supportsFast: row.supports_fast === 1,
    enabled: row.enabled === 1,
    hidden: row.hidden === 1,
    sortOrder: row.sort_order,
    builtIn: row.built_in === 1,
  }
}

const fromThreadSettingsRow = (row: ThreadSettingsRow): ThreadSettings => ({
  threadId: row.thread_id,
  providerId: row.provider_id,
  modelId: row.model_id,
  reasoningEffort: row.reasoning_effort,
  speed: row.speed,
  mode: row.mode,
  sandbox: row.sandbox,
  approvalPolicy: row.approval_policy,
})

export const WorkspaceFromRow = project(WorkspaceRow, Workspace, fromWorkspaceRow)
export const ThreadFromRow = project(ThreadRow, Thread, fromThreadRow)
export const EventFromRow = project(EventRow, CanonicalEvent, fromEventRow)
export const ApprovalFromRow = project(ApprovalRow, ApprovalRequest, fromApprovalRow)
export const ProviderFromRow = project(ProviderRow, Provider, fromProviderRow)
export const ModelFromRow = project(ProviderModelRow, ProviderModel, fromProviderModelRow)
export const ThreadSettingsFromRow = project(
  ThreadSettingsRow,
  ThreadSettings,
  fromThreadSettingsRow,
)
