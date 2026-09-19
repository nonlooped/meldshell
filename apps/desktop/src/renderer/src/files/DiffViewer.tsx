import { useQuery } from "@tanstack/react-query"
import type { GitDiffSide } from "@meldshell/contracts/ipc"
import type { FileTab } from "../app/tab-store"
import { ChangeDiff } from "../ui/ChangeDiff"
import { FileIcon } from "../ui/FileIcon"
import { Button } from "../ui/controls"

export function DiffViewer({ file, side }: { file: FileTab; side: GitDiffSide }) {
  const query = useQuery({
    queryKey: ["git-diff", file.workspaceId, file.path, side],
    queryFn: () =>
      window.meldshell.getGitDiff({ workspaceId: file.workspaceId, path: file.path, side }),
    refetchInterval: 5000,
    retry: false,
  })

  return (
    <section className="file-viewer" aria-label={`Diff viewer: ${file.path}`}>
      <header className="file-viewer-header">
        <FileIcon path={file.path} />
        <span title={file.path}>
          {file.path} · {side === "staged" ? "Staged" : "Unstaged"} changes
        </span>
        <Button size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </header>
      {query.isPending && (
        <p className="git-notice" role="status">
          Loading diff…
        </p>
      )}
      {query.isError && (
        <p className="git-notice" role="alert">
          {query.error.message}
        </p>
      )}
      {query.data !== undefined && (
        <div
          className="file-diff scrollable"
          tabIndex={0}
          role="region"
          aria-label={`${side} changes to ${file.path}`}
        >
          {query.data.trim() ? (
            <ChangeDiff path={file.path} patch={query.data} />
          ) : (
            <p className="git-notice">No {side} changes remain for this file.</p>
          )}
        </div>
      )}
    </section>
  )
}
