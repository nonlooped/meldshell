import { useState } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { ArrowRight, ChevronRight, History } from "lucide-react"
import { HARNESSES, isHarness, type Thread, type TurnHandoff } from "@meldshell/contracts"
import { ProviderIcon } from "../ui/ProviderIcon"
import { CollapsiblePanel } from "../ui/motion"
import { Markdown } from "../ui/Markdown"
import { disclosureChevronClasses } from "../ui/styles"

const harnessLabel = (harness: string) => (isHarness(harness) ? HARNESSES[harness].label : harness)

function HarnessIcon({ harness, size }: { readonly harness: string; readonly size: number }) {
  return (
    <ProviderIcon
      provider={{ key: isHarness(harness) ? HARNESSES[harness].provider : harness }}
      size={size}
    />
  )
}

/** The summary as the agent read it, without the tags that mark where it ends. */
const briefText = (brief: string) =>
  brief
    .replace(/<\/?meldshell_handoff>/g, "")
    .replace(/^ {0,3}### /gm, "#### ")
    .trim()

const lineClasses = [
  "flex items-center gap-[8px] text-[var(--text-tertiary)] text-[11px]",
  "[&::before]:content-[''] [&::before]:flex-1 [&::before]:h-[1px] [&::before]:bg-[var(--line)]",
  "[&::after]:content-[''] [&::after]:flex-1 [&::after]:h-[1px] [&::after]:bg-[var(--line)]",
].join(" ")

const triggerClasses = [
  "motion-colors inline-flex items-center gap-[6px] [padding:3px_8px] border-0 rounded-[999px]",
  "bg-transparent text-inherit [font:inherit] cursor-pointer",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)]",
].join(" ")

/**
 * Marks where a thread moved to another agent, or restarted after a rewind, above the message
 * that carried the summary. The summary itself opens beneath it.
 */
export function HandoffMarker({ handoff }: { readonly handoff: TurnHandoff }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const turns = `${handoff.turnCount} ${handoff.turnCount === 1 ? "turn" : "turns"}`
  const others = handoff.from.filter((harness) => harness !== handoff.to)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="grid gap-[8px]">
      <div className={lineClasses} role="note">
        <Collapsible.Trigger className={triggerClasses}>
          {handoff.reason === "restart" ? (
            <>
              <History size={12} aria-hidden="true" />
              <span>New session from a summary of {turns}</span>
            </>
          ) : (
            <>
              {others.map((harness) => (
                <HarnessIcon key={harness} harness={harness} size={12} />
              ))}
              <ArrowRight size={11} aria-hidden="true" />
              <HarnessIcon harness={handoff.to} size={12} />
              <span>
                Handed off to {harnessLabel(handoff.to)} with a summary of {turns}
              </span>
            </>
          )}
          <ChevronRight className={disclosureChevronClasses} size={12} />
        </Collapsible.Trigger>
      </div>
      <CollapsiblePanel className="[padding:12px_16px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] text-[var(--text-secondary)] text-[12.5px] max-h-[360px] overflow-y-auto">
        <Markdown text={briefText(handoff.brief)} />
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

/**
 * Says, where the next message is written, that it goes to a session that has not seen the
 * thread's latest work and will be given a summary of it.
 */
export function HandoffNotice({
  thread,
  harness,
}: {
  readonly thread: Thread
  /** The harness of the model the composer has selected. */
  readonly harness: string
}): React.JSX.Element | null {
  const previous = thread.lastHarness
  const moving = previous !== undefined && previous !== harness
  if (!moving && thread.rewound !== true) return null
  return (
    <div
      role="status"
      className="motion-enter flex items-center gap-[7px] w-full max-w-[860px] [margin:0_auto_6px] [padding:0_10px] text-[var(--text-tertiary)] text-[11px]"
    >
      {moving ? (
        <>
          <HarnessIcon harness={previous} size={12} />
          <ArrowRight size={11} aria-hidden="true" />
          <HarnessIcon harness={harness} size={12} />
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {harnessLabel(harness)} picks up from {harnessLabel(previous)} with a summary of the
            work so far
          </span>
        </>
      ) : (
        <>
          <History size={12} aria-hidden="true" />
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            The next message starts a new session with a summary of the turns before the rewind
          </span>
        </>
      )}
    </div>
  )
}
