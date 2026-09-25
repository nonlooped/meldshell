import type {
  AppSnapshot,
  Provider,
  ProviderModel,
  ReasoningEffort,
  ThreadSettings,
} from "@meldshell/contracts"
import { defaultReasoningEffort } from "@meldshell/contracts"

const EFFORT_LABELS: Readonly<Record<string, string>> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-high",
  max: "Max",
  ultra: "Ultra",
}

export const effortLabel = (effort: ReasoningEffort): string =>
  EFFORT_LABELS[effort] ??
  effort.replaceAll(/[-_]/g, " ").replace(/^./, (value) => value.toUpperCase())

export interface Selection {
  readonly provider: Provider
  readonly model: ProviderModel
  readonly reasoningEffort: ReasoningEffort | null
  readonly speed: ThreadSettings["speed"]
  readonly mode: ThreadSettings["mode"]
  readonly sandbox: ThreadSettings["sandbox"]
  readonly approvalPolicy: ThreadSettings["approvalPolicy"]
}

export const modelsForProvider = (
  snapshot: AppSnapshot,
  providerId: string,
): ReadonlyArray<ProviderModel> =>
  snapshot.models
    .filter((model) => model.providerId === providerId)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)

/** Models a turn may actually use: the provider is on, and so is the model. */
export const selectableModels = (snapshot: AppSnapshot): ReadonlyArray<ProviderModel> => {
  const enabledProviders = new Set(
    snapshot.providers.filter((provider) => provider.enabled).map((provider) => provider.id),
  )
  return snapshot.models
    .filter((model) => model.enabled && enabledProviders.has(model.providerId))
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
}

/**
 * Resolves what the composer should show for a thread. A stored row can go stale when its model is
 * deleted or disabled in settings, so the first selectable model is used as the fallback rather
 * than leaving the composer pointing at something no turn could run.
 */
export const resolveSelection = (snapshot: AppSnapshot, threadId: string): Selection | null => {
  const available = selectableModels(snapshot)
  if (available.length === 0) return null

  const stored = snapshot.threadSettings.find((entry) => entry.threadId === threadId)
  const model =
    available.find((candidate) => candidate.id === stored?.modelId) ??
    available.find((candidate) => !candidate.hidden) ??
    available[0]
  if (model === undefined) return null

  const provider = snapshot.providers.find((entry) => entry.id === model.providerId)
  if (provider === undefined) return null

  const storedEffort = stored?.reasoningEffort ?? null
  const reasoningEffort =
    storedEffort !== null && model.reasoningEfforts.includes(storedEffort)
      ? storedEffort
      : defaultReasoningEffort(model.reasoningEfforts, model.defaultReasoningEffort)

  const storedSpeed = stored?.speed ?? "standard"
  return {
    provider,
    model,
    reasoningEffort,
    speed: storedSpeed === "fast" && !model.supportsFast ? "standard" : storedSpeed,
    mode: stored?.mode ?? "default",
    sandbox: stored?.sandbox ?? "workspace-write",
    approvalPolicy: stored?.approvalPolicy ?? "on-request",
  }
}
