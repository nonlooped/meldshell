import assert from "node:assert/strict"
import test from "node:test"
import type { AppSnapshot, Provider, ProviderModel, ProviderStatus } from "@meldshell/contracts"
import {
  agentGuidance,
  agentMaker,
  agentName,
  needsOnboarding,
  onboardingProviders,
  startingAgentId,
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

const status = (
  harness: string,
  availability: ProviderStatus["availability"],
  detail = "",
): ProviderStatus =>
  ({
    provider: "openai",
    harness,
    availability,
    executablePath: null,
    version: null,
    detail,
    checkedAt: "",
  }) as ProviderStatus

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

test("agents are named after their harness, as the docs call them", () => {
  assert.equal(agentName(provider("codex", 0, { displayName: "OpenAI" })), "Codex")
  assert.equal(agentName(provider("claude-code", 1, { displayName: "Anthropic" })), "Claude Code")
  assert.equal(agentName(provider("other", 2, { displayName: "My agent" })), "My agent")
})

test("an agent that cannot run yet gets the command that moves it along", () => {
  const install = agentGuidance("codex", status("codex", "missing"), "other")
  assert.equal(install?.command, "npm install -g @openai/codex")
  assert.match(install?.docs ?? "", /^https:\/\//)
  // Installers differ by platform; Cursor publishes none to paste on Windows, only a page.
  assert.match(
    agentGuidance("claude-code", status("claude-code", "missing"), "windows")?.command ?? "",
    /^irm /,
  )
  assert.match(
    agentGuidance("claude-code", status("claude-code", "missing"), "other")?.command ?? "",
    /^curl /,
  )
  assert.equal(agentGuidance("cursor", status("cursor", "missing"), "windows")?.command, null)
  assert.equal(
    agentGuidance("cursor", status("cursor", "missing"), "other")?.command?.startsWith("curl"),
    true,
  )
  assert.equal(agentGuidance("pi", status("pi", "unauthenticated"), "other")?.command, "pi")
  // An outdated install keeps the host's explanation and adds the harness's own updater.
  const outdated = agentGuidance(
    "codex",
    status("codex", "outdated", "Codex 0.1 is too old."),
    "other",
  )
  assert.deepEqual(outdated, {
    instruction: "Codex 0.1 is too old.",
    command: "codex update",
    docs: null,
  })
  // A command that explains itself carries no lead-in; one that does not says what to do next.
  assert.equal(install?.instruction, null)
  assert.equal(
    agentGuidance("pi", status("pi", "unauthenticated"), "other")?.instruction,
    "Run it and type /login.",
  )
  // Ready, still probing, and unknown harnesses need no guidance.
  assert.equal(agentGuidance("codex", status("codex", "ready"), "other"), null)
  assert.equal(agentGuidance("codex", status("codex", "probing"), "other"), null)
  assert.equal(agentGuidance("codex", undefined, "other"), null)
  assert.equal(agentGuidance("custom", status("custom", "missing"), "other"), null)
})

test("the first thread starts on the picked agent while it can run", () => {
  const providers = [
    provider("codex", 0),
    provider("claude", 1),
    provider("cursor", 2, { enabled: false }),
  ]
  // Without a pick, the first ready agent in catalog order.
  assert.equal(startingAgentId(providers, new Set(["claude", "codex"]), null), "codex")
  assert.equal(startingAgentId(providers, new Set(["codex", "claude"]), "claude"), "claude")
  // A pick that stops being ready falls back rather than opening on an agent that cannot run.
  assert.equal(startingAgentId(providers, new Set(["codex"]), "claude"), "codex")
  // A turned-off agent is never chosen for the person.
  assert.equal(startingAgentId(providers, new Set(["cursor"]), null), null)
  assert.equal(startingAgentId(providers, new Set(), null), null)
})

test("the starting agent opens on its own default model", () => {
  const state = snapshot({
    models: [
      model("gpt", "codex"),
      model("sonnet", "claude", { sortOrder: 0, hidden: true }),
      model("opus", "claude", { sortOrder: 1 }),
      model("haiku", "claude", { sortOrder: 2, isDefault: true }),
      model("haiku-off", "claude", { enabled: false, isDefault: true }),
    ],
  })
  assert.equal(starterModelId(state, "claude"), "haiku")
  assert.equal(starterModelId(state, "codex"), "gpt")
  assert.equal(starterModelId(state, "cursor"), null)
  assert.equal(starterModelId(state, null), null)
})

test("agents are introduced by who makes them", () => {
  assert.equal(agentMaker("codex"), "OpenAI")
  assert.equal(agentMaker("claude-code"), "Anthropic")
  assert.equal(agentMaker("custom"), null)
})
