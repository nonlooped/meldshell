import { useQuery } from "@tanstack/react-query"
import type { AppSnapshot, ProviderStatus } from "@meldshell/contracts"
import { resolveSelection } from "./catalog"
import { queryKeys } from "./cache"

export const providerStatusQuery = (harness: string) => ({
  queryKey: queryKeys.providerStatus(harness),
  queryFn: (): Promise<ProviderStatus> =>
    harness === "cursor"
      ? window.meldshell.getCursorStatus()
      : harness === "claude-code"
        ? window.meldshell.getClaudeStatus()
        : window.meldshell.getCodexStatus(),
})

export const refreshProviderStatus = (harness: string) =>
  harness === "cursor"
    ? window.meldshell.refreshCursorStatus()
    : harness === "claude-code"
      ? window.meldshell.refreshClaudeStatus()
      : window.meldshell.refreshCodexStatus()

function probingStatus(harness: string): ProviderStatus {
  const isCursor = harness === "cursor"
  const isClaude = harness === "claude-code"
  return {
    ...(isCursor
      ? { provider: "cursor" as const, harness: "cursor" as const }
      : isClaude
        ? { provider: "anthropic" as const, harness: "claude-code" as const }
        : { provider: "openai" as const, harness: "codex" as const }),
    availability: "probing",
    executablePath: null,
    version: null,
    detail: isCursor
      ? "Connecting to Cursor CLI…"
      : isClaude
        ? "Connecting to Claude Code..."
        : "Looking for Codex on PATH…",
    checkedAt: new Date().toISOString(),
  }
}

export function useSelectedProvider(snapshot: AppSnapshot, threadId: string | null) {
  const harness = resolveSelection(snapshot, threadId ?? "")?.provider.harness ?? "codex"
  const status = useQuery(providerStatusQuery(harness))
  const providerStatus = status.data ?? probingStatus(harness)
  return {
    isClaude: harness === "claude-code",
    isCursor: harness === "cursor",
    providerStatus,
    providerReady: providerStatus.availability === "ready",
  }
}
