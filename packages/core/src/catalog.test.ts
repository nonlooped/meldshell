import assert from "node:assert/strict"
import { test } from "node:test"
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import { Effect, ManagedRuntime } from "effect"
import type { ProviderModelCatalogEntry } from "@meldshell/contracts"
import { resetProviderCatalog, seedCatalog, syncProviderCatalog, upsertModel } from "./catalog"
import { runMigrations } from "./database/migrations"
import { getSnapshot } from "./snapshots"

const entry = (slug: string): ProviderModelCatalogEntry => ({
  catalogId: slug,
  slug,
  displayName: slug,
  description: "",
  reasoningEfforts: ["low", "high"],
  defaultReasoningEffort: "low",
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
})

test("restoring built-in models only resets the chosen provider", async (t) => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  const snapshot = await runtime.runPromise(
    Effect.gen(function* () {
      yield* runMigrations
      yield* seedCatalog
      yield* syncProviderCatalog({ providerKey: "openai", models: [entry("gpt")] })
      return yield* syncProviderCatalog({ providerKey: "anthropic", models: [entry("sonnet")] })
    }),
  )
  const openai = snapshot.providers.find((provider) => provider.key === "openai")!
  for (const model of snapshot.models) {
    await runtime.runPromise(
      upsertModel({ providerId: model.providerId, modelId: model.id, displayName: "Renamed" }),
    )
  }
  await runtime.runPromise(resetProviderCatalog(openai.id))
  const restored = await runtime.runPromise(getSnapshot)
  const names = Object.fromEntries(restored.models.map((model) => [model.slug, model.displayName]))
  assert.deepEqual(names, { gpt: "gpt", sonnet: "Renamed" })
})
