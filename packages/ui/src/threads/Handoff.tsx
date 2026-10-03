import { useState } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, ChevronRight, History } from "lucide-react"
import { HARNESSES, isHarness, type Thread, type TurnHandoff } from "@meldshell/contracts"
import { ProviderIcon } from "../ui/ProviderIcon"
import { CopyIconButton, useCopy } from "../ui/CopyButton"
import { CollapsiblePanel } from "../ui/motion"
import { Markdown } from "../ui/Markdown"
import { disclosureChevronClasses } from "../ui/styles"

const harnessLabel = (harness: string) => (isHarness(harness) ? HARNESSES[harness].label : harness)

const turnsText = (count: number) => `${count} ${count === 1 ? "turn" : "turns"}`

function HarnessIcon({ harness, size }: { readonly harness: string; readonly size: number }) {
  return (
    <ProviderIcon
      provider={{ key: isHarness(harness) ? HARNESSES[harness].provider : harness }}
      size={size}
    />
  )
}

/**
 * The summary as the agent read it, without the tags that mark where it ends or the opening
 * paragraph that tells the agent how to read it.
 */
const briefText = (brief: string) =>
  brief
    .replace(/<\/?meldshell_handoff>/g, "")
    .trim()
    .replace(/^[^\n]*(?:\n(?!\n)[^\n]*)*\n\n/, "")
    .replace(/^ {0,3}### /gm, "#### ")
    .trim()

/** The summary an agent is given, framed as a quoted card with a way to copy it. */
function BriefCard({
  handoff,
  title,
  compact = false,
}: {
  readonly handoff: TurnHandoff
  readonly title: string
  /** Leaves more of the screen to the composer it sits above. */
  readonly compact?: boolean
}): React.JSX.Element {
  const [copyState, copy] = useCopy()
  return (
    <div className="grid border-[1px] border-[color:var(--line-subtle)] border-l-[2px] border-l-[color:var(--accent)] rounded-[var(--radius-lg)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="flex items-center gap-[8px] [padding:7px_8px_7px_14px] border-b-[1px] border-b-[color:var(--line-subtle)] text-[11px]">
        <span className="text-[var(--text-secondary)] font-medium">{title}</span>
        <span className="text-[var(--text-tertiary)]">{turnsText(handoff.turnCount)}</span>
        <span className="flex-1" />
        <span className="text-[var(--text-tertiary)]">
          <CopyIconButton
            label={copyState === "copied" ? "Copied" : "Copy summary"}
            state={copyState}
            onClick={() => void copy(handoff.brief)}
          />
        </span>
      </div>
      <div
        className={`[padding:10px_16px_12px] text-[var(--text-secondary)] text-[12.5px] overflow-y-auto ${compact ? "max-h-[220px]" : "max-h-[360px]"}`}
      >
        <Markdown text={briefText(handoff.brief)} />
      </div>
    </div>
  )
}

const lineClasses = [
  "flex items-center gap-[8px] text-[var(--text-tertiary)] text-[11px]",
  "[&::before]:content-[''] [&::before]:flex-1 [&::before]:h-[1px] [&::before]:bg-[var(--line)]",
  "[&::after]:content-[''] [&::after]:flex-1 [&::after]:h-[1px] [&::after]:bg-[var(--line)]",
].join(" ")

const triggerClasses = [
  "motion-colors inline-flex items-center gap-[6px] [padding:3px_10px] border-[1px] border-[color:var(--line-subtle)] rounded-[999px]",
  "bg-[var(--surface-raised)] text-inherit [font:inherit] cursor-pointer",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)]",
  "[&[data-panel-open]]:text-[var(--text-secondary)]",
].join(" ")

/**
 * Marks where a thread moved to another agent, or restarted after a rewind, above the message
 * that carried the summary. The summary itself opens beneath it.
 */
export function HandoffMarker({ handoff }: { readonly handoff: TurnHandoff }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const others = handoff.from.filter((harness) => harness !== handoff.to)
  const to = harnessLabel(handoff.to)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="grid gap-[8px]">
      <div className={lineClasses} role="note">
        <Collapsible.Trigger className={triggerClasses}>
          {handoff.reason === "restart" ? (
            <>
              <History size={12} aria-hidden="true" />
              <span>New session after a rewind</span>
            </>
          ) : (
            <>
              {others.map((harness) => (
                <HarnessIcon key={harness} harness={harness} size={12} />
              ))}
              <ArrowRight size={11} aria-hidden="true" />
              <HarnessIcon harness={handoff.to} size={12} />
              <span>
                Handed off from {others.map(harnessLabel).join(" and ")} to {to}
              </span>
            </>
          )}
          <span className="text-[var(--text-disabled)]">·</span>
          <span>{turnsText(handoff.turnCount)} summarized</span>
          <ChevronRight className={disclosureChevronClasses} size={12} />
        </Collapsible.Trigger>
      </div>
      <CollapsiblePanel>
        <BriefCard handoff={handoff} title={`What ${to} read first`} />
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

/**
 * Says, where the next message is written, that it goes to a session that has not seen the
 * thread's latest work, and shows the summary it will be given before it is sent.
 */
export function HandoffNotice({
  thread,
  harness,
}: {
  readonly thread: Thread
  /** The harness of the model the composer has selected. */
  readonly harness: string
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const previous = thread.lastHarness
  const moving = previous !== undefined && previous !== harness
  // A rewind past the first turn leaves nothing to summarize.
  const shown = moving || (thread.rewound === true && previous !== undefined)
  const preview = useQuery({
    queryKey: ["handoff-preview", thread.id, harness, thread.historyRevision, thread.updatedAt],
    queryFn: () => window.meldshell.previewHandoff(thread.id),
    enabled: shown,
    staleTime: Infinity,
  })
  const handoff = preview.data ?? null
  if (!shown || (preview.isSuccess && handoff === null)) return null
  return (
    <Collapsible.Root
      open={open && handoff !== null}
      onOpenChange={setOpen}
      className="motion-enter grid gap-[6px] w-full max-w-[860px] [margin:0_auto_6px]"
    >
      <div
        role="status"
        className="flex items-center gap-[7px] [padding:0_4px_0_10px] text-[var(--text-tertiary)] text-[11px]"
      >
        {moving ? (
          <>
            <HarnessIcon harness={previous} size={12} />
            <ArrowRight size={11} aria-hidden="true" />
            <HarnessIcon harness={harness} size={12} />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {harnessLabel(harness)} picks up from {harnessLabel(previous)} with a summary of{" "}
              {handoff === null ? "the work so far" : turnsText(handoff.turnCount)}
            </span>
          </>
        ) : (
          <>
            <History size={12} aria-hidden="true" />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              The next message starts a new session with a summary of{" "}
              {handoff === null
                ? "the turns before the rewind"
                : `the ${turnsText(handoff.turnCount)} before the rewind`}
            </span>
          </>
        )}
        {handoff !== null && (
          <Collapsible.Trigger className="motion-colors shrink-0 inline-flex items-center gap-[4px] ml-auto [padding:2px_8px] border-0 rounded-[999px] bg-transparent text-inherit [font:inherit] cursor-pointer [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)] [&[data-panel-open]]:text-[var(--text-secondary)]">
            {open ? "Hide summary" : "Preview summary"}
            <ChevronRight className={disclosureChevronClasses} size={12} />
          </Collapsible.Trigger>
        )}
      </div>
      {handoff !== null && (
        <CollapsiblePanel>
          <BriefCard
            handoff={handoff}
            compact
            title={`What ${harnessLabel(harness)} will read first`}
          />
        </CollapsiblePanel>
      )}
    </Collapsible.Root>
  )
}
