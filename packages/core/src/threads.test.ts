import assert from "node:assert/strict"
import { test } from "node:test"
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import type { ProviderModelCatalogEntry } from "@meldshell/contracts"
import { seedCatalog, syncProviderCatalog } from "./catalog"
import { runMigrations } from "./database/migrations"
import { setThreadStatus } from "./threads"
import { submitTurn } from "./turns"

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

test("a message sent to an archived thread returns it to the inbox", async (t) => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  await runtime.runPromise(
    Effect.gen(function* () {
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
    }),
  )
  const archived = await runtime.runPromise(setThreadStatus("t", "settled"))
  assert.equal(archived.threads[0]?.status, "settled")
  const sent = await runtime.runPromise(submitTurn({ threadId: "t", text: "One more thing" }))
  assert.equal(sent.disposition, "started")
  assert.equal(sent.snapshot.threads[0]?.status, "active")
})
