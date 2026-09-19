import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk"
import type { ProviderModelCatalogEntry } from "@meldshell/contracts"

const claudeModelName = (id: string): string | null => {
  const match = /^claude-([a-z]+)-(\d+(?:-\d{1,2})?)(?:-\d{8})?(\[.*\])?$/.exec(id)
  if (!match) return null
  return `${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)} ${match[2]!.replace("-", ".")}${match[3] ? ` ${match[3]}` : ""}`
}

/** Compares `claude-<family>-<major>[-<minor>]` ids newest first, major version before minor. */
const compareVersions = (left: string, right: string): number => {
  const parts = (id: string): number[] =>
    (/^claude-[a-z]+-(\d+(?:-\d{1,2})?)/.exec(id)?.[1] ?? "").split("-").map(Number)
  const [leftParts, rightParts] = [parts(left), parts(right)]
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * Aliases such as `opus` name a family without a version. The SDK usually reports the pinned id in
 * `resolvedModel`; when it does not, fall back to the newest catalog entry of the same family so
 * the picker never shows a bare family name.
 */
const resolveModelId = (model: ModelInfo, models: ReadonlyArray<ModelInfo>): string => {
  if (model.resolvedModel) return model.resolvedModel
  if (model.value.startsWith("claude-")) return model.value
  const family = model.value.replace(/\[.*\]$/, "")
  return (
    models
      .map((candidate) => candidate.resolvedModel ?? candidate.value)
      .filter((id) => id.startsWith(`claude-${family}-`))
      .sort(compareVersions)[0] ?? model.value
  )
}

const displayModel = (model: ModelInfo, models: ReadonlyArray<ModelInfo>): string => {
  const suffix = model.value.match(/\[.*\]$/)?.[0] ?? ""
  const id = `${resolveModelId(model, models).replace(/\[.*\]$/, "")}${suffix}`
  return claudeModelName(id) ?? model.displayName
}

/**
 * Rows such as `default` or `auto` pick a model on the user's behalf rather than naming one, so
 * they resolve to an id their own value does not appear in. MeldShell picks the model itself, so
 * only rows that name a Claude model — an explicit id, or a family alias like `opus` — are offered.
 */
const namesAModel = (model: ModelInfo, models: ReadonlyArray<ModelInfo>): boolean => {
  const alias = model.value.replace(/\[.*\]$/, "")
  if (alias.startsWith("claude-")) return true
  const id = resolveModelId(model, models)
  return id.startsWith("claude-") && id.split("-").includes(alias)
}

export const claudeModels = (models: ReadonlyArray<ModelInfo>): ProviderModelCatalogEntry[] => {
  const selectable = models.filter((model) => namesAModel(model, models))
  const aliasModels = new Set(
    selectable
      .filter((model) => !model.value.startsWith("claude-"))
      .map((model) => resolveModelId(model, selectable).replace(/-\d{8}$/, "")),
  )
  return selectable
    .filter(
      (model) =>
        !model.value.startsWith("claude-") || !aliasModels.has(model.value.replace(/-\d{8}$/, "")),
    )
    .map((model, index) => ({
      catalogId: model.value,
      slug: model.value,
      displayName: displayModel(model, selectable),
      description: model.description,
      reasoningEfforts: model.supportedEffortLevels ?? [],
      defaultReasoningEffort: model.supportedEffortLevels?.includes("high") ? "high" : null,
      serviceTiers: model.supportsFastMode
        ? [
            {
              id: "fast",
              name: "Fast",
              description: "Lower latency. Uses paid usage credits on subscription plans.",
            },
          ]
        : [],
      defaultServiceTier: null,
      additionalSpeedTiers: [],
      fastServiceTier: model.supportsFastMode ? "fast" : null,
      inputModalities: ["text", "image"],
      supportsPersonality: false,
      isDefault: index === 0,
      hidden: false,
      upgrade: null,
      modelSpecialty: null,
      multiAgentVersion: null,
    }))
}
