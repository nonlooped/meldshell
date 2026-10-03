import { Collapsible } from "@base-ui-components/react/collapsible"
import { CollapsiblePanel } from "../ui/motion"
import { ChevronRight } from "lucide-react"
import type { CanonicalEvent } from "@meldshell/contracts"
import { turnChangePatches } from "./file-change-diffs"
import { diffLineCounts, parseFileDiffs } from "../ui/diff-model"
import { ChangeDiff } from "../ui/ChangeDiff"
import { FileIcon } from "../ui/FileIcon"
import { disclosureChevronClasses } from "../ui/styles"
import { useContext, useState } from "react"
import { MarkdownWorkspace } from "../ui/MarkdownReference"
import { useTabStore } from "../app/tab-store"
import { ContextMenu, MenuAction } from "../ui/controls"

function Counts({ insertions, deletions }: { insertions: number; deletions: number }) {
  return (
    <span
      className="inline-flex gap-[6px] shrink-0 text-[11px] tabular-nums"
      aria-label={`${insertions} insertions, ${deletions} deletions`}
    >
      {insertions > 0 && <span className="text-[var(--color-added)]">+{insertions}</span>}
      {deletions > 0 && <span className="text-[var(--color-deleted)]">−{deletions}</span>}
      <DiffBar insertions={insertions} deletions={deletions} />
    </span>
  )
}

const BAR_BLOCKS = 5

/** The balance of added and removed lines as five blocks, readable before the numbers are. */
function DiffBar({ insertions, deletions }: { insertions: number; deletions: number }) {
  const total = insertions + deletions
  if (total === 0) return null
  const added = Math.round((insertions / total) * BAR_BLOCKS)
  const removed = Math.min(BAR_BLOCKS - added, Math.round((deletions / total) * BAR_BLOCKS))
  return (
    <span className="inline-flex items-center gap-[1px]" aria-hidden="true">
      {Array.from({ length: BAR_BLOCKS }, (_, block) => (
        <span
          key={block}
          className="w-[6px] h-[6px] rounded-[1.5px]"
          style={{
            background:
              block < added
                ? "var(--color-added)"
                : block < added + removed
                  ? "var(--color-deleted)"
                  : "var(--line-strong)",
          }}
        />
      ))}
    </span>
  )
}

/** Long change lists show their first files and fold the rest behind one row. */
const SHOWN_FILES = 5
const FOLD_AFTER = 7

function FileChangeRow({ path, patch }: { path: string; patch: string }) {
  const [open, setOpen] = useState(false)
  const scope = useContext(MarkdownWorkspace)
  const openFile = useTabStore((state) => state.openFile)
  const files = parseFileDiffs(patch)
  const file = files[0]
  const renamed =
    file && file.type !== "add" && file.type !== "delete" && file.oldPath !== file.newPath
  const label = renamed ? `${file.oldPath} → ${path}` : path
  return (
    <Collapsible.Root className="turn-change-file" open={open} onOpenChange={setOpen}>
      <ContextMenu
        trigger={
          <Collapsible.Trigger className={turnChangeTriggerClasses}>
            <ChevronRight size={13} className={disclosureChevronClasses} aria-hidden="true" />
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
        }
      >
        <MenuAction onClick={() => setOpen((value) => !value)}>
          {open ? "Collapse changes" : "Expand changes"}
        </MenuAction>
        {scope && <MenuAction onClick={() => openFile(scope, path)}>Open file</MenuAction>}
        <MenuAction onClick={() => void navigator.clipboard.writeText(path)}>
          Copy file path
        </MenuAction>
        <MenuAction onClick={() => void navigator.clipboard.writeText(patch)}>
          Copy patch
        </MenuAction>
      </ContextMenu>
      <CollapsiblePanel
        className={
          "[&_>_.event-diff]:[margin:4px_0_10px] [&_>_.event-diff]:rounded-[0] [&_>_.event-diff]:border-x-0"
        }
      >
        <ChangeDiff path={path} patch={patch} showHeader={false} />
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

export function TurnChanges({
  events,
  patch: snapshotPatch,
}: {
  events: ReadonlyArray<CanonicalEvent>
  /**
   * The difference between the turn's start and end snapshots. It also covers files changed by
   * shell commands, so it replaces the provider's reported edits whenever it is known.
   */
  patch: string | null
}) {
  const [showAll, setShowAll] = useState(false)
  const patches =
    snapshotPatch === null
      ? turnChangePatches(events)
      : snapshotPatch.trim() === ""
        ? []
        : [{ path: "Turn changes", patch: snapshotPatch }]
  const entries = patches.flatMap(({ path, patch }) => {
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
  const folded = entries.length > FOLD_AFTER
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
      {entries.slice(0, folded ? SHOWN_FILES : undefined).map(({ path, patch }, index) => (
        <FileChangeRow key={`${index}:${path}`} path={path} patch={patch} />
      ))}
      {folded && (
        <Collapsible.Root open={showAll} onOpenChange={setShowAll}>
          <CollapsiblePanel>
            {entries.slice(SHOWN_FILES).map(({ path, patch }, index) => (
              <FileChangeRow key={`${index + SHOWN_FILES}:${path}`} path={path} patch={patch} />
            ))}
          </CollapsiblePanel>
          <Collapsible.Trigger className={turnChangeTriggerClasses}>
            <ChevronRight size={13} className={disclosureChevronClasses} aria-hidden="true" />
            {showAll ? "Show fewer files" : `Show ${entries.length - SHOWN_FILES} more files`}
          </Collapsible.Trigger>
        </Collapsible.Root>
      )}
    </section>
  )
}

const turnChangeTriggerClasses = [
  "flex items-center gap-[8px] min-h-[32px] w-full [padding:4px_6px] border-0 bg-transparent text-left",
  "cursor-pointer rounded-[var(--radius-sm)] text-[var(--text-secondary)] text-[12px]",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]",
  "[&:focus-visible]:[outline:1px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]",
  "[&_>_svg]:shrink-0 [&_.file-icon]:shrink-0",
].join(" ")
