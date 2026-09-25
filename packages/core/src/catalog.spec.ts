import assert from "node:assert/strict"
import { it } from "@effect/vitest"
import { TestDatabase } from "./test/database"
import { Effect } from "effect"
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

it.effect("restoring built-in models only resets the chosen provider", () =>
  Effect.gen(function* () {
    const snapshot = yield* Effect.gen(function* () {
      yield* runMigrations
      yield* seedCatalog
      yield* syncProviderCatalog({ providerKey: "openai", models: [entry("gpt")] })
      return yield* syncProviderCatalog({ providerKey: "anthropic", models: [entry("sonnet")] })
    })
    const openai = snapshot.providers.find((provider) => provider.key === "openai")!
    for (const model of snapshot.models) {
      yield* upsertModel({
        providerId: model.providerId,
        modelId: model.id,
        displayName: "Renamed",
      })
    }
    yield* resetProviderCatalog(openai.id)
    const restored = yield* getSnapshot
    const names = Object.fromEntries(
      restored.models.map((model) => [model.slug, model.displayName]),
    )
    assert.deepEqual(names, { gpt: "gpt", sonnet: "Renamed" })
  }).pipe(Effect.provide(TestDatabase)),
)
