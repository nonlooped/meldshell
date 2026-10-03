import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { motion } from "motion/react"
import { MessageSquarePlus, MessageSquareText, Pencil, Trash2 } from "lucide-react"
import {
  getChangeKey,
  type ChangeData,
  type EventMap,
  type HunkData,
  type RenderGutter,
} from "react-diff-view"
import {
  noteLines,
  noteLocation,
  useReviewNotes,
  useThreadReviewNotes,
  type ReviewNote,
  type ReviewNoteInput,
} from "../threads/review-notes"
import { Button, IconButton } from "./controls"
import { useMotionPreference } from "./motion"
import { cx } from "./styles"

/**
 * The thread that notes on diff lines go back to. `anchor` names the diff when it outlives its
 * patch, such as a working-tree diff that refreshes as files change; otherwise the patch itself is
 * the anchor, so a note shows only beside the version of the change it was written on.
 */
const DiffReview = createContext<{ threadId: string; anchor?: string } | null>(null)

/** Diffs inside take notes for `threadId`. */
export function DiffReviewScope({
  threadId,
  anchor,
  children,
}: {
  threadId: string | undefined
  anchor?: string
  children: ReactNode
}) {
  const value = useMemo(
    () => (threadId === undefined ? null : { threadId, anchor }),
    [threadId, anchor],
  )
  return <DiffReview value={value}>{children}</DiffReview>
}

type Side = "old" | "new"

interface Draft {
  /** The lines the note covers, in diff order. */
  readonly keys: ReadonlyArray<string>
  /** The note being edited, or null for a new one. */
  readonly noteId: string | null
  readonly side?: Side
}

/** A drag down the line numbers, from the line pressed to the line under the pointer. */
interface Selecting {
  readonly from: string
  readonly to: string
  readonly side?: Side
}

const marker = { insert: "+", delete: "-", normal: " " } as const

function lineOf(change: ChangeData, side?: Side) {
  if (change.type === "insert") return { line: change.lineNumber, side: "new" as const }
  if (change.type === "delete") return { line: change.lineNumber, side: "old" as const }
  return side === "old"
    ? { line: change.oldLineNumber, side: "old" as const }
    : { line: change.newLineNumber, side: "new" as const }
}

/** Line numbers for a run of lines: the new version's, unless every line was removed. */
function rangeOf(lines: ReadonlyArray<ChangeData>, side?: Side) {
  if (lines.length === 1) {
    const { line, side: counted } = lineOf(lines[0]!, side)
    return { startLine: line, line, side: counted }
  }
  const kept = lines.filter((change) => change.type !== "delete")
  const counted = kept.length === 0 ? lines : kept
  const first = lineOf(counted[0]!, "new")
  const last = lineOf(counted.at(-1)!, "new")
  return { startLine: first.line, line: last.line, side: first.side }
}

/** Saved notes under the last line each covers, and every line that carries one. */
function placeNotes(notes: ReadonlyArray<ReviewNote>, changes: ReadonlyMap<string, ChangeData>) {
  const byChange = new Map<string, ReviewNote[]>()
  const noted = new Set<string>()
  for (const note of notes) {
    const last = note.changeKeys.at(-1)
    if (last === undefined || !changes.has(last)) continue
    byChange.set(last, [...(byChange.get(last) ?? []), note])
    for (const key of note.changeKeys) noted.add(key)
  }
  return { byChange, noted }
}

function newNote(
  anchor: string,
  path: string,
  lines: ReadonlyArray<ChangeData>,
  side: Side | undefined,
  body: string,
): ReviewNoteInput {
  return {
    anchor,
    path,
    changeKeys: lines.map(getChangeKey),
    ...rangeOf(lines, side),
    snippet: lines.map((change) => `${marker[change.type]}${change.content}`).join("\n"),
    body,
  }
}

/**
 * Lets a diff take notes on its lines while it sits inside a {@link DiffReviewScope}. Pressing a
 * line number opens a note under that line, dragging down the numbers (or Shift-clicking) covers a
 * run of lines, and saved notes stay under their lines until they are sent or removed. Returns
 * null outside a review, leaving the diff read-only.
 */
export function useDiffNotes(path: string, patch: string, hunks: ReadonlyArray<HunkData>) {
  const scope = useContext(DiffReview)
  const notes = useThreadReviewNotes(scope?.threadId)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [selecting, setSelecting] = useState<Selecting | null>(null)
  const order = useMemo(() => hunks.flatMap((hunk) => hunk.changes), [hunks])
  const range = (from: string, to: string): string[] => {
    const keys = order.map(getChangeKey)
    const start = keys.indexOf(from)
    const end = keys.indexOf(to)
    if (start < 0 || end < 0) return [to]
    return keys.slice(Math.min(start, end), Math.max(start, end) + 1)
  }
  // The drag ends wherever the button is released, even outside the diff.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The range reads the current hunks.
  useEffect(() => {
    if (selecting === null) return
    const finish = () => {
      setDraft({ keys: range(selecting.from, selecting.to), noteId: null, side: selecting.side })
      setSelecting(null)
    }
    window.addEventListener("mouseup", finish, { once: true })
    return () => window.removeEventListener("mouseup", finish)
  }, [selecting])
  if (scope === null) return null
  const { threadId } = scope
  const anchor = scope.anchor ?? patch
  const changes = new Map(order.map((change) => [getChangeKey(change), change] as const))
  const { byChange, noted } = placeNotes(
    notes.filter((note) => note.anchor === anchor && note.path === path),
    changes,
  )

  const save = (body: string) => {
    if (draft === null) return
    const store = useReviewNotes.getState()
    if (draft.noteId) store.edit(threadId, draft.noteId, body)
    else {
      const lines = draft.keys.flatMap((key) => changes.get(key) ?? [])
      if (lines.length > 0) store.add(threadId, newNote(anchor, path, lines, draft.side, body))
    }
    setDraft(null)
  }

  const draftEnd = draft?.keys.at(-1)
  const widgets: Record<string, ReactNode> = {}
  for (const key of new Set([...byChange.keys(), ...(draftEnd ? [draftEnd] : [])])) {
    const editing = draftEnd === key ? draft : null
    widgets[key] = (
      <NoteThread
        notes={byChange.get(key) ?? []}
        editing={editing}
        lines={
          editing?.noteId === null
            ? noteLines(
                rangeOf(
                  editing.keys.flatMap((k) => changes.get(k) ?? []),
                  editing.side,
                ),
              )
            : ""
        }
        onEdit={(note) => setDraft({ keys: note.changeKeys, noteId: note.id, side: note.side })}
        onRemove={(note) => useReviewNotes.getState().remove(threadId, note.id)}
        onCancel={() => setDraft(null)}
        onSave={save}
      />
    )
  }

  const gutterEvents: EventMap = {
    onMouseDown: ({ change, side }, event) => {
      if (change === null || event.button !== 0) return
      // Keep the press from starting a text selection across the code.
      event.preventDefault()
      const key = getChangeKey(change)
      const start = draft?.noteId === null ? draft.keys[0] : undefined
      if (event.shiftKey && start !== undefined)
        setDraft({ keys: range(start, key), noteId: null, side: draft?.side })
      else setSelecting({ from: key, to: key, side })
    },
    onMouseEnter: ({ change }) => {
      if (change !== null && selecting !== null)
        setSelecting({ ...selecting, to: getChangeKey(change) })
    },
  }
  const codeEvents: EventMap = { onMouseEnter: gutterEvents.onMouseEnter }
  const renderGutter: RenderGutter = ({ change, side, inHoverState, renderDefault }) => {
    const key = getChangeKey(change)
    const showAdd =
      selecting === null &&
      inHoverState &&
      side === lineOf(change, side).side &&
      !noted.has(key) &&
      !draft?.keys.includes(key)
    // The hovered line's number gives way to the note button, so the click target reads as one.
    if (!showAdd) return renderDefault()
    return (
      <span
        aria-hidden="true"
        className="inline-grid w-[17px] h-[17px] align-middle place-items-center rounded-[5px] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_1px_2px_rgb(0_0_0_/_0.25)]"
      >
        <MessageSquarePlus size={11} strokeWidth={2.25} />
      </span>
    )
  }
  const selected = selecting ? range(selecting.from, selecting.to) : draft ? [...draft.keys] : []
  return {
    widgets,
    gutterEvents,
    codeEvents,
    renderGutter,
    selectedChanges: selected,
    /** Marks lines that carry a saved note, so each note reads against the code it is about. */
    generateLineClassName: ({
      changes: line,
      defaultGenerate,
    }: {
      changes: ChangeData[]
      defaultGenerate: () => string
    }) =>
      cx(defaultGenerate(), line.some((change) => noted.has(getChangeKey(change))) && "diff-noted"),
    /** Opens a note for a line chosen another way, such as from the context menu. */
    open: (changeKey: string) => {
      if (changes.has(changeKey)) setDraft({ keys: [changeKey], noteId: null })
    },
  }
}

function NoteThread({
  notes,
  editing,
  lines,
  onEdit,
  onRemove,
  onCancel,
  onSave,
}: {
  notes: ReadonlyArray<ReviewNote>
  editing: Draft | null
  /** The lines a new note covers. */
  lines: string
  onEdit: (note: ReviewNote) => void
  onRemove: (note: ReviewNote) => void
  onCancel: () => void
  onSave: (body: string) => void
}) {
  return (
    <div className="flex flex-col gap-[6px] [padding:6px_10px_8px_calc(9ch_+_8px)] [font-family:var(--font-text)] whitespace-normal">
      {notes.map((note) =>
        editing?.noteId === note.id ? (
          <NoteEditor
            key={note.id}
            lines={noteLines(note)}
            initial={note.body}
            onCancel={onCancel}
            onSave={onSave}
          />
        ) : (
          <NoteCard
            key={note.id}
            note={note}
            onEdit={() => onEdit(note)}
            onRemove={() => onRemove(note)}
          />
        ),
      )}
      {editing !== null && editing.noteId === null && (
        <NoteEditor lines={lines} initial="" onCancel={onCancel} onSave={onSave} />
      )}
    </div>
  )
}

/** Notes rise in under their line; Reduce motion shows them in place. */
function Rise({ className, children }: { className: string; children: ReactNode }) {
  const reduced = useMotionPreference()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: -4, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

const linesLabel = (lines: string) => (lines.includes("-") ? `Lines ${lines}` : `Line ${lines}`)

function NoteCard({
  note,
  onEdit,
  onRemove,
}: {
  note: ReviewNote
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <Rise className="max-w-[620px]">
      <article
        id={`review-note-${note.id}`}
        aria-label={`Note on ${noteLocation(note)}`}
        className="group/note [padding:6px_6px_8px_10px] border-[1px] border-[color:var(--line-subtle)] border-l-[2px] border-l-[color:var(--accent)] rounded-[var(--radius)] bg-[var(--surface-raised)] text-[12.5px] leading-[1.5] text-[var(--text-primary)] scroll-m-[80px] [&[data-flash]]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent)_30%,_transparent)] motion-colors"
      >
        <header className="flex h-[22px] items-center gap-[6px] text-[var(--text-tertiary)] text-[11px]">
          <MessageSquareText
            size={12}
            strokeWidth={1.75}
            className="text-[var(--accent)]"
            aria-hidden="true"
          />
          <span className="flex-1">{linesLabel(noteLines(note))}</span>
          <span className="flex gap-[2px] opacity-0 group-hover/note:opacity-100 group-focus-within/note:opacity-100 motion-colors">
            <IconButton unstyled className={noteButtonClasses} label="Edit note" onClick={onEdit}>
              <Pencil size={12} strokeWidth={1.75} />
            </IconButton>
            <IconButton
              unstyled
              className={noteButtonClasses}
              label="Delete note"
              onClick={onRemove}
            >
              <Trash2 size={12} strokeWidth={1.75} />
            </IconButton>
          </span>
        </header>
        <p className="m-0 pr-[4px] whitespace-pre-wrap [overflow-wrap:anywhere]">{note.body}</p>
      </article>
    </Rise>
  )
}

function NoteEditor({
  lines,
  initial,
  onCancel,
  onSave,
}: {
  lines: string
  initial: string
  onCancel: () => void
  onSave: (body: string) => void
}) {
  const [body, setBody] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const textarea = ref.current
    textarea?.focus({ preventScroll: true })
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length)
  }, [])
  const ready = body.trim().length > 0
  const modifier = window.meldshell?.platform === "darwin" ? "⌘" : "Ctrl"
  return (
    <Rise className="max-w-[620px]">
      <form
        className="flex flex-col gap-[4px] [padding:6px] border-[1px] border-[color:var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface-raised)] shadow-[0_6px_18px_-10px_rgb(0_0_0_/_0.45)] motion-colors [&:focus-within]:[border-color:var(--accent)] [&:focus-within]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent)_18%,_transparent),0_6px_18px_-10px_rgb(0_0_0_/_0.45)]"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) onSave(body.trim())
        }}
      >
        {lines && (
          <span className="flex items-center gap-[6px] [padding:0_6px] h-[20px] text-[var(--text-tertiary)] text-[11px]">
            <MessageSquarePlus
              size={12}
              strokeWidth={1.75}
              className="text-[var(--accent)]"
              aria-hidden="true"
            />
            New note on {linesLabel(lines).toLowerCase()}
          </span>
        )}
        <textarea
          ref={ref}
          value={body}
          rows={2}
          aria-label="Note for the agent"
          placeholder="What should the agent change here?"
          className="min-h-[44px] max-h-[200px] resize-none [field-sizing:content] [padding:4px_6px] border-0 bg-transparent text-[var(--text-primary)] text-[12.5px] leading-[1.5] [font-family:inherit] outline-none placeholder:text-[var(--text-tertiary)]"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              onCancel()
            } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              if (ready) onSave(body.trim())
            }
          }}
        />
        <div className="flex items-center justify-end gap-[6px]">
          <span className="mr-auto pl-[6px] text-[var(--text-tertiary)] text-[11px]">
            <kbd className={kbdClasses}>{modifier}</kbd> <kbd className={kbdClasses}>↵</kbd>{" "}
            {initial ? "to save" : "to add"} · <kbd className={kbdClasses}>Esc</kbd> to cancel
          </span>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={!ready}>
            {initial ? "Save" : "Add note"}
          </Button>
        </div>
      </form>
    </Rise>
  )
}

/** Scrolls a saved note into view and pulses its outline, when its diff is on screen. */
export function revealNote(id: string, reduced: boolean): boolean {
  const element = document.getElementById(`review-note-${id}`)
  if (element === null) return false
  element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })
  element.setAttribute("data-flash", "")
  window.setTimeout(() => element.removeAttribute("data-flash"), 900)
  return true
}

const kbdClasses =
  "inline-grid min-w-[16px] h-[16px] [padding:0_3px] place-items-center rounded-[4px] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)] [font-family:inherit] text-[10px] leading-none"

const noteButtonClasses =
  "grid w-[22px] h-[22px] p-0 border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default place-items-center [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]"
