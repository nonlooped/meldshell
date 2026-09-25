import type { AppSnapshot } from "@meldshell/contracts"
import type { QueryClient } from "@tanstack/react-query"

export const queryKeys = {
  snapshot: ["snapshot"] as const,
  threads: ["threads"] as const,
  search: ["transcript-search"] as const,
  schedules: ["schedules"] as const,
  transcript: (threadId: string) => ["transcript", threadId] as const,
  providerStatus: (harness: string) => ["provider-status", harness] as const,
  providerUpdate: (harness: string) => ["provider-update", harness] as const,
  providerUsage: (harness: string) => ["provider-usage", harness] as const,
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
  if (threadId === "*") {
    // A remote client reconnected; open transcripts may have missed changes.
    void client.invalidateQueries()
    return
  }
  if (snapshotChanged) {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot })
    void client.invalidateQueries({ queryKey: queryKeys.threads })
    // Scheduled runs and edits from other clients arrive as host-wide changes.
    void client.invalidateQueries({ queryKey: queryKeys.schedules })
  }
  void client.invalidateQueries({ queryKey: queryKeys.transcript(threadId) })
}

export function forgetThreads(client: QueryClient, threadIds: readonly string[]): void {
  client.removeQueries({ queryKey: queryKeys.search })
  for (const id of threadIds) client.removeQueries({ queryKey: queryKeys.transcript(id) })
  client.setQueryData(queryKeys.threads, { pages: [], pageParams: [] })
}
