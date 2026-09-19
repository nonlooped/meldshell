import {
  type ApprovalPolicy,
  type ApprovalRequest,
  type CanonicalEvent,
  type CanonicalEventKind,
  type CollaborationMode,
  type Provider,
  type ProviderModel,
  type ProviderModelCatalogEntry,
  type ReasoningEffort,
  type SandboxMode,
  type Thread,
  type ThreadSettings,
  type Workspace,
} from "@meldshell/contracts"

export interface WorkspaceRow {
  readonly id: string
  readonly path: string
  readonly name: string
  readonly created_at: string
  readonly last_opened_at: string
}

export interface ThreadRow {
  readonly id: string
  readonly workspace_id: string
  readonly title: string
  readonly pinned: number
  readonly status: "active" | "settled"
  readonly created_at: string
  readonly updated_at: string
  readonly activity: Thread["activity"]
  readonly queued_count: number
  readonly turn_count: number
}

export interface EventRow {
  readonly id: string
  readonly thread_id: string
  readonly turn_id: string | null
  readonly sequence: number
  readonly kind: CanonicalEventKind
  readonly method: string
  readonly text: string | null
  readonly provider_data: string
  readonly created_at: string
}

export interface ApprovalRow {
  readonly id: string
  readonly thread_id: string
  readonly turn_id: string
  readonly request_data: string
  readonly request_id: string
  readonly method: string
  readonly title: string
  readonly detail: string
  readonly created_at: string
}

export interface ProviderRow {
  readonly id: string
  readonly key: string
  readonly harness: string
  readonly display_name: string
  readonly enabled: number
  readonly sort_order: number
  readonly built_in: number
}

export interface ProviderModelRow {
  readonly id: string
  readonly provider_id: string
  readonly slug: string
  readonly display_name: string
  readonly reasoning_efforts: string
  readonly metadata: string
  readonly supports_fast: number
  readonly enabled: number
  readonly hidden: number
  readonly sort_order: number
  readonly built_in: number
}

export interface ThreadSettingsRow {
  readonly thread_id: string
  readonly provider_id: string
  readonly model_id: string | null
  readonly reasoning_effort: string | null
  readonly speed: "standard" | "fast"
  readonly mode: CollaborationMode
  readonly sandbox: SandboxMode
  readonly approval_policy: ApprovalPolicy
}

export const fromWorkspaceRow = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  path: row.path,
  name: row.name,
  createdAt: row.created_at,
  lastOpenedAt: row.last_opened_at,
})

export const fromThreadRow = (row: ThreadRow): Thread => ({
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
})

export const parseProviderData = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export const fromEventRow = (row: EventRow): CanonicalEvent => ({
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

export const fromApprovalRow = (row: ApprovalRow): ApprovalRequest => {
  const params = parseProviderData(row.request_data) as Record<string, unknown>
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
        options: params.options as Extract<
          ApprovalRequest,
          { kind: "cursor-permission" }
        >["options"],
      }
    case "cursor/create_plan":
      return {
        ...fields,
        kind: "cursor-plan",
        method: row.method,
        params,
        plan: String(params.plan ?? ""),
      }
    case "cursor/ask_question":
      return {
        ...fields,
        kind: "user-input",
        method: row.method,
        questions: (
          params.questions as Array<{
            id: string
            prompt: string
            allowMultiple?: boolean
            options: Array<{ id: string; label: string }>
          }>
        ).map((question) => ({
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
        questions: params.questions as Extract<
          ApprovalRequest,
          { kind: "user-input" }
        >["questions"],
      }
    case "item/permissions/requestApproval":
      return { ...fields, kind: "permissions", method: row.method, permissions: params.permissions }
    case "item/fileChange/requestApproval":
      return { ...fields, kind: "file-change", method: row.method, params }
    default:
      return { ...fields, kind: "command", method: "item/commandExecution/requestApproval", params }
  }
}

export const fromProviderRow = (row: ProviderRow): Provider => ({
  id: row.id,
  key: row.key,
  harness: row.harness,
  displayName: row.display_name,
  enabled: row.enabled === 1,
  sortOrder: row.sort_order,
  builtIn: row.built_in === 1,
})

const parseReasoningEfforts = (value: string): ReadonlyArray<ReasoningEffort> => {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is ReasoningEffort => typeof entry === "string" && entry.trim() !== "",
    )
  } catch {
    return []
  }
}

export const modelMetadata = (row: ProviderModelRow): Partial<ProviderModelCatalogEntry> => {
  const parsed = parseProviderData(row.metadata)
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Partial<ProviderModelCatalogEntry>)
    : {}
}

export const fromProviderModelRow = (row: ProviderModelRow): ProviderModel => {
  const metadata = modelMetadata(row)
  const serviceTiers = Array.isArray(metadata.serviceTiers) ? metadata.serviceTiers : []
  const additionalSpeedTiers = Array.isArray(metadata.additionalSpeedTiers)
    ? metadata.additionalSpeedTiers
    : []
  const inputModalities = Array.isArray(metadata.inputModalities)
    ? metadata.inputModalities
    : ["text", "image"]
  return {
    id: row.id,
    providerId: row.provider_id,
    slug: row.slug,
    catalogId: metadata.catalogId ?? row.slug,
    displayName: row.display_name,
    description: metadata.description ?? "",
    reasoningEfforts: parseReasoningEfforts(row.reasoning_efforts),
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

export const fromThreadSettingsRow = (row: ThreadSettingsRow): ThreadSettings => ({
  threadId: row.thread_id,
  providerId: row.provider_id,
  modelId: row.model_id,
  reasoningEffort: (row.reasoning_effort as ReasoningEffort | null) ?? null,
  speed: row.speed,
  mode: row.mode,
  sandbox: row.sandbox,
  approvalPolicy: row.approval_policy,
})
