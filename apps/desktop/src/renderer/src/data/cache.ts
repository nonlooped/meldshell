import type { AppSnapshot } from "@meldshell/contracts"
import type { QueryClient } from "@tanstack/react-query"

export const queryKeys = {
  snapshot: ["snapshot"] as const,
  threads: ["threads"] as const,
  search: ["transcript-search"] as const,
  transcript: (threadId: string) => ["transcript", threadId] as const,
  providerStatus: (harness: string) =>
    [
      harness === "cursor"
        ? "cursor-status"
        : harness === "claude-code"
          ? "claude-status"
          : "codex-status",
    ] as const,
}

export function replaceSnapshot(client: QueryClient, snapshot: AppSnapshot): void {
  client.setQueryData(queryKeys.snapshot, snapshot)
  void client.invalidateQueries({ queryKey: queryKeys.threads })
}

export function invalidateThread(
  client: QueryClient,
  threadId: string,
  snapshotChanged = true,
): void {
  if (snapshotChanged) {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot })
    void client.invalidateQueries({ queryKey: queryKeys.threads })
  }
  void client.invalidateQueries({ queryKey: queryKeys.transcript(threadId) })
}

export function forgetThreads(client: QueryClient, threadIds: readonly string[]): void {
  client.removeQueries({ queryKey: queryKeys.search })
  for (const id of threadIds) client.removeQueries({ queryKey: queryKeys.transcript(id) })
  client.setQueryData(queryKeys.threads, { pages: [], pageParams: [] })
}
