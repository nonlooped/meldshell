import { Fragment, useMemo, useState } from "react"
import { Decoration, Diff, Hunk } from "react-diff-view"
import { ErrorBoundary } from "react-error-boundary"
import { diffLineCounts, parseFileDiffs, type FileDiff } from "./diff-model"
import { diffTokens, visibleDiffHunks } from "./diff-highlighting"
import { FileIcon } from "./FileIcon"
import { Button } from "./controls"
import "react-diff-view/style/index.css"

const pageSize = 400

function FileChanges({ file, showHeader }: { file: FileDiff; showHeader: boolean }) {
  const [limit, setLimit] = useState(pageSize)
  const name = file.type === "delete" ? file.oldPath : file.newPath
  const hunks = useMemo(() => visibleDiffHunks(file.hunks, limit), [file.hunks, limit])
  const tokens = useMemo(() => diffTokens(hunks, name), [hunks, name])
  const total = file.hunks.reduce((count, hunk) => count + hunk.changes.length, 0)
  const { insertions, deletions } = diffLineCounts([file])
  return (
    <section className="event-diff" aria-label={`Changes to ${name}`}>
      {showHeader && (
        <div className="event-diff-header">
          <FileIcon path={name} />
          <span>
            {file.oldPath !== file.newPath && file.type !== "add" && file.type !== "delete"
              ? `${file.oldPath} → ${name}`
              : name}
          </span>
          <span className="diff-insertions">+{insertions}</span>
          <span className="diff-deletions">−{deletions}</span>
        </div>
      )}
      {file.hunks.length === 0 ? (
        <pre className="work-item-output">{file.patch}</pre>
      ) : (
        <Diff viewType="unified" diffType={file.type} hunks={hunks} tokens={tokens}>
          {(visible) =>
            visible.map((hunk, index) => (
              <Fragment key={`${hunk.oldStart}:${hunk.newStart}`}>
                {index > 0 && (
                  <Decoration>
                    <span className="event-diff-range">
                      Lines {hunk.oldStart} → {hunk.newStart}
                    </span>
                  </Decoration>
                )}
                <Hunk hunk={hunk} />
              </Fragment>
            ))
          }
        </Diff>
      )}
      {total > limit && (
        <div className="event-diff-more">
          <Button onClick={() => setLimit((value) => value + pageSize)}>
            Show {Math.min(pageSize, total - limit)} more lines ({total - limit} remaining)
          </Button>
        </div>
      )}
      {(!file.oldEndingNewLine || !file.newEndingNewLine) && (
        <div className="event-diff-note">
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
}: {
  readonly path: string
  readonly patch: string
  readonly showHeader?: boolean
}): React.JSX.Element {
  const files = useMemo(() => parseFileDiffs(patch), [patch])
  const fallback = (
    <pre className="work-item-output">
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
            />
          ))}
    </ErrorBoundary>
  )
}
