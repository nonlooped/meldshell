import { useQuery } from "@tanstack/react-query"

/**
 * The scripts in a workspace's `meldshell.json`. The file can change at any time outside
 * MeldShell, so it is read again whenever the window regains focus.
 */
export function useWorkspaceScripts(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-scripts", workspaceId],
    queryFn: () => window.meldshell.getWorkspaceScripts({ workspaceId: workspaceId! }),
    enabled: workspaceId !== undefined,
    staleTime: 5_000,
    refetchOnWindowFocus: "always",
    retry: false,
  })
}
