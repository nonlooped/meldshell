import assert from "node:assert/strict"
import test from "node:test"
import type { AppSnapshot, Provider, ProviderModel } from "@meldshell/contracts"
import {
  needsOnboarding,
  onboardingProviders,
  starterModelId,
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
  // The home workspace exists on every install, so it does not mean the guide was finished.
  const home = { ...workspace, id: "home", path: "/home/me", name: "Home", home: true }
  assert.equal(needsOnboarding(snapshot({ workspaces: [home] })), true)
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

test("the first thread starts on a ready agent's default model", () => {
  const state = snapshot({
    providers: [
      provider("codex", 0),
      provider("claude", 1),
      provider("cursor", 2, { enabled: false }),
    ],
    models: [
      model("gpt", "codex"),
      model("sonnet", "claude", { sortOrder: 0, hidden: true }),
      model("opus", "claude", { sortOrder: 1 }),
      model("haiku", "claude", { sortOrder: 2, isDefault: true }),
      model("haiku-off", "claude", { enabled: false, isDefault: true }),
      model("composer", "cursor"),
    ],
  })
  assert.equal(starterModelId(state, new Set(["claude", "cursor"])), "haiku")
  assert.equal(starterModelId(state, new Set(["codex", "claude"])), "gpt")
  assert.equal(starterModelId(state, new Set(["cursor"])), null)
  assert.equal(starterModelId(state, new Set()), null)
})
