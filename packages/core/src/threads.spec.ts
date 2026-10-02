import assert from "node:assert/strict"
import { it } from "@effect/vitest"
import { TestDatabase } from "./test/database"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect } from "effect"
import type { ProviderModelCatalogEntry } from "@meldshell/contracts"
import { seedCatalog, syncProviderCatalog } from "./catalog"
import { runMigrations } from "./database/migrations"
import { renameThread, setThreadStatus } from "./threads"
import { submitTurn } from "./turns"
import { setThreadTitle } from "./titles"

const model: ProviderModelCatalogEntry = {
  catalogId: "gpt",
  slug: "gpt",
  displayName: "gpt",
  description: "",
  reasoningEfforts: [],
  defaultReasoningEffort: null,
  serviceTiers: [],
  defaultServiceTier: null,
  additionalSpeedTiers: [],
  fastServiceTier: null,
  inputModalities: [],
  supportsPersonality: false,
  isDefault: true,
  hidden: false,
  upgrade: null,
  modelSpecialty: null,
  multiAgentVersion: null,
}

it.effect("a message sent to an archived thread returns it to the inbox", () =>
  Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* runMigrations
      yield* seedCatalog
      const catalog = yield* syncProviderCatalog({ providerKey: "openai", models: [model] })
      const gpt = catalog.models.find((entry) => entry.slug === "gpt")!
      yield* sql`INSERT INTO workspaces VALUES ('w', '/w', 'w', '2026-09-01', '2026-09-01')`
      yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at, title_locked)
        VALUES ('t', 'w', 'Thread', 'active', '2026-09-01', '2026-09-01', 1)`
      yield* sql`INSERT INTO thread_settings (thread_id, provider_id, model_id)
        VALUES ('t', ${gpt.providerId}, ${gpt.id})`
    })
    const archived = yield* setThreadStatus("t", "settled")
    assert.equal(archived.threads[0]?.status, "settled")
    const sent = yield* submitTurn({ threadId: "t", text: "One more thing" })
    assert.equal(sent.disposition, "started")
    assert.equal(sent.snapshot.threads[0]?.status, "active")
  }).pipe(Effect.provide(TestDatabase)),
)

it.effect("manual thread rename trims and locks the title", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* runMigrations
    yield* sql`INSERT INTO workspaces VALUES ('w', '/w', 'w', '2026-09-01', '2026-09-01')`
    yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at, title_locked)
      VALUES ('t', 'w', 'New thread', 'active', '2026-09-01', '2026-09-01', 0)`
    const snapshot = yield* renameThread("t", "  A useful name  ")
    assert.equal(snapshot.threads[0]?.title, "A useful name")
    const late = yield* setThreadTitle({ threadId: "t", title: "Late generated name" })
    assert.equal(late.threads[0]?.title, "A useful name")
    const rows = yield* sql`SELECT title_locked, title_manual FROM threads WHERE id = 't'`
    assert.equal(rows[0]?.title_locked, 1)
    assert.equal(rows[0]?.title_manual, 1)
  }).pipe(Effect.provide(TestDatabase)),
)
