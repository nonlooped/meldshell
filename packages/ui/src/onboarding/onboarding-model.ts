import type { AppSnapshot, Provider, ProviderStatus } from "@meldshell/contracts"

/** The first-run guide's steps, in order. */
export const ONBOARDING_STEPS = ["welcome", "agents", "workspace", "look"] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

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

/** How each agent's connection reads in the guide, with whether it can run a turn now. */
export const AGENT_STATES: Readonly<
  Record<Availability, { readonly label: string; readonly tone: string }>
> = {
  probing: { label: "Checking…", tone: "var(--text-tertiary)" },
  ready: { label: "Ready", tone: "var(--color-added)" },
  missing: { label: "Not installed", tone: "var(--text-tertiary)" },
  unauthenticated: { label: "Signed out", tone: "var(--color-modified)" },
  outdated: { label: "Update required", tone: "var(--color-modified)" },
  error: { label: "Error", tone: "var(--color-deleted)" },
}

/** What to do next for an agent that cannot run yet, matching the Providers settings hints. */
const NEXT_STEPS: Readonly<Record<string, Partial<Record<Availability, string>>>> = {
  codex: {
    missing: "Install the Codex CLI, then check again.",
    unauthenticated: "Run codex login in a terminal.",
  },
  "claude-code": {
    missing: "Install Claude Code, then check again.",
    unauthenticated: "Sign in to Claude Code in a terminal.",
  },
  cursor: {
    missing: "Install the Cursor CLI, then check again.",
    unauthenticated: "Sign in with the Cursor CLI.",
  },
  pi: {
    missing: "Install Pi, then check again.",
    unauthenticated: "Run pi and use /login, or set a provider API key.",
  },
}

/** The line under an agent's name: its account or version when ready, otherwise the next step. */
export function agentDetail(harness: string, status: ProviderStatus | undefined): string {
  if (status === undefined || status.availability === "probing") return "Looking for this agent…"
  if (status.availability === "ready") {
    const version =
      status.version === null
        ? null
        : /^\d/.test(status.version)
          ? `v${status.version}`
          : status.version
    return [status.accountEmail, version].filter(Boolean).join(" · ") || "Installed and signed in."
  }
  if (status.availability === "outdated" || status.availability === "error") return status.detail
  return NEXT_STEPS[harness]?.[status.availability] ?? status.detail
}

/** Built-in providers, one row per agent, in catalog order. */
export const onboardingProviders = (providers: readonly Provider[]): readonly Provider[] =>
  providers
    .filter((provider) => provider.builtIn)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)

/**
 * The model the first thread starts on, so it opens on an agent that can actually run: the first
 * ready provider's advertised default, otherwise its first shown model. Null when no agent is ready,
 * which leaves the catalog's own default in place.
 */
export function starterModelId(
  snapshot: AppSnapshot,
  readyProviderIds: ReadonlySet<string>,
): string | null {
  for (const provider of snapshot.providers.toSorted((a, b) => a.sortOrder - b.sortOrder)) {
    if (!provider.enabled || !readyProviderIds.has(provider.id)) continue
    const models = snapshot.models
      .filter((model) => model.providerId === provider.id && model.enabled && !model.hidden)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
    const model = models.find((entry) => entry.isDefault) ?? models[0]
    if (model !== undefined) return model.id
  }
  return null
}
