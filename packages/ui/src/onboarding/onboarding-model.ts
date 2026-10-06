import {
  HARNESSES,
  isHarness,
  type AppSnapshot,
  type Provider,
  type ProviderStatus,
} from "@meldshell/contracts"

/** The first-run guide's pages, in order. Only the welcome asks nothing of the person. */
export const ONBOARDING_STEPS = ["welcome", "agents", "look", "start"] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const STEP_LABELS: Readonly<Record<OnboardingStep, string>> = {
  welcome: "Welcome",
  agents: "Agents",
  look: "Look",
  start: "Start",
}

/**
 * A fresh install opens the guide once. Installs that already hold work predate it, so they are
 * treated as set up even though they never stored the flag. The home workspace is always there,
 * so it does not count as work.
 */
export const needsOnboarding = (snapshot: AppSnapshot): boolean =>
  snapshot.settings.onboarded !== true &&
  snapshot.workspaces.every((workspace) => workspace.home === true) &&
  snapshot.threads.length === 0

type Availability = ProviderStatus["availability"]

/** How an agent's state reads on its tile. A ready agent needs no words, only its check. */
export const AGENT_STATES: Readonly<
  Record<Availability, { readonly label: string; readonly tone: string }>
> = {
  probing: { label: "Looking…", tone: "var(--text-tertiary)" },
  ready: { label: "Ready", tone: "var(--color-added)" },
  missing: { label: "Not installed", tone: "var(--text-tertiary)" },
  unauthenticated: { label: "Signed out", tone: "var(--color-modified)" },
  outdated: { label: "Needs an update", tone: "var(--color-modified)" },
  error: { label: "Can't start", tone: "var(--color-deleted)" },
}

/** The name the guide uses for an agent: the harness's own, as the README and docs call it. */
export const agentName = (provider: Pick<Provider, "harness" | "displayName">): string =>
  isHarness(provider.harness) ? HARNESSES[provider.harness].label : provider.displayName

/** Who makes each agent, shown under its name so a newcomer can place it. */
const MAKERS: Readonly<Record<string, string>> = {
  codex: "OpenAI",
  "claude-code": "Anthropic",
  cursor: "Cursor",
  pi: "Earendil",
}

export const agentMaker = (harness: string): string | null => MAKERS[harness] ?? null

export type Platform = "windows" | "other"

/** What moves an agent along, said once: a command to copy, or a sentence when there is none. */
export interface AgentGuidance {
  /** A short lead-in, only when the command alone would not explain itself. */
  readonly instruction: string | null
  /** The command to type, when there is one for this platform. */
  readonly command: string | null
  /** The vendor's own install page, when it has one. */
  readonly docs: string | null
}

interface HarnessGuide {
  readonly install: (platform: Platform) => AgentGuidance
  readonly signIn: AgentGuidance
  readonly update: string
}

const GUIDES: Readonly<Record<string, HarnessGuide>> = {
  codex: {
    install: () => ({
      instruction: null,
      command: "npm install -g @openai/codex",
      docs: "https://developers.openai.com/codex/cli",
    }),
    signIn: { instruction: null, command: "codex login", docs: null },
    update: "codex update",
  },
  "claude-code": {
    install: (platform) => ({
      instruction: null,
      command:
        platform === "windows"
          ? "irm https://claude.ai/install.ps1 | iex"
          : "curl -fsSL https://claude.ai/install.sh | bash",
      docs: "https://docs.claude.com/en/docs/claude-code/setup",
    }),
    signIn: { instruction: "Run it once and sign in.", command: "claude", docs: null },
    update: "claude update",
  },
  cursor: {
    install: (platform) => ({
      instruction: platform === "windows" ? "Install the Cursor CLI from its page." : null,
      command: platform === "windows" ? null : "curl https://cursor.com/install -fsS | bash",
      docs: "https://cursor.com/docs/cli/installation",
    }),
    signIn: { instruction: null, command: "agent login", docs: null },
    update: "agent update",
  },
  pi: {
    install: () => ({
      instruction: null,
      command: "npm install -g @earendil-works/pi-coding-agent",
      docs: "https://www.npmjs.com/package/@earendil-works/pi-coding-agent",
    }),
    signIn: { instruction: "Run it and type /login.", command: "pi", docs: null },
    update: "pi update self",
  },
}

/**
 * The next thing to do for an agent that cannot run yet, or null when it can, is still being
 * checked, or the guide knows nothing about its harness.
 */
export function agentGuidance(
  harness: string,
  status: ProviderStatus | undefined,
  platform: Platform,
): AgentGuidance | null {
  const guide = GUIDES[harness]
  if (status === undefined || guide === undefined) return null
  switch (status.availability) {
    case "missing":
      return guide.install(platform)
    case "unauthenticated":
      return guide.signIn
    case "outdated":
      return { instruction: status.detail, command: guide.update, docs: null }
    case "error":
      return { instruction: status.detail, command: null, docs: null }
    default:
      return null
  }
}

/** Built-in providers, one tile per agent, in catalog order. */
export const onboardingProviders = (providers: readonly Provider[]): readonly Provider[] =>
  providers
    .filter((provider) => provider.builtIn)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)

/**
 * The agent the first thread starts on: the person's pick while it can still run, otherwise the
 * first ready one in catalog order. Null while none is ready.
 */
export function startingAgentId(
  providers: readonly Provider[],
  readyIds: ReadonlySet<string>,
  picked: string | null,
): string | null {
  if (picked !== null && readyIds.has(picked)) return picked
  return providers.find((provider) => provider.enabled && readyIds.has(provider.id))?.id ?? null
}

/** The model a provider opens on: its advertised default, otherwise its first shown model. */
export function starterModelId(snapshot: AppSnapshot, providerId: string | null): string | null {
  if (providerId === null) return null
  const models = snapshot.models
    .filter((model) => model.providerId === providerId && model.enabled && !model.hidden)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
  return (models.find((entry) => entry.isDefault) ?? models[0])?.id ?? null
}
