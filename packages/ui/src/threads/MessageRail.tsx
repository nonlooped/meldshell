import { useMemo, useState } from "react"
import type { TranscriptTurn } from "@meldshell/projection"
import { ContentTooltip } from "../ui/controls"

// The rail stays a compact outline; long threads show a window around the active prompt.
const maxTicks = 18

const preview = (text: string | null | undefined, limit: number): string => {
  const flat = (text ?? "").replace(/\s+/g, " ").trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

/** A minimap of the thread's prompts beside the transcript. */
export function MessageRail({
  turns,
  readingIndex,
  onJump,
}: {
  readonly turns: ReadonlyArray<TranscriptTurn>
  /** Index of the turn at the reading line. */
  readonly readingIndex: number
  readonly onJump: (index: number) => void
}): React.JSX.Element | null {
  const prompts = useMemo(
    () => turns.flatMap((turn, index) => (turn.userMessages.length > 0 ? [index] : [])),
    [turns],
  )
  if (prompts.length < 2) return null
  const active = Math.max(
    0,
    prompts.findLastIndex((index) => index <= readingIndex),
  )
  const start = Math.min(
    Math.max(0, active - Math.floor(maxTicks / 2)),
    Math.max(0, prompts.length - maxTicks),
  )
  return (
    <nav
      aria-label="Prompts in this thread"
      className="absolute z-[1] left-[10px] top-[50%] [transform:translateY(-50%)] hidden @3xl:flex flex-col"
    >
      {prompts.slice(start, start + maxTicks).map((index, offset) => (
        <RailTick
          key={turns[index]!.id}
          turn={turns[index]!}
          active={start + offset === active}
          onJump={() => onJump(index)}
        />
      ))}
    </nav>
  )
}

function RailTick({
  turn,
  active,
  onJump,
}: {
  turn: TranscriptTurn
  active: boolean
  onJump: () => void
}) {
  const [open, setOpen] = useState(false)
  const prompt = preview(turn.userMessages[0]?.text, 140)
  const reply = preview(turn.finalResponse?.text, 120)
  return (
    <ContentTooltip
      open={open}
      onOpenChange={setOpen}
      side="right"
      className="max-w-[280px] grid gap-[4px] leading-[1.45]"
      trigger={
        <button
          type="button"
          aria-label={`Jump to prompt: ${prompt}`}
          aria-current={active ? "true" : undefined}
          onClick={onJump}
          className="group flex items-center h-[9px] w-[22px] p-0 border-0 bg-transparent cursor-pointer"
        >
          <span className="motion-width block h-[2px] rounded-full w-[8px] bg-[var(--text-disabled)] group-hover:w-[16px] group-hover:bg-[var(--text-secondary)] group-aria-[current]:w-[14px] group-aria-[current]:bg-[var(--text-primary)]" />
        </button>
      }
    >
      <span className="text-[var(--text-primary)]">{prompt || "Prompt"}</span>
      {reply && <span className="text-[var(--text-tertiary)]">{reply}</span>}
    </ContentTooltip>
  )
}
