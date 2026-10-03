import { AnimatePresence, motion } from "motion/react"
import { CornerDownRight, ListPlus, Pencil, X } from "lucide-react"
import type { QueuedInput } from "@meldshell/contracts"
import { IconButton } from "../ui/controls"
import { useMotionPreference } from "../ui/motion"

const rowButtonClasses =
  "grid w-[22px] h-[22px] flex-none p-0 border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default place-items-center [&:hover:not(:disabled)]:bg-[var(--surface-active)] [&:hover:not(:disabled)]:text-[var(--text-primary)] disabled:opacity-40"

/**
 * The follow-ups waiting on this thread, in the order they will start. Each can be sent into the
 * running turn, pulled back into the composer to edit, or dropped. Shows nothing while the queue is
 * empty.
 */
export function QueuedMessages({
  items,
  running,
  pending,
  onEdit,
  onSteer,
  onRemove,
  onClear,
}: {
  items: ReadonlyArray<QueuedInput>
  /** Whether a turn is active; a queue that outlives its turn waits for the user to send it. */
  running: boolean
  pending: boolean
  onEdit: (item: QueuedInput) => void
  onSteer: (item: QueuedInput) => void
  onRemove: (item: QueuedInput) => void
  onClear: () => void
}): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <section
      aria-label="Queued messages"
      className="w-full max-w-[860px] [margin:0_auto_6px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-hover)]"
    >
      <header className="flex items-center gap-[8px] h-[28px] [padding:0_6px_0_10px] text-[var(--text-tertiary)] text-[11px]">
        <ListPlus size={13} strokeWidth={1.75} className="flex-none" aria-hidden="true" />
        <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {running
            ? `${items.length} queued · each starts when the turn before it finishes`
            : `${items.length} waiting · the last turn ended before they started`}
        </span>
        {items.length > 1 && (
          <button
            type="button"
            className="motion-colors [padding:2px_6px] border-0 rounded-[var(--radius-sm)] bg-transparent text-inherit text-[11px] cursor-default [&:hover:not(:disabled)]:bg-[var(--surface-active)] [&:hover:not(:disabled)]:text-[var(--text-primary)] disabled:opacity-40"
            disabled={pending}
            onClick={onClear}
          >
            Clear all
          </button>
        )}
      </header>
      <ul className="m-0 [padding:0_4px_4px] list-none max-h-[132px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <QueuedRow
              key={item.id}
              item={item}
              running={running}
              pending={pending}
              onEdit={onEdit}
              onSteer={onSteer}
              onRemove={onRemove}
            />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}

function QueuedRow({
  item,
  running,
  pending,
  onEdit,
  onSteer,
  onRemove,
}: {
  item: QueuedInput
  running: boolean
  pending: boolean
  onEdit: (item: QueuedInput) => void
  onSteer: (item: QueuedInput) => void
  onRemove: (item: QueuedInput) => void
}): React.JSX.Element {
  const reduced = useMotionPreference()
  return (
    <motion.li
      key={item.id}
      layout={reduced ? false : "position"}
      initial={reduced ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: reduced ? "auto" : 0 }}
      transition={{ duration: reduced ? 0 : 0.16 }}
      className="flex min-w-0 items-center gap-[6px] [padding:3px_4px_3px_6px] rounded-[var(--radius)] overflow-hidden text-[12.5px] [&:hover]:bg-[var(--surface-active)]"
    >
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-primary)]">
        {item.text === "" ? "Attachments only" : item.text.replace(/\s+/g, " ")}
      </span>
      {item.attachmentCount > 0 && (
        <span className="flex-none text-[var(--text-tertiary)] text-[10.5px] tabular-nums">
          {item.attachmentCount} {item.attachmentCount === 1 ? "file" : "files"}
        </span>
      )}
      {item.steer && (
        <span className="flex-none [padding:1px_5px] rounded-[4px] bg-[var(--surface-active)] text-[var(--accent)] text-[10.5px] leading-[1.3]">
          Next
        </span>
      )}
      <IconButton
        unstyled
        className={rowButtonClasses}
        label={
          item.attachmentCount > 0 ? "Remove and re-send to change attachments" : "Edit in composer"
        }
        disabled={pending || item.attachmentCount > 0}
        onClick={() => onEdit(item)}
      >
        <Pencil size={12} strokeWidth={1.75} />
      </IconButton>
      {!(item.steer && running) && (
        <IconButton
          unstyled
          className={rowButtonClasses}
          label={running ? "Steer the current turn with this now" : "Send now"}
          disabled={pending}
          onClick={() => onSteer(item)}
        >
          <CornerDownRight size={12} strokeWidth={1.75} />
        </IconButton>
      )}
      <IconButton
        unstyled
        className={rowButtonClasses}
        label="Remove from queue"
        disabled={pending}
        onClick={() => onRemove(item)}
      >
        <X size={12} strokeWidth={1.75} />
      </IconButton>
    </motion.li>
  )
}
