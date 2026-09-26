import { isHarness, type Harness, type Provider, type ProviderStatus } from "@meldshell/contracts"

/** The launch screen stays up at least this long, so its entrance plays through instead of flashing. */
export const LAUNCH_MIN_MS = 1_000
/** A harness that never reports keeps the app waiting no longer than this. */
export const LAUNCH_MAX_MS = 12_000

export interface LaunchHarness {
  readonly harness: Harness
  /** The first enabled provider on the harness, which lends it an icon. */
  readonly provider: Provider
}

/** The harnesses the enabled providers run on, once each, in catalog order. */
export function launchHarnesses(providers: readonly Provider[]): readonly LaunchHarness[] {
  const byHarness = new Map<Harness, Provider>()
  for (const provider of [...providers].sort((left, right) => left.sortOrder - right.sortOrder)) {
    // An unknown harness reads as Codex, as the host routes it.
    const harness = isHarness(provider.harness) ? provider.harness : "codex"
    if (provider.enabled && !byHarness.has(harness)) byHarness.set(harness, provider)
  }
  return [...byHarness].map(([harness, provider]) => ({ harness, provider }))
}

/** A harness has settled once it reports anything other than probing, or its status cannot be read. */
export const harnessSettled = (status: ProviderStatus | undefined, failed: boolean): boolean =>
  failed || (status !== undefined && status.availability !== "probing")
