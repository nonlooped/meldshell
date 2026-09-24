import * as SqlClient from "@effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import {
  defaultReasoningEffort,
  type ProviderModel,
  type SetThreadSettingsInput,
  type SyncProviderCatalogInput,
  type UpdateProviderInput,
  type UpsertModelInput,
  CoreProtocolError,
} from "@meldshell/contracts"
import { Effect } from "effect"
import { transaction } from "./database/persistence"
import {
  type ProviderRow,
  type ProviderModelRow,
  type ThreadSettingsRow,
  modelMetadata,
  fromProviderModelRow,
} from "./database/rows"
import { getSnapshot } from "./snapshots"

interface SeedProvider {
  readonly key: string
  readonly harness: string
  readonly displayName: string
}

/**
 * Only the provider identity is seeded. Models come from each provider and remain stored so an
 * unavailable provider never blocks access to existing threads.
 */
const CATALOG_SEED_VERSION = "5"

const SEED_PROVIDERS: ReadonlyArray<SeedProvider> = [
  {
    key: "openai",
    harness: "codex",
    displayName: "OpenAI",
  },
  { key: "anthropic", harness: "claude-code", displayName: "Claude" },
  { key: "cursor", harness: "cursor", displayName: "Cursor" },
]

export const seedCatalog = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.withTransaction(
    Effect.gen(function* () {
      // Retire catalog entries for integrations that are no longer shipped. Foreign-key
      // cascades clear their models and selections while retaining conversation history.
      yield* sql`DELETE FROM providers WHERE built_in = 1
        AND harness NOT IN ('codex', 'claude-code', 'cursor')`
      for (const [providerIndex, provider] of SEED_PROVIDERS.entries()) {
        yield* sql`
            INSERT INTO providers (id, key, harness, display_name, enabled, sort_order, built_in)
            VALUES (
              ${randomUUID()}, ${provider.key}, ${provider.harness},
              ${provider.displayName}, 1, ${providerIndex}, 1
            )
            ON CONFLICT(key) DO NOTHING
          `
      }

      yield* sql`
          INSERT INTO settings (key, value)
          VALUES ('catalog_seed_version', ${CATALOG_SEED_VERSION})
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `
    }),
  )
})

/** The first selectable model, used as the starting selection for a newly created thread. */
export const defaultSelection = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<ProviderModelRow>`
    SELECT m.id, m.provider_id, m.slug, m.display_name, m.reasoning_efforts, m.metadata,
           m.supports_fast, m.enabled, m.hidden, m.sort_order, m.built_in
    FROM provider_models m
    JOIN providers p ON p.id = m.provider_id
    WHERE m.enabled = 1 AND m.hidden = 0 AND p.enabled = 1
    ORDER BY p.sort_order, m.sort_order
  `
  const row = rows.find((candidate) => fromProviderModelRow(candidate).isDefault) ?? rows[0]
  return row === undefined ? null : fromProviderModelRow(row)
})

export const updateProvider = (input: UpdateProviderInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ProviderRow>`
      SELECT id, key, harness, display_name, enabled, sort_order, built_in
      FROM providers WHERE id = ${input.providerId}
    `
    const current = rows[0]
    if (current === undefined) return yield* getSnapshot

    const displayName = input.displayName?.trim()
    const nextDisplayName = displayName || current.display_name
    const nextEnabled = input.enabled === undefined ? current.enabled : Number(input.enabled)

    yield* sql`
      UPDATE providers
      SET display_name = ${nextDisplayName}, enabled = ${nextEnabled}
      WHERE id = ${input.providerId}
    `
    return yield* getSnapshot
  })

const createModel = (input: UpsertModelInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const slug = input.slug?.trim()
    if (!slug) return yield* getSnapshot

    const highest = yield* sql<{ readonly next: number | null }>`
      SELECT MAX(sort_order) + 1 AS next
      FROM provider_models WHERE provider_id = ${input.providerId}
    `
    const displayName = input.displayName?.trim()

    yield* sql`
      INSERT INTO provider_models (
        id, provider_id, slug, display_name, reasoning_efforts, metadata,
        supports_fast, enabled, hidden, sort_order, built_in
      )
      VALUES (
        ${randomUUID()}, ${input.providerId}, ${slug},
        ${displayName || slug},
        ${JSON.stringify(input.reasoningEfforts ?? [])}, '{}',
        ${input.supportsFast === true ? 1 : 0},
        ${input.enabled === false ? 0 : 1},
        ${input.hidden === true ? 1 : 0},
        ${highest[0]?.next ?? 0}, 0
      )
      ON CONFLICT(provider_id, slug) DO NOTHING
    `
    return yield* getSnapshot
  })

export const upsertModel = (input: UpsertModelInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const modelId = input.modelId
    if (modelId === undefined) return yield* createModel(input)

    const rows = yield* sql<ProviderModelRow>`
      SELECT id, provider_id, slug, display_name, reasoning_efforts, metadata,
             supports_fast, enabled, hidden, sort_order, built_in
      FROM provider_models WHERE id = ${modelId}
    `
    const current = rows[0]
    if (current === undefined) return yield* getSnapshot

    const slug = input.slug?.trim()
    const displayName = input.displayName?.trim()
    const nextSlug = slug || current.slug
    const nextDisplayName = displayName || current.display_name
    const nextEfforts =
      input.reasoningEfforts === undefined
        ? current.reasoning_efforts
        : JSON.stringify(input.reasoningEfforts)
    const nextFast =
      input.supportsFast === undefined ? current.supports_fast : Number(input.supportsFast)
    const nextEnabled = input.enabled === undefined ? current.enabled : Number(input.enabled)
    const nextHidden = input.hidden === undefined ? current.hidden : Number(input.hidden)

    yield* sql`
      UPDATE provider_models
      SET slug = ${nextSlug},
          display_name = ${nextDisplayName},
          name_override = CASE WHEN ${Number(Boolean(displayName))} = 1 THEN ${nextDisplayName} ELSE name_override END,
          reasoning_efforts = ${nextEfforts},
          efforts_override = CASE WHEN ${input.reasoningEfforts !== undefined ? 1 : 0} = 1 THEN ${nextEfforts} ELSE efforts_override END,
          supports_fast = ${nextFast},
          fast_override = CASE WHEN ${input.supportsFast !== undefined ? 1 : 0} = 1 THEN ${nextFast} ELSE fast_override END,
          enabled = ${nextEnabled},
          hidden = ${nextHidden}
      WHERE id = ${modelId}
    `
    return yield* getSnapshot
  })

export const deleteModel = (modelId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM provider_models WHERE id = ${modelId}`
    return yield* getSnapshot
  }).pipe(transaction)

/** Reconciles provider-owned metadata while retaining local rename, enablement, and hide choices. */
export const syncProviderCatalog = (input: SyncProviderCatalogInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.models.length === 0) return yield* getSnapshot
    const providers = yield* sql<ProviderRow>`
      SELECT id, key, harness, display_name, enabled, sort_order, built_in
      FROM providers WHERE key = ${input.providerKey}
    `
    const provider = providers[0]
    if (provider === undefined) return yield* getSnapshot

    yield* sql.withTransaction(
      Effect.gen(function* () {
        const existing = yield* sql<ProviderModelRow>`
          SELECT id, provider_id, slug, display_name, reasoning_efforts, metadata,
                 supports_fast, enabled, hidden, sort_order, built_in
          FROM provider_models WHERE provider_id = ${provider.id}
        `

        for (const [sortOrder, model] of input.models.entries()) {
          const current = existing.find((candidate) => candidate.slug === model.slug)
          const metadata = JSON.stringify(model)
          const efforts = JSON.stringify(model.reasoningEfforts)
          const supportsFast = Number(model.fastServiceTier !== null)
          if (current === undefined) {
            yield* sql`
              INSERT INTO provider_models (
                id, provider_id, slug, display_name, reasoning_efforts, metadata,
                supports_fast, enabled, hidden, sort_order, built_in
              ) VALUES (
                ${randomUUID()}, ${provider.id}, ${model.slug}, ${model.displayName}, ${efforts},
                ${metadata}, ${supportsFast}, 1, ${Number(model.hidden)}, ${sortOrder}, 1
              )
            `
          } else {
            yield* sql`
              UPDATE provider_models
              SET display_name = COALESCE(name_override, ${model.displayName}),
                  reasoning_efforts = COALESCE(efforts_override, ${efforts}), metadata = ${metadata},
                  supports_fast = COALESCE(fast_override, ${supportsFast}), sort_order = ${sortOrder}, built_in = 1
              WHERE id = ${current.id}
            `
          }
        }

        const refreshed = yield* sql<ProviderModelRow>`
          SELECT id, provider_id, slug, display_name, reasoning_efforts, metadata,
                 supports_fast, enabled, hidden, sort_order, built_in
          FROM provider_models WHERE provider_id = ${provider.id}
        `
        const discoveredSlugs = new Set(input.models.map((model) => model.slug))
        const discoveredRows = refreshed.filter((row) => discoveredSlugs.has(row.slug))
        const defaultRow = catalogDefault(discoveredRows)
        if (defaultRow === undefined) return
        const defaultModel = fromProviderModelRow(defaultRow)
        const defaultEffort = defaultReasoningEffort(
          defaultModel.reasoningEfforts,
          defaultModel.defaultReasoningEffort,
        )

        for (const stale of refreshed.filter(
          (row) => input.partial !== true && row.built_in === 1 && !discoveredSlugs.has(row.slug),
        )) {
          yield* sql`
            UPDATE thread_settings
            SET provider_id = ${provider.id}, model_id = ${defaultRow.id},
                reasoning_effort = ${defaultEffort}, speed = 'standard'
            WHERE model_id = ${stale.id}
          `
          yield* sql`DELETE FROM provider_models WHERE id = ${stale.id}`
        }

        yield* Effect.forEach(discoveredRows, reconcileModelSettings, { discard: true })

        yield* sql`
          INSERT INTO thread_settings (
            thread_id, provider_id, model_id, reasoning_effort, speed,
            mode, sandbox, approval_policy
          )
          SELECT t.id, ${provider.id}, ${defaultRow.id}, ${defaultEffort}, 'standard',
                 'default', 'workspace-write', 'on-request'
          FROM threads t
          WHERE NOT EXISTS (
            SELECT 1 FROM thread_settings settings WHERE settings.thread_id = t.id
          )
        `
      }),
    )
    return yield* getSnapshot
  })

/** Restores one provider's built-in models to their discovered names, options, and visibility. */
export const resetProviderCatalog = (providerId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ProviderModelRow>`
    SELECT id, provider_id, slug, display_name, reasoning_efforts, metadata,
           supports_fast, enabled, hidden, sort_order, built_in
    FROM provider_models WHERE built_in = 1 AND provider_id = ${providerId}
  `
    for (const row of rows) {
      const metadata = modelMetadata(row)
      const efforts = Array.isArray(metadata.reasoningEfforts) ? metadata.reasoningEfforts : []
      yield* sql`
      UPDATE provider_models
      SET display_name = ${metadata.displayName ?? row.slug},
          reasoning_efforts = ${JSON.stringify(efforts)},
          supports_fast = ${metadata.fastServiceTier == null ? 0 : 1},
          name_override = NULL, efforts_override = NULL, fast_override = NULL,
          enabled = 1, hidden = ${metadata.hidden === true ? 1 : 0}
      WHERE id = ${row.id}
    `
    }
    return yield* getSnapshot
  }).pipe(transaction)

export const setThreadSettings = (input: SetThreadSettingsInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const existing = yield* sql<ThreadSettingsRow>`
      SELECT thread_id, provider_id, model_id, reasoning_effort, speed,
             mode, sandbox, approval_policy
      FROM thread_settings WHERE thread_id = ${input.threadId}
    `
    const current = existing[0]
    const modelId = input.modelId ?? current?.model_id
    if (modelId == null) return yield* getSnapshot

    const modelRows = yield* sql<ProviderModelRow>`
      SELECT id, provider_id, slug, display_name, reasoning_efforts, metadata,
             supports_fast, enabled, hidden, sort_order, built_in
      FROM provider_models WHERE id = ${modelId}
    `
    const modelRow = modelRows[0]
    if (modelRow === undefined) return yield* getSnapshot
    const model = fromProviderModelRow(modelRow)

    // Revalidate persisted settings when a model change removes an effort or speed tier.
    const { reasoningEffort, speed } = selectedEffortAndSpeed(model, current, input)
    const providers =
      yield* sql<ProviderRow>`SELECT * FROM providers WHERE id = ${model.providerId}`
    const harness = providers[0]?.harness
    if (current !== undefined && current.provider_id !== model.providerId) {
      const active =
        yield* sql`SELECT id FROM turns WHERE thread_id = ${input.threadId} AND status = 'running'`
      if (active.length > 0)
        return yield* Effect.fail(
          new CoreProtocolError({
            message: "Stop the running turn before switching providers.",
          }),
        )
    }
    const mode =
      input.mode ??
      (current?.provider_id === model.providerId ? current.mode : "default") ??
      "default"
    if (unsupportedMode(mode, harness))
      return yield* Effect.fail(
        new CoreProtocolError({
          message: "This mode is not supported by this provider integration.",
        }),
      )
    const sandbox = input.sandbox ?? current?.sandbox ?? "workspace-write"
    const approvalPolicy = input.approvalPolicy ?? current?.approval_policy ?? "on-request"

    yield* sql`
      INSERT INTO thread_settings (
        thread_id, provider_id, model_id, reasoning_effort, speed,
        mode, sandbox, approval_policy
      )
      VALUES (
        ${input.threadId}, ${model.providerId}, ${model.id}, ${reasoningEffort}, ${speed},
        ${mode}, ${sandbox}, ${approvalPolicy}
      )
      ON CONFLICT(thread_id) DO UPDATE SET
        provider_id = excluded.provider_id,
        model_id = excluded.model_id,
        reasoning_effort = excluded.reasoning_effort,
        speed = excluded.speed,
        mode = excluded.mode,
        sandbox = excluded.sandbox,
        approval_policy = excluded.approval_policy
    `
    return yield* getSnapshot
  }).pipe(transaction)

/** A model a turn could actually use: the model and its provider are both enabled. */
export const enabledModel = (modelId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ProviderModelRow>`
      SELECT m.id, m.provider_id, m.slug, m.display_name, m.reasoning_efforts, m.metadata,
             m.supports_fast, m.enabled, m.hidden, m.sort_order, m.built_in
      FROM provider_models m
      JOIN providers p ON p.id = m.provider_id
      WHERE m.id = ${modelId} AND m.enabled = 1 AND p.enabled = 1
    `
    const row = rows[0]
    return row === undefined ? null : fromProviderModelRow(row)
  })

const reconcileModelSettings = (row: ProviderModelRow) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const model = fromProviderModelRow(row)
    const settings = yield* sql<ThreadSettingsRow>`
            SELECT thread_id, provider_id, model_id, reasoning_effort, speed,
                   mode, sandbox, approval_policy
            FROM thread_settings WHERE model_id = ${row.id}
          `
    for (const setting of settings) {
      const effort =
        setting.reasoning_effort !== null &&
        model.reasoningEfforts.includes(setting.reasoning_effort)
          ? setting.reasoning_effort
          : defaultReasoningEffort(model.reasoningEfforts, model.defaultReasoningEffort)
      const speed = setting.speed === "fast" && !model.supportsFast ? "standard" : setting.speed
      if (effort !== setting.reasoning_effort || speed !== setting.speed) {
        yield* sql`
                UPDATE thread_settings
                SET reasoning_effort = ${effort}, speed = ${speed}
                WHERE thread_id = ${setting.thread_id}
              `
      }
    }
  })

const selectedEffortAndSpeed = (
  model: ProviderModel,
  current: ThreadSettingsRow | undefined,
  input: SetThreadSettingsInput,
) => {
  const requestedEffort =
    input.reasoningEffort === undefined
      ? (current?.reasoning_effort ?? null)
      : input.reasoningEffort
  const reasoningEffort =
    requestedEffort !== null && model.reasoningEfforts.includes(requestedEffort)
      ? requestedEffort
      : defaultReasoningEffort(model.reasoningEfforts, model.defaultReasoningEffort)
  const requestedSpeed = input.speed ?? current?.speed ?? "standard"
  const speed = requestedSpeed === "fast" && !model.supportsFast ? "standard" : requestedSpeed

  return { reasoningEffort, speed }
}

function catalogDefault(discoveredRows: readonly ProviderModelRow[]) {
  const enabledRows = discoveredRows.filter((row) => row.enabled === 1)
  return (
    enabledRows.find((row) => fromProviderModelRow(row).isDefault && row.hidden === 0) ??
    enabledRows.find((row) => row.hidden === 0) ??
    enabledRows[0] ??
    discoveredRows.find((row) => row.hidden === 0) ??
    discoveredRows[0]
  )
}

export const unsupportedMode = (mode: string, harness: string | undefined): boolean =>
  (mode === "plan" && harness !== "claude-code" && harness !== "cursor") ||
  (mode === "ask" && harness !== "cursor")
