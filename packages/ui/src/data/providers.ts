import { useQuery } from "@tanstack/react-query"
import {
  isHarness,
  probingStatus,
  type AppSnapshot,
  type CodexUsage,
  type Harness,
  type ProviderStatus,
} from "@meldshell/contracts"
import { resolveSelection } from "./catalog"
import { queryKeys } from "./cache"

interface HarnessApi {
  readonly getStatus: () => Promise<ProviderStatus>
  readonly refreshStatus: () => Promise<void>
  readonly getUsage: () => Promise<CodexUsage>
}

// Each harness keeps its own IPC channels: a remote client may talk to an older host.
const harnessApis: { readonly [Key in Harness]: HarnessApi } = {
  codex: {
    getStatus: () => window.meldshell.getCodexStatus(),
    refreshStatus: () => window.meldshell.refreshCodexStatus(),
    getUsage: () => window.meldshell.getCodexUsage(),
  },
  "claude-code": {
    getStatus: () => window.meldshell.getClaudeStatus(),
    refreshStatus: () => window.meldshell.refreshClaudeStatus(),
    getUsage: () => window.meldshell.getClaudeUsage(),
  },
  cursor: {
    getStatus: () => window.meldshell.getCursorStatus(),
    refreshStatus: () => window.meldshell.refreshCursorStatus(),
    getUsage: () => window.meldshell.getCursorUsage(),
  },
}

/** A provider's harness; an unknown one reads as Codex, as the host routes it. */
export const knownHarness = (harness: string | undefined): Harness =>
  isHarness(harness) ? harness : "codex"

export const harnessApi = (harness: string): HarnessApi => harnessApis[knownHarness(harness)]

export const providerStatusQuery = (harness: string) => ({
  queryKey: queryKeys.providerStatus(harness),
  queryFn: harnessApi(harness).getStatus,
})

export const refreshProviderStatus = (harness: string) => harnessApi(harness).refreshStatus()

export function useSelectedProvider(snapshot: AppSnapshot, threadId: string | null) {
  const harness = knownHarness(resolveSelection(snapshot, threadId ?? "")?.provider.harness)
  const status = useQuery(providerStatusQuery(harness))
  const providerStatus = status.data ?? probingStatus(harness)
  return {
    harness,
    providerStatus,
    providerReady: providerStatus.availability === "ready",
  }
}
