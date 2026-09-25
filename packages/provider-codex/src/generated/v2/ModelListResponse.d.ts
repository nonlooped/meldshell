/* Generated from the checked-in Codex JSON Schema. Run npm run generate:protocol --workspace=@meldshell/provider-codex. */

/**
 * A non-empty reasoning effort value advertised by the model.
 */
export type ReasoningEffort = string
/**
 * Canonical user-input modality tags advertised by a model.
 */
export type InputModality = "text" | "image" | "audio"
/**
 * Multi-agent runtime supported by a model.
 */
export type MultiAgentVersion = "disabled" | "v1" | "v2"

export interface ModelListResponse {
  data: Model[]
  /**
   * Opaque cursor to pass to the next call to continue after the last item. If None, there are no more items to return.
   */
  nextCursor?: string | null
  [k: string]: unknown
}
export interface Model {
  /**
   * Deprecated: use `serviceTiers` instead.
   */
  additionalSpeedTiers?: string[]
  availabilityNux?: ModelAvailabilityNux | null
  defaultReasoningEffort: ReasoningEffort
  /**
   * Catalog default service tier id for this model, when one is configured.
   */
  defaultServiceTier?: string | null
  description: string
  displayName: string
  hidden: boolean
  id: string
  inputModalities?: InputModality[]
  isDefault: boolean
  model: string
  modelSpecialty?: string | null
  /**
   * Multi-agent runtime declared by this model, when available.
   */
  multiAgentVersion?: MultiAgentVersion | null
  serviceTiers?: ModelServiceTier[]
  supportedReasoningEfforts: ReasoningEffortOption[]
  supportsPersonality?: boolean
  upgrade?: string | null
  upgradeInfo?: ModelUpgradeInfo | null
  [k: string]: unknown
}
export interface ModelAvailabilityNux {
  message: string
  [k: string]: unknown
}
export interface ModelServiceTier {
  description: string
  id: string
  name: string
  [k: string]: unknown
}
export interface ReasoningEffortOption {
  description: string
  reasoningEffort: ReasoningEffort
  [k: string]: unknown
}
export interface ModelUpgradeInfo {
  migrationMarkdown?: string | null
  model: string
  modelLink?: string | null
  /**
   * Informational Unix timestamp for this upgrade's scheduled retirement, if known.
   */
  retirementAt?: number | null
  upgradeCopy?: string | null
  [k: string]: unknown
}
