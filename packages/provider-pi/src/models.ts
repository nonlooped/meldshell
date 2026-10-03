import { Result, Schema } from "effect"
import type { ProviderModelCatalogEntry } from "@meldshell/contracts"

/** The fields of Pi's `Model` that MeldShell reads; the rest stays Pi's own. */
const PiModel = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.String,
    name: Schema.optional(Schema.String),
    provider: Schema.String,
    reasoning: Schema.optional(Schema.Boolean),
    input: Schema.optional(Schema.Array(Schema.String)),
    type: Schema.optional(Schema.String),
    thinkingLevelMap: Schema.optional(Schema.Record(Schema.String, Schema.NullOr(Schema.Unknown))),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)
type PiModel = typeof PiModel.Type

const decodeModel = Schema.decodeUnknownResult(PiModel)

/** Pi's thinking levels, least to most; `xhigh` and `max` only exist where a model maps them. */
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const

/** The levels Pi accepts for a model, matching its own `getSupportedThinkingLevels`. */
const thinkingLevels = (model: PiModel): string[] => {
  if (!model.reasoning) return []
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    if (mapped === null) return false
    return level === "xhigh" || level === "max" ? mapped !== undefined : true
  })
}

/** Pi names a model by provider and id; ids may contain slashes, providers do not. */
const modelSlug = (provider: string, id: string): string => `${provider}/${id}`

export const parseModelSlug = (slug: string): { provider: string; modelId: string } => {
  const separator = slug.indexOf("/")
  if (separator <= 0 || separator === slug.length - 1)
    throw new Error(`${slug} is not a Pi model. Refresh the Pi model catalog.`)
  return { provider: slug.slice(0, separator), modelId: slug.slice(separator + 1) }
}

/**
 * The chat models Pi has credentials for, in Pi's order. Pi's current model is the default, and a
 * name offered by several providers carries the provider so the picker can tell them apart.
 */
export const piModels = (
  values: ReadonlyArray<unknown>,
  current: unknown,
): ProviderModelCatalogEntry[] => {
  const models = values.flatMap((value) => {
    const decoded = decodeModel(value)
    return Result.isSuccess(decoded) && (decoded.success.type ?? "chat") === "chat"
      ? [decoded.success]
      : []
  })
  const currentModel = decodeModel(current)
  const currentSlug = Result.isSuccess(currentModel)
    ? modelSlug(currentModel.success.provider, currentModel.success.id)
    : null
  const names = new Map<string, Set<string>>()
  for (const model of models) {
    const name = model.name ?? model.id
    names.set(name, (names.get(name) ?? new Set()).add(model.provider))
  }
  const seen = new Set<string>()
  return models.flatMap((model, index) => {
    const slug = modelSlug(model.provider, model.id)
    if (seen.has(slug)) return []
    seen.add(slug)
    const name = model.name ?? model.id
    const efforts = thinkingLevels(model)
    return [
      {
        catalogId: slug,
        slug,
        displayName: (names.get(name)?.size ?? 0) > 1 ? `${name} (${model.provider})` : name,
        description: `${model.id} via ${model.provider}`,
        reasoningEfforts: efforts,
        defaultReasoningEffort: efforts.includes("medium") ? "medium" : null,
        serviceTiers: [],
        defaultServiceTier: null,
        additionalSpeedTiers: [],
        fastServiceTier: null,
        inputModalities: [...(model.input ?? ["text"])],
        supportsPersonality: false,
        isDefault: currentSlug === null ? index === 0 : slug === currentSlug,
        hidden: false,
        upgrade: null,
        modelSpecialty: null,
        multiAgentVersion: null,
      },
    ]
  })
}
