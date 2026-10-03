import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react"
import {
  getChangeKey,
  type ChangeData,
  type EventMap,
  type HunkData,
  type RenderGutter,
} from "react-diff-view"
import {
  noteLocation,
  useReviewNotes,
  useThreadReviewNotes,
  type ReviewNote,
  type ReviewNoteInput,
} from "../threads/review-notes"
import { Button, IconButton } from "./controls"

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

interface Draft {
  readonly changeKey: string
  /** The note being edited, or null for a new one. */
  readonly noteId: string | null
  readonly side?: "old" | "new"
}

function lineOf(change: ChangeData, side?: "old" | "new") {
  if (change.type === "insert") return { line: change.lineNumber, side: "new" as const }
  if (change.type === "delete") return { line: change.lineNumber, side: "old" as const }
  return side === "old"
    ? { line: change.oldLineNumber, side: "old" as const }
    : { line: change.newLineNumber, side: "new" as const }
}

/**
 * Lets a diff take notes on its lines while it sits inside a {@link DiffReview}: clicking a line
 * number opens a note under that line, and saved notes stay there until they are sent or removed.
 * Returns null outside a review, leaving the diff read-only.
 */
export function useDiffNotes(path: string, patch: string, hunks: ReadonlyArray<HunkData>) {
  const scope = useContext(DiffReview)
  const notes = useThreadReviewNotes(scope?.threadId)
  const [draft, setDraft] = useState<Draft | null>(null)
  if (scope === null) return null
  const { threadId } = scope
  const anchor = scope.anchor ?? patch
  const byChange = new Map<string, ReviewNote[]>()
  for (const note of notes)
    if (note.anchor === anchor && note.path === path)
      byChange.set(note.changeKey, [...(byChange.get(note.changeKey) ?? []), note])
  const changes = new Map(
    hunks.flatMap((hunk) => hunk.changes.map((change) => [getChangeKey(change), change] as const)),
  )

  const open = (change: ChangeData, side?: "old" | "new") =>
    setDraft({ changeKey: getChangeKey(change), noteId: null, side })
  const save = (change: ChangeData, side: "old" | "new" | undefined, body: string) => {
    const store = useReviewNotes.getState()
    if (draft?.noteId) store.edit(threadId, draft.noteId, body)
    else {
      const note: ReviewNoteInput = {
        anchor,
        path,
        changeKey: getChangeKey(change),
        ...lineOf(change, side),
        kind: change.type,
        code: change.content,
        body,
      }
      store.add(threadId, note)
    }
    setDraft(null)
  }

  const widgets: Record<string, ReactNode> = {}
  const widgetKeys = new Set([...byChange.keys(), ...(draft ? [draft.changeKey] : [])])
  for (const key of widgetKeys) {
    const saved = byChange.get(key) ?? []
    const editing = draft?.changeKey === key ? draft : null
    widgets[key] = (
      <NoteThread
        notes={saved}
        editing={editing}
        onEdit={(note) => setDraft({ changeKey: key, noteId: note.id, side: note.side })}
        onRemove={(note) => useReviewNotes.getState().remove(threadId, note.id)}
        onCancel={() => setDraft(null)}
        onSave={(body) => {
          const change = changes.get(key)
          if (change) save(change, editing?.side, body)
        }}
      />
    )
  }

  const gutterEvents: EventMap = {
    onClick: ({ change, side }) => {
      if (change) open(change, side)
    },
  }
  const renderGutter: RenderGutter = ({ change, side, inHoverState, renderDefault }) => {
    const target = lineOf(change, side).side
    const showAdd = inHoverState && side === target && !byChange.has(getChangeKey(change))
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
  return {
    widgets,
    gutterEvents,
    renderGutter,
    /** Opens a note for a line chosen another way, such as from the context menu. */
    open: (changeKey: string) => {
      const change = changes.get(changeKey)
      if (change) open(change)
    },
  }
}

function NoteThread({
  notes,
  editing,
  onEdit,
  onRemove,
  onCancel,
  onSave,
}: {
  notes: ReadonlyArray<ReviewNote>
  editing: Draft | null
  onEdit: (note: ReviewNote) => void
  onRemove: (note: ReviewNote) => void
  onCancel: () => void
  onSave: (body: string) => void
}) {
  return (
    <div className="flex flex-col gap-[6px] [padding:6px_10px_8px_calc(9ch_+_8px)] [font-family:var(--font-text)] whitespace-normal">
      {notes.map((note) =>
        editing?.noteId === note.id ? (
          <NoteEditor key={note.id} initial={note.body} onCancel={onCancel} onSave={onSave} />
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
        <NoteEditor initial="" onCancel={onCancel} onSave={onSave} />
      )}
    </div>
  )
}

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
    <article
      aria-label={`Note on ${noteLocation(note)}`}
      className="group/note flex max-w-[620px] items-start gap-[8px] [padding:7px_6px_7px_10px] border-[1px] border-[color:var(--line-subtle)] border-l-[2px] border-l-[color:var(--accent)] rounded-[var(--radius)] bg-[var(--surface-raised)] text-[12.5px] leading-[1.5] text-[var(--text-primary)]"
    >
      <p className="m-0 min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{note.body}</p>
      <span className="flex flex-none gap-[2px] opacity-0 group-hover/note:opacity-100 group-focus-within/note:opacity-100 motion-colors">
        <IconButton unstyled className={noteButtonClasses} label="Edit note" onClick={onEdit}>
          <Pencil size={12} strokeWidth={1.75} />
        </IconButton>
        <IconButton unstyled className={noteButtonClasses} label="Delete note" onClick={onRemove}>
          <Trash2 size={12} strokeWidth={1.75} />
        </IconButton>
      </span>
    </article>
  )
}

function NoteEditor({
  initial,
  onCancel,
  onSave,
}: {
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
  return (
    <form
      className="flex max-w-[620px] flex-col gap-[6px] [padding:6px] border-[1px] border-[color:var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface-raised)] [&:focus-within]:[border-color:var(--accent)]"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) onSave(body.trim())
      }}
    >
      <textarea
        ref={ref}
        value={body}
        rows={2}
        aria-label="Note for the agent"
        placeholder="Leave a note for the agent on this line…"
        className="min-h-[44px] max-h-[160px] resize-y [padding:4px_6px] border-0 bg-transparent text-[var(--text-primary)] text-[12.5px] leading-[1.5] [font-family:inherit] outline-none placeholder:text-[var(--text-tertiary)]"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            if (ready) onSave(body.trim())
          }
        }}
      />
      <div className="flex items-center justify-end gap-[6px]">
        <span className="mr-auto pl-[6px] text-[var(--text-tertiary)] text-[11px]">
          Sent to the agent with your other notes
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!ready}>
          {initial ? "Save" : "Add note"}
        </Button>
      </div>
    </form>
  )
}

const noteButtonClasses =
  "grid w-[22px] h-[22px] p-0 border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default place-items-center [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]"
