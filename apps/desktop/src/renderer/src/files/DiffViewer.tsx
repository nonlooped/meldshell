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
    <section
      className="flex flex-col h-full min-h-0 overflow-hidden"
      aria-label={`Diff viewer: ${file.path}`}
    >
      <header className="flex items-center gap-[8px] [padding:10px_16px] border-b-[1px] border-b-[color:var(--line)] [&_span]:flex-1 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap">
        <FileIcon path={file.path} />
        <span title={file.path}>
          {file.path} · {side === "staged" ? "Staged" : "Unstaged"} changes
        </span>
        <Button size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </header>
      {query.isPending && (
        <p
          className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
          role="status"
        >
          Loading diff…
        </p>
      )}
      {query.isError && (
        <p
          className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
          role="alert"
        >
          {query.error.message}
        </p>
      )}
      {query.data !== undefined && (
        <div
          className={
            "flex-1 min-h-0 min-w-0 overflow-auto p-[16px] [&_.event-diff]:overflow-visible [&_.event-diff]:w-full [&_.event-diff]:max-w-full [&_.diff-code]:whitespace-pre-wrap [&_.diff-code]:[overflow-wrap:anywhere] [&_.event-diff-header_>_span]:min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
          }
          tabIndex={0}
          role="region"
          aria-label={`${side} changes to ${file.path}`}
        >
          {query.data.trim() ? (
            <ChangeDiff path={file.path} patch={query.data} />
          ) : (
            <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
              No {side} changes remain for this file.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
