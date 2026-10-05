import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { RemoteConnection, RemoteStatus } from "@meldshell/contracts/ipc"

const REMOTE_STATUS_KEY = ["remote-status"] as const

/** Whether this client hears relay changes as they happen, or has to ask. */
const pushed = () => typeof window.meldshell.onRemoteStatus === "function"

/**
 * The host's relay status. The desktop is told about every change and polls only as a safety net;
 * a browser asks the host it is attached to, which does not announce changes to browsers.
 */
export function useRemoteStatus({ enabled = true, poll = true } = {}) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: REMOTE_STATUS_KEY,
    queryFn: () => window.meldshell.getRemoteStatus(),
    enabled,
    refetchInterval: poll ? (pushed() ? 15_000 : 2_000) : false,
  })
  useEffect(() => {
    if (!enabled) return
    return window.meldshell.onRemoteStatus?.((status) =>
      client.setQueryData(REMOTE_STATUS_KEY, status),
    )
  }, [client, enabled])
  return query
}

/** The connection, derived from the sentence for hosts that predate structured status. */
export function remoteConnectionOf(status: RemoteStatus): RemoteConnection {
  if (status.connection !== undefined) return status.connection
  if (!status.linked) return "unlinked"
  if (/revoked/i.test(status.status)) return "revoked"
  if (/^offline/i.test(status.status)) return "offline"
  if (/^online/i.test(status.status)) return "online"
  if (/could not read/i.test(status.status)) return "error"
  return "connecting"
}
