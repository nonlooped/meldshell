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
      className="inline-flex gap-[6px] shrink-0 text-[11px] tabular-nums"
      aria-label={`${insertions} insertions, ${deletions} deletions`}
    >
      {insertions > 0 && <span className="text-[var(--color-added)]">+{insertions}</span>}
      {deletions > 0 && <span className="text-[var(--color-deleted)]">−{deletions}</span>}
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
      <Collapsible.Trigger className={turnChangeTriggerClasses}>
        <ChevronRight
          data-motion="transform background-color"
          data-motion-duration="0.2"
          size={13}
          className={
            "disclosure-chevron flex-none [[data-panel-open]_>_&]:[transform:rotate(90deg)]"
          }
          aria-hidden="true"
        />
        <FileIcon path={path} />
        <span
          className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
          title={label}
        >
          {label}
        </span>
        {file?.type === "add" && (
          <span className="text-[var(--text-tertiary)] text-[11px]">Added</span>
        )}
        {file?.type === "delete" && (
          <span className="text-[var(--text-tertiary)] text-[11px]">Deleted</span>
        )}
        {files.length > 0 && <Counts {...diffLineCounts(files)} />}
      </Collapsible.Trigger>
      <Collapsible.Panel
        className={
          "[&_>_.event-diff]:[margin:4px_0_10px] [&_>_.event-diff]:rounded-[0] [&_>_.event-diff]:border-x-0"
        }
      >
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
    <section
      className="turn-changes border-t-[1px] border-t-[color:var(--line-subtle)] pt-[10px] min-w-0"
      aria-label="Turn changes"
    >
      <div className="flex items-center gap-[12px] mb-[6px] text-[0.9em] [&_strong]:font-medium">
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

const turnChangeTriggerClasses = [
  "flex items-center gap-[8px] min-h-[32px] w-full [padding:4px_6px] border-0 bg-transparent text-left",
  "cursor-pointer rounded-[var(--radius-sm)] text-[var(--text-secondary)] text-[12px]",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]",
  "[&:focus-visible]:[outline:1px_solid_var(--accent)] [&:focus-visible]:[outline-offset:2px]",
  "[&_>_svg]:shrink-0 [&_.file-icon]:shrink-0",
].join(" ")
