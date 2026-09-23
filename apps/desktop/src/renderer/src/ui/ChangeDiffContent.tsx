import { useMemo, useState } from "react"
import { Decoration, Diff, Hunk } from "react-diff-view"
import { ErrorBoundary } from "react-error-boundary"
import { diffLineCounts, foldDiff, parseFileDiffs, type FileDiff } from "./diff-model"
import { diffTokens, visibleDiffHunks } from "./diff-highlighting"
import { FileIcon } from "./FileIcon"
import { Button } from "./controls"

const pageSize = 400

export type DiffViewType = "unified" | "split"

function FileChanges({
  file,
  showHeader,
  viewType,
}: {
  file: FileDiff
  showHeader: boolean
  viewType: DiffViewType
}) {
  const [limit, setLimit] = useState(pageSize)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const name = file.type === "delete" ? file.oldPath : file.newPath
  const segments = useMemo(() => foldDiff(file.hunks, expanded), [file.hunks, expanded])
  const folded = useMemo(
    () => segments.flatMap((segment) => (segment.kind === "hunk" ? [segment.hunk] : [])),
    [segments],
  )
  const hunks = useMemo(() => visibleDiffHunks(folded, limit), [folded, limit])
  const tokens = useMemo(() => diffTokens(hunks, name), [hunks, name])
  const total = folded.reduce((count, hunk) => count + hunk.changes.length, 0)
  // Segments render in order until the page's last visible hunk.
  let hunkIndex = 0
  const rendered = segments.flatMap((segment, index) => {
    if (hunkIndex >= hunks.length) return []
    if (segment.kind === "gap")
      return [
        <Decoration key={`gap:${index}`}>
          {segment.key === null ? (
            <span className={gapClasses}>⋯ {unchangedLines(segment.lines)}</span>
          ) : (
            <button
              type="button"
              className={`${gapClasses} w-full border-0 text-left cursor-pointer [&:hover]:text-[var(--text-primary)] [&:hover]:bg-[var(--surface-active)]`}
              onClick={() => {
                const key = segment.key
                if (key !== null) setExpanded((previous) => new Set(previous).add(key))
              }}
            >
              ⋯ Show {unchangedLines(segment.lines)}
            </button>
          )}
        </Decoration>,
      ]
    const hunk = hunks[hunkIndex++]!
    return [<Hunk key={`${hunk.oldStart}:${hunk.newStart}`} hunk={hunk} />]
  })
  const { insertions, deletions } = diffLineCounts([file])
  return (
    <section className={eventDiffClasses} aria-label={`Changes to ${name}`}>
      {showHeader && (
        <div className="event-diff-header flex items-center gap-[6px] [padding:7px_10px] border-b-[1px] border-b-[color:var(--line-subtle)] text-[var(--text-secondary)] [overflow-wrap:anywhere] [&_.file-icon]:shrink-0">
          <FileIcon path={name} />
          <span>
            {file.oldPath !== file.newPath && file.type !== "add" && file.type !== "delete"
              ? `${file.oldPath} → ${name}`
              : name}
          </span>
          <span className="text-[var(--color-added)]">+{insertions}</span>
          <span className="text-[var(--color-deleted)]">−{deletions}</span>
        </div>
      )}
      {file.hunks.length === 0 ? (
        <pre className="work-item-output max-h-[220px] m-0 overflow-auto text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[10.75px] leading-[1.55] whitespace-pre-wrap">
          {file.patch}
        </pre>
      ) : (
        <Diff viewType={viewType} diffType={file.type} hunks={hunks} tokens={tokens}>
          {() => rendered}
        </Diff>
      )}
      {total > limit && (
        <div className="[padding:6px_10px] border-t-[1px] border-t-[color:var(--line-subtle)] text-[var(--text-secondary)] text-[11px]">
          <Button onClick={() => setLimit((value) => value + pageSize)}>
            Show {Math.min(pageSize, total - limit)} more lines ({total - limit} remaining)
          </Button>
        </div>
      )}
      {(!file.oldEndingNewLine || !file.newEndingNewLine) && (
        <div className="[padding:6px_10px] border-t-[1px] border-t-[color:var(--line-subtle)] text-[var(--text-secondary)] text-[11px]">
          No newline at end of{" "}
          {!file.oldEndingNewLine && !file.newEndingNewLine
            ? "either version"
            : !file.oldEndingNewLine
              ? "old version"
              : "new version"}
          .
        </div>
      )}
    </section>
  )
}

export function ChangeDiff({
  path,
  patch,
  showHeader = true,
  viewType = "unified",
}: {
  readonly path: string
  readonly patch: string
  readonly showHeader?: boolean
  readonly viewType?: DiffViewType
}): React.JSX.Element {
  const files = useMemo(() => parseFileDiffs(patch), [patch])
  const fallback = (
    <pre className="work-item-output max-h-[220px] m-0 overflow-auto text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[10.75px] leading-[1.55] whitespace-pre-wrap">
      {path}
      {"\n\n"}
      {patch || "No diff was provided for this file."}
    </pre>
  )
  return (
    <ErrorBoundary fallback={fallback} resetKeys={[patch]}>
      {files.length === 0
        ? fallback
        : files.map((file, index) => (
            <FileChanges
              key={`${index}:${file.patch}`}
              file={file}
              showHeader={showHeader || files.length > 1}
              viewType={viewType}
            />
          ))}
    </ErrorBoundary>
  )
}

const unchangedLines = (lines: number): string =>
  `${lines.toLocaleString()} unchanged ${lines === 1 ? "line" : "lines"}`

const gapClasses =
  "block [padding:4px_10px] bg-[var(--surface-hover)] text-[var(--text-tertiary)] [font-family:var(--font-text)] text-[11px]"

const eventDiffClasses = [
  "event-diff [--diff-background-color:transparent] [--diff-text-color:var(--text-primary)]",
  "[--diff-font-family:var(--font-mono)] [--diff-selection-background-color:var(--surface-active)]",
  "[--diff-selection-text-color:var(--text-primary)]",
  "[--diff-code-insert-background-color:color-mix(in_srgb,_var(--color-added)_10%,_transparent)]",
  "[--diff-code-delete-background-color:color-mix(in_srgb,_var(--color-deleted)_10%,_transparent)]",
  "[--diff-gutter-insert-background-color:var(--diff-code-insert-background-color)]",
  "[--diff-gutter-delete-background-color:var(--diff-code-delete-background-color)]",
  "[--diff-gutter-insert-text-color:var(--color-added)]",
  "[--diff-gutter-delete-text-color:var(--color-deleted)]",
  "[--diff-code-insert-edit-background-color:color-mix(in_srgb,_var(--color-added)_24%,_transparent)]",
  "[--diff-code-delete-edit-background-color:color-mix(_in_srgb,_var(--color-deleted)_24%,_transparent_)]",
  "min-w-0 overflow-x-auto border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] text-[12px]",
  "font-normal [&_+_.event-diff]:mt-[8px] [&_pre.work-item-output]:m-0",
  "[&_pre.work-item-output]:whitespace-pre-wrap [&_pre.work-item-output]:[overflow-wrap:anywhere]",
  "[&_.diff]:text-[inherit] [&_.diff]:font-normal [&_.diff-line]:leading-[1.65]",
  "[&_.diff-gutter-col]:w-[4.5ch] [&_.diff-gutter]:px-[0.5ch] [&_.diff-gutter]:cursor-default",
  "[&_.diff-gutter-normal]:text-[var(--text-tertiary)] [&_.diff-code]:relative",
  "[&_.diff-code]:[padding-inline:10px_8px] [&_.diff-code]:whitespace-pre [&_.diff-code]:[overflow-wrap:normal]",
  "[&_.diff-code]:[word-break:normal] [&_.diff-code]:font-normal [&_.diff-code]:[tab-size:2]",
  "[&_.diff-code-insert]:border-l-[2px] [&_.diff-code-insert]:border-l-[color:var(--color-added)]",
  "[&_.diff-code-delete]:border-l-[2px] [&_.diff-code-delete]:border-l-[color:var(--color-deleted)]",
  "[&_.token.comment]:text-[var(--text-tertiary)] [&_.token.prolog]:text-[var(--text-tertiary)]",
  "[&_.token.doctype]:text-[var(--text-tertiary)] [&_.token.keyword]:text-[var(--color-renamed)]",
  "[&_.token.tag]:text-[var(--color-renamed)] [&_.token.boolean]:text-[var(--color-renamed)]",
  "[&_.token.string]:text-[var(--color-added)] [&_.token.attr-value]:text-[var(--color-added)]",
  "[&_.token.number]:text-[var(--color-modified)] [&_.token.function]:text-[var(--color-modified)]",
  "[&_.token.class-name]:text-[var(--color-modified)] [&_.token.property]:text-[var(--color-info)]",
  "[&_.token.attr-name]:text-[var(--color-info)]",
].join(" ")
