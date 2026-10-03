import assert from "node:assert/strict"
import test from "node:test"
import type { AppSnapshot, Provider, ProviderModel } from "@meldshell/contracts"
import {
  defaultModelId,
  modelChoices,
  needsOnboarding,
  onboardingProviders,
} from "../packages/ui/src/onboarding/onboarding-model.ts"

const provider = (id: string, sortOrder: number, patch: Partial<Provider> = {}): Provider => ({
  id,
  key: id,
  harness: id,
  displayName: id,
  enabled: true,
  sortOrder,
  builtIn: true,
  ...patch,
})

const model = (id: string, providerId: string, patch: Partial<ProviderModel> = {}) =>
  ({
    id,
    providerId,
    slug: id,
    displayName: id,
    enabled: true,
    hidden: false,
    sortOrder: 0,
    isDefault: false,
    ...patch,
  }) as ProviderModel

const snapshot = (patch: Partial<AppSnapshot> = {}): AppSnapshot => ({
  workspaces: [],
  threads: [],
  providers: [],
  models: [],
  threadSettings: [],
  approvals: [],
  settings: { titleModelId: "current" },
  ...patch,
})

test("only a fresh install without the stored flag opens the guide", () => {
  assert.equal(needsOnboarding(snapshot()), true)
  assert.equal(
    needsOnboarding(snapshot({ settings: { titleModelId: "current", onboarded: true } })),
    false,
  )
  const workspace = { id: "w", path: "/w", name: "w", createdAt: "", lastOpenedAt: "" }
  assert.equal(needsOnboarding(snapshot({ workspaces: [workspace] })), false)
})

test("agent rows list built-in providers in catalog order", () => {
  const rows = onboardingProviders([
    provider("pi", 3),
    provider("custom", 0, { builtIn: false }),
    provider("codex", 1),
  ])
  assert.deepEqual(
    rows.map((row) => row.id),
    ["codex", "pi"],
  )
})

test("model choices skip disabled, hidden, and unready entries", () => {
  const state = snapshot({
    providers: [
      provider("codex", 0),
      provider("claude", 1),
      provider("cursor", 2, { enabled: false }),
    ],
    models: [
      model("gpt", "codex", { sortOrder: 1 }),
      model("gpt-mini", "codex", { sortOrder: 0, hidden: true }),
      model("gpt-off", "codex", { enabled: false }),
      model("opus", "claude"),
      model("composer", "cursor"),
    ],
  })
  const groups = modelChoices(state, new Set(["codex", "cursor"]))
  assert.deepEqual(
    groups.map((group) => [group.provider.id, group.models.map((entry) => entry.id)]),
    [["codex", ["gpt"]]],
  )
})

test("the preselected model keeps a valid pick, then prefers the advertised default", () => {
  const state = snapshot({
    providers: [provider("codex", 0), provider("claude", 1)],
    models: [
      model("a", "codex", { sortOrder: 0 }),
      model("b", "codex", { sortOrder: 1, isDefault: true }),
      model("c", "claude"),
    ],
  })
  const groups = modelChoices(state, new Set(["codex", "claude"]))
  assert.equal(defaultModelId(groups, null), "b")
  assert.equal(defaultModelId(groups, "c"), "c")
  assert.equal(defaultModelId(groups, "gone"), "b")
  assert.equal(defaultModelId([], null), null)
})
