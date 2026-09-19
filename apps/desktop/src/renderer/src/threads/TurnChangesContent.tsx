import { Collapsible } from "@base-ui-components/react/collapsible"
import { ChevronRight } from "lucide-react"
import type { CanonicalEvent } from "@meldshell/contracts"
import { turnChangePatches } from "./file-change-diffs"
import { diffLineCounts, parseFileDiffs } from "../ui/diff-model"
import { ChangeDiff } from "../ui/ChangeDiff"
import { FileIcon } from "../ui/FileIcon"

function Counts({ insertions, deletions }: { insertions: number; deletions: number }) {
  return (
    <span
      className="turn-change-counts"
      aria-label={`${insertions} insertions, ${deletions} deletions`}
    >
      {insertions > 0 && <span className="diff-insertions">+{insertions}</span>}
      {deletions > 0 && <span className="diff-deletions">−{deletions}</span>}
    </span>
  )
}

function FileChangeRow({ path, patch }: { path: string; patch: string }) {
  const files = parseFileDiffs(patch)
  const file = files[0]
  const renamed =
    file && file.type !== "add" && file.type !== "delete" && file.oldPath !== file.newPath
  const label = renamed ? `${file.oldPath} → ${path}` : path
  return (
    <Collapsible.Root className="turn-change-file">
      <Collapsible.Trigger className="turn-change-trigger">
        <ChevronRight size={13} className="disclosure-chevron" aria-hidden="true" />
        <FileIcon path={path} />
        <span className="turn-change-path" title={label}>
          {label}
        </span>
        {file?.type === "add" && <span className="turn-change-kind">Added</span>}
        {file?.type === "delete" && <span className="turn-change-kind">Deleted</span>}
        {files.length > 0 && <Counts {...diffLineCounts(files)} />}
      </Collapsible.Trigger>
      <Collapsible.Panel className="turn-change-panel">
        <ChangeDiff path={path} patch={patch} showHeader={false} />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export function TurnChanges({ events }: { events: ReadonlyArray<CanonicalEvent> }) {
  const entries = turnChangePatches(events).flatMap(({ path, patch }) => {
    const files = parseFileDiffs(patch)
    return files.length > 0
      ? files.map((file) => ({
          path: file.type === "delete" ? file.oldPath : file.newPath,
          patch: file.patch,
        }))
      : [{ path, patch }]
  })
  if (entries.length === 0) return null
  const files = entries.flatMap(({ patch }) => parseFileDiffs(patch))
  const count = new Set(entries.map(({ path }) => path.replaceAll("\\", "/"))).size
  return (
    <section className="turn-changes" aria-label="Turn changes">
      <div className="turn-changes-summary">
        <strong>
          {count} {count === 1 ? "file" : "files"} changed
        </strong>
        {files.length === entries.length && <Counts {...diffLineCounts(files)} />}
      </div>
      {entries.map(({ path, patch }, index) => (
        <FileChangeRow key={`${index}:${path}`} path={path} patch={patch} />
      ))}
    </section>
  )
}
