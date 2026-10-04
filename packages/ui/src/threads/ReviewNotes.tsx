import { AnimatePresence, motion } from "motion/react"
import { MessageSquareText, SendHorizontal, X } from "lucide-react"
import { useState } from "react"
import { Button, IconButton } from "../ui/controls"
import { useMotionPreference } from "../ui/motion"
import { rowIconButtonClasses, rowTextButtonClasses } from "../ui/styles"
import { revealNote } from "../ui/DiffNotes"
import {
  noteLines,
  noteLocation,
  useReviewNotes,
  useThreadReviewNotes,
  type ReviewNote,
} from "./review-notes"

/**
 * The notes left on this thread's diff lines, sent back to the agent together as one follow-up.
 * Shows nothing until a note exists.
 */
export function ReviewNotes({
  threadId,
  blocked,
  onSend,
}: {
  threadId: string
  /** Why the agent cannot take a message right now, or null when it can. */
  blocked: string | null
  /** Resolves once the follow-up is accepted; the notes stay if it fails. */
  onSend: (notes: ReadonlyArray<ReviewNote>) => Promise<void>
}): React.JSX.Element | null {
  const notes = useThreadReviewNotes(threadId)
  const [sending, setSending] = useState(false)
  if (notes.length === 0) return null
  const files = new Set(notes.map((note) => note.path)).size
  const send = async () => {
    setSending(true)
    try {
      await onSend(notes)
      useReviewNotes.getState().clear(
        threadId,
        notes.map((note) => note.id),
      )
    } catch {
      // The thread shows the error; the notes stay so they can be sent again.
    } finally {
      setSending(false)
    }
  }
  return (
    <section
      aria-label="Review notes"
      className="w-full max-w-[860px] [margin:0_auto_6px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-hover)]"
    >
      <header className="flex items-center gap-[8px] h-[30px] [padding:0_4px_0_10px] text-[var(--text-tertiary)] text-[11px]">
        <MessageSquareText
          size={13}
          strokeWidth={1.75}
          className="flex-none text-[var(--accent)]"
          aria-hidden="true"
        />
        <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {notes.length} {notes.length === 1 ? "note" : "notes"} on {files}{" "}
          {files === 1 ? "file" : "files"} · sent together as one follow-up
        </span>
        <button
          type="button"
          className={rowTextButtonClasses}
          disabled={sending}
          onClick={() => useReviewNotes.getState().clear(threadId)}
        >
          Discard
        </button>
        <Button
          size="sm"
          variant="primary"
          className="h-[22px]! text-[11px]! [padding:0_8px]!"
          icon={<SendHorizontal size={11} strokeWidth={2} aria-hidden="true" />}
          disabled={blocked !== null || sending}
          title={
            blocked ?? `Send ${notes.length === 1 ? "this note" : "these notes"} as one message`
          }
          onClick={() => void send()}
        >
          {sending ? "Sending…" : "Send to agent"}
        </Button>
      </header>
      <ul className="m-0 [padding:0_4px_4px] list-none max-h-[132px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {notes.map((note) => (
            <NoteRow key={note.id} threadId={threadId} note={note} disabled={sending} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}

function NoteRow({
  threadId,
  note,
  disabled,
}: {
  threadId: string
  note: ReviewNote
  disabled: boolean
}): React.JSX.Element {
  const reduced = useMotionPreference()
  const slash = note.path.lastIndexOf("/")
  const [missing, setMissing] = useState(false)
  return (
    <motion.li
      layout={reduced ? false : "position"}
      initial={reduced ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: reduced ? "auto" : 0 }}
      transition={{ duration: reduced ? 0 : 0.16 }}
      aria-label={`Note on ${noteLocation(note)}`}
      className="flex min-w-0 items-center gap-[8px] [padding:3px_4px_3px_6px] rounded-[var(--radius)] overflow-hidden text-[13px] [&:hover]:bg-[var(--surface-active)]"
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-[8px] p-0 border-0 bg-transparent text-left cursor-default"
        title={missing ? "Open the diff this note is on to see it there" : "Show this note"}
        onClick={() => setMissing(!revealNote(note.id, reduced))}
      >
        <span className="flex-none max-w-[40%] overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-secondary)] text-[12px] [font-family:var(--font-mono)]">
          {note.path.slice(slash + 1)}:{noteLines(note)}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-primary)]">
          {note.body.replace(/\s+/g, " ")}
        </span>
      </button>
      <IconButton
        unstyled
        className={rowIconButtonClasses}
        label="Delete note"
        disabled={disabled}
        onClick={() => useReviewNotes.getState().remove(threadId, note.id)}
      >
        <X size={12} strokeWidth={1.75} />
      </IconButton>
    </motion.li>
  )
}
