import { useState } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { useQuery } from "@tanstack/react-query"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { ArrowRight, Check, ChevronRight, Copy, GitFork, History } from "lucide-react"
import {
  HARNESSES,
  isHarness,
  type Thread,
  type ThreadFork,
  type TurnHandoff,
} from "@meldshell/contracts"
import { ProviderIcon } from "../ui/ProviderIcon"
import { copyStatusText, useCopy } from "../ui/CopyButton"
import { IconButton } from "../ui/controls"
import { CollapsiblePanel, Swap } from "../ui/motion"
import { Markdown } from "../ui/Markdown"
import { disclosureChevronClasses } from "../ui/styles"
import { useTabStore } from "../app/tab-store"

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
      <div className="flex items-center gap-[8px] [padding:4px_6px_4px_14px] border-b-[1px] border-b-[color:var(--line-subtle)] text-[11px]">
        <span className="text-[var(--text-secondary)] font-medium">{title}</span>
        <span className="text-[var(--text-tertiary)]">{turnsText(handoff.turnCount)}</span>
        <span className="flex-1" />
        <span className="text-[var(--text-tertiary)]" role="status">
          {copyStatusText(copyState)}
        </span>
        <IconButton label="Copy summary" onClick={() => void copy(handoff.brief)}>
          <Swap id={copyState === "copied" ? "copied" : "copy"}>
            {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
          </Swap>
        </IconButton>
      </div>
      <div
        className={`[padding:10px_16px_12px] text-[var(--text-secondary)] text-[13px] overflow-y-auto ${compact ? "max-h-[220px]" : "max-h-[360px]"}`}
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
  "bg-[var(--surface-raised)] text-inherit [font:inherit] cursor-default",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)]",
  "[&[data-panel-open]]:text-[var(--text-secondary)]",
].join(" ")

/** Names the thread a fork came from, and opens it while it still exists. */
function ForkSource({ fork }: { readonly fork: ThreadFork }): React.JSX.Element {
  const threadId = fork.threadId
  if (threadId === null) return <span className="text-[var(--text-secondary)]">{fork.title}</span>
  return (
    <BaseButton
      type="button"
      title="Open the original thread"
      onClick={() => useTabStore.getState().openThread(threadId)}
      className="motion-colors inline [padding:0] border-0 bg-transparent text-[var(--text-secondary)] [font:inherit] cursor-pointer underline [text-decoration-color:var(--line-strong)] [text-underline-offset:2px] [&:hover]:text-[var(--text-primary)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]"
    >
      {fork.title}
    </BaseButton>
  )
}

/**
 * Marks where a thread moved to another agent, restarted after a rewind, or began after a fork,
 * above the message that carried the summary. The summary itself opens beneath it.
 */
export function HandoffMarker({ handoff }: { readonly handoff: TurnHandoff }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const others = handoff.from.filter((harness) => harness !== handoff.to)
  const to = harnessLabel(handoff.to)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="grid gap-[8px]">
      <div className={lineClasses} role="note">
        <Collapsible.Trigger className={triggerClasses}>
          {handoff.reason === "fork" ? (
            <>
              <GitFork size={12} aria-hidden="true" />
              <span>
                Forked from{" "}
                <span className="text-[var(--text-secondary)]">
                  {handoff.forkedFrom ?? "another thread"}
                </span>
              </span>
            </>
          ) : handoff.reason === "restart" ? (
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

const noticeTextClasses = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"

/** Why the next message starts a new session: a fork, another agent, or a rewind. */
function NoticeLabel({
  fork,
  previous,
  harness,
  handoff,
}: {
  readonly fork: ThreadFork | undefined
  /** The harness of the latest turn still in the conversation, if any. */
  readonly previous: string | undefined
  readonly harness: string
  readonly handoff: TurnHandoff | null
}): React.JSX.Element {
  if (fork !== undefined)
    return (
      <>
        <GitFork size={12} aria-hidden="true" />
        <span className={noticeTextClasses}>
          Forked from <ForkSource fork={fork} />
          {previous === undefined
            ? " before its first message"
            : handoff === null
              ? ""
              : `. The next message starts a new session with a summary of ${turnsText(handoff.turnCount)}`}
        </span>
      </>
    )
  if (previous !== undefined && previous !== harness)
    return (
      <>
        <HarnessIcon harness={previous} size={12} />
        <ArrowRight size={11} aria-hidden="true" />
        <HarnessIcon harness={harness} size={12} />
        <span className={noticeTextClasses}>
          {harnessLabel(harness)} picks up from {harnessLabel(previous)} with a summary of{" "}
          {handoff === null ? "the work so far" : turnsText(handoff.turnCount)}
        </span>
      </>
    )
  return (
    <>
      <History size={12} aria-hidden="true" />
      <span className={noticeTextClasses}>
        The next message starts a new session with a summary of{" "}
        {handoff === null
          ? "the turns before the rewind"
          : handoff.turnCount === 1
            ? "the turn before the rewind"
            : `the ${handoff.turnCount} turns before the rewind`}
      </span>
    </>
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
  const fork = thread.fork?.fresh === true ? thread.fork : undefined
  const moving = previous !== undefined && previous !== harness
  // A rewind past the first turn leaves nothing to summarize.
  const shown = moving || (thread.rewound === true && previous !== undefined) || fork !== undefined
  const preview = useQuery({
    queryKey: ["handoff-preview", thread.id, harness, thread.historyRevision, thread.updatedAt],
    queryFn: () => window.meldshell.previewHandoff(thread.id),
    enabled: shown,
    staleTime: Infinity,
  })
  const handoff = preview.data ?? null
  // A fork from before the first message has nothing to summarize, but still says where it began.
  if (!shown || (preview.isSuccess && handoff === null && fork === undefined)) return null
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
        <NoticeLabel fork={fork} previous={previous} harness={harness} handoff={handoff} />
        {handoff !== null && (
          <Collapsible.Trigger className="motion-colors shrink-0 inline-flex items-center gap-[4px] ml-auto [padding:2px_8px] border-0 rounded-[999px] bg-transparent text-inherit [font:inherit] cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)] [&[data-panel-open]]:text-[var(--text-secondary)]">
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
