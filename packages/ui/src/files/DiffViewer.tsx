import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { WrapText } from "lucide-react"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import type { GitDiffSide } from "@meldshell/contracts/ipc"
import type { FileTab } from "../app/tab-store"
import { ChangeDiff } from "../ui/ChangeDiff"
import type { DiffViewType } from "../ui/ChangeDiffContent"
import { diffLineCounts, parseFileDiffs } from "../ui/diff-model"
import { FileIcon } from "../ui/FileIcon"
import { PanelNote } from "../ui/controls"

export function DiffViewer({ file, side }: { file: FileTab; side: GitDiffSide }) {
  const [viewType, setViewType] = useState<DiffViewType>("unified")
  const [wrap, setWrap] = useState(true)
  // The whole file comes back so unchanged runs can be expanded in place. Git is polled, so the
  // view follows edits without a manual refresh.
  const query = useQuery({
    queryKey: ["git-diff", file.workspaceId, file.threadId ?? null, file.path, side, "full"],
    queryFn: () =>
      window.meldshell.getGitDiff({
        workspaceId: file.workspaceId,
        threadId: file.threadId,
        path: file.path,
        side,
        context: "full",
      }),
    refetchInterval: 5000,
    retry: false,
  })
  const counts = useMemo(
    () => (query.data === undefined ? null : diffLineCounts(parseFileDiffs(query.data))),
    [query.data],
  )
  const slash = file.path.lastIndexOf("/")

  return (
    <section
      className="flex flex-col h-full min-h-0 overflow-hidden"
      aria-label={`Diff viewer: ${file.path}`}
    >
      <header className="flex items-center gap-[10px] min-h-[44px] [padding:6px_12px_6px_16px] border-b-[1px] border-b-[color:var(--line-subtle)]">
        <FileIcon path={file.path} />
        <span className="flex min-w-0 items-baseline gap-[8px]" title={file.path}>
          <span className="shrink-0 text-[var(--text-primary)] text-[13px]">
            {file.path.slice(slash + 1)}
          </span>
          {slash > 0 && (
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)] text-[11.5px]">
              {file.path.slice(0, slash)}
            </span>
          )}
        </span>
        <span className="shrink-0 [padding:1px_7px] rounded-[9px] bg-[var(--surface-active)] text-[var(--text-secondary)] text-[11px]">
          {side === "staged" ? "Staged" : "Unstaged"}
        </span>
        {counts !== null && (
          <span className="shrink-0 flex gap-[6px] text-[12px] tabular-nums [font-family:var(--font-mono)]">
            <span className="text-[var(--color-added)]">+{counts.insertions}</span>
            <span className="text-[var(--color-deleted)]">−{counts.deletions}</span>
          </span>
        )}
        <span className="flex-1" />
        <ToggleGroup
          aria-label="Diff layout"
          value={[viewType]}
          onValueChange={(value) => {
            const next = value[0] as DiffViewType | undefined
            if (next) setViewType(next)
          }}
          className="flex shrink-0 gap-[2px] p-[2px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)]"
        >
          {(["unified", "split"] as const).map((type) => (
            <Toggle key={type} value={type} className={segmentClasses}>
              {type === "unified" ? "Unified" : "Split"}
            </Toggle>
          ))}
        </ToggleGroup>
        <Toggle
          aria-label="Wrap long lines"
          title="Wrap long lines"
          pressed={wrap}
          onPressedChange={setWrap}
          className="grid w-[28px] h-[28px] shrink-0 place-items-center border-[1px] border-[color:transparent] rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)] [&[data-pressed]]:[border-color:var(--line-subtle)] [&[data-pressed]]:bg-[var(--surface-selected)] [&[data-pressed]]:text-[var(--text-primary)]"
        >
          <WrapText size={15} strokeWidth={1.75} aria-hidden="true" />
        </Toggle>
      </header>
      {query.isPending && <PanelNote role="status">Loading diff…</PanelNote>}
      {query.isError && <PanelNote role="alert">{query.error.message}</PanelNote>}
      {query.data !== undefined && (
        <div
          className={`flex-1 min-h-0 min-w-0 overflow-auto p-[16px] [&_.event-diff]:overflow-visible [&_.event-diff]:w-full [&_.event-diff]:max-w-full [&_.event-diff-header_>_span]:min-w-0 overflow-y-auto [scrollbar-gutter:stable] ${wrap ? wrapClasses : ""}`}
          tabIndex={0}
          role="region"
          aria-label={`${side} changes to ${file.path}`}
        >
          {query.data.trim() ? (
            <ChangeDiff
              path={file.path}
              patch={query.data}
              showHeader={false}
              viewType={viewType}
            />
          ) : (
            <PanelNote>No {side} changes remain for this file.</PanelNote>
          )}
        </div>
      )}
    </section>
  )
}

// Wrapped lines hang under their first line so a continuation never reads as a new line.
const wrapClasses = [
  "[&_.diff-code]:whitespace-pre-wrap [&_.diff-code]:[overflow-wrap:anywhere]",
  "[&_.diff-code]:[padding-inline-start:calc(10px_+_4ch)]! [&_.diff-code]:[text-indent:-4ch]",
].join(" ")

const segmentClasses = [
  "h-[22px] [padding:0_9px] border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)]",
  "text-[11.5px] cursor-default [&:hover]:text-[var(--text-primary)]",
  "[&[data-pressed]]:bg-[var(--surface-selected)] [&[data-pressed]]:text-[var(--text-primary)]",
].join(" ")
