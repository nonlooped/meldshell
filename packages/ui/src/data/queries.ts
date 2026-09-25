import { useEffect } from "react"
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { CURRENT_TITLE_MODEL, type AppSnapshot } from "@meldshell/contracts"
import { queryKeys, invalidateThread } from "./cache"

const emptySnapshot: AppSnapshot = {
  workspaces: [],
  threads: [],
  providers: [],
  models: [],
  threadSettings: [],
  approvals: [],
  settings: { titleModelId: CURRENT_TITLE_MODEL },
}

export function useAppData() {
  const client = useQueryClient()
  const snapshotQuery = useQuery({
    queryKey: queryKeys.snapshot,
    queryFn: () => window.meldshell.getSnapshot(),
  })
  const threadPagesQuery = useInfiniteQuery({
    queryKey: queryKeys.threads,
    queryFn: ({ pageParam }) => window.meldshell.listThreads({ cursor: pageParam, limit: 100 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const snapshot = snapshotQuery.data ?? emptySnapshot

  useEffect(
    () =>
      window.meldshell.onProviderStatus((status) => {
        client.setQueryData(queryKeys.providerStatus(status.harness), status)
      }),
    [client],
  )
  useEffect(
    () =>
      window.meldshell.onRuntimeChanged((id, snapshotChanged) =>
        invalidateThread(client, id, snapshotChanged),
      ),
    [client],
  )
  return { snapshotQuery, threadPagesQuery, snapshot }
}
