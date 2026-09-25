import {
  CollapsiblePanel,
  FadeDiv,
  GradientSpinner,
  PopPresence,
  Shimmer,
  useMotionPreference,
} from "../ui/motion"
import { motion } from "motion/react"
import { queryKeys } from "../data/cache"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { Toggle } from "@base-ui-components/react/toggle"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { Button } from "../ui/controls"
import { disclosureChevronClasses } from "../ui/styles"
import type { CanonicalEvent } from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { ChangeDiff } from "../ui/ChangeDiff"
import { TurnChanges } from "./TurnChanges"
import { ToolOutput } from "./ToolOutput"
import { fileChangePatches } from "./file-change-diffs"
import { toolDetails } from "./tool-details"
import { commandLabel } from "./command-summary"
import { primaryWork, workSummary, type Work } from "./work-summary"
import { MessageRail } from "./MessageRail"
import { AsyncQuestions } from "./AsyncQuestions"
import { landFlight } from "../ui/flight"
import { Notice } from "../ui/Notice"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { refreshTranscript, type TranscriptWindow } from "../data/transcript"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowDown,
  Brain,
  ChevronRight,
  CircleAlert,
  FileCode2,
  FilePen,
  FileText,
  Globe,
  ListChecks,
  Search,
  Terminal,
  Wrench,
} from "lucide-react"
import { Markdown } from "../ui/Markdown"
import { CopyIconButton, copyStatusText, useCopy } from "../ui/CopyButton"
import { MarkdownWorkspace, MarkdownSources, ReferenceChip } from "../ui/MarkdownReference"
import { MarkdownStreaming, ToolImageGallery } from "../ui/MarkdownBlocks"
import { fileReference, sourceTitles } from "../ui/markdown-model"
import type { TranscriptTurn } from "@meldshell/projection"

const fallbackText = (event: CanonicalEvent): string =>
  event.text ?? event.method.replaceAll("/", " · ")

function Message({
  event,
  className = "",
  children,
  arrivingIn,
  flash,
}: {
  readonly event: CanonicalEvent
  readonly className?: string
  readonly children?: ReactNode
  /** The thread whose latest composer send may have produced this new user message. */
  readonly arrivingIn?: string
  /** Changes each time the reader jumps to this message, briefly marking where they landed. */
  readonly flash?: number
}): React.JSX.Element {
  const [copyState, copy] = useCopy()
  const [showTime, setShowTime] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const reduced = useMotionPreference()
  const text = fallbackText(event)
  const date = new Date(event.createdAt)
  const fullTime = date.toLocaleString()

  // biome-ignore lint/correctness/useExhaustiveDependencies: The prompt flies only when the message first mounts.
  useLayoutEffect(() => {
    const bubble = rootRef.current?.querySelector<HTMLElement>(":scope > .event-markdown")
    if (arrivingIn === undefined || bubble == null) return
    return landFlight(`prompt:${arrivingIn}`, bubble, { match: text, content: true })
  }, [])

  useEffect(() => {
    const bubble = rootRef.current?.querySelector<HTMLElement>(":scope > .event-markdown")
    if (flash === undefined || reduced || bubble == null) return
    const ring = getComputedStyle(bubble).getPropertyValue("--accent")
    const animation = bubble.animate(
      [{ boxShadow: `0 0 0 2px ${ring}` }, { boxShadow: "0 0 0 2px transparent" }],
      { duration: 1400, easing: "ease-out" },
    )
    return () => animation.cancel()
  }, [flash, reduced])

  return (
    <div
      ref={rootRef}
      className={`min-w-0 [&:hover_>_.message-actions]:opacity-[1] [&:focus-within_>_.message-actions]:opacity-[1] [&_>_.turn-changes]:mt-[14px] ${className}`}
    >
      <Markdown text={text} />
      {event.kind === "user" && <MessageAttachments payload={event.payload} />}
      {children}
      <div className={`motion-colors ${workingSectionClasses}`}>
        <CopyIconButton
          label={copyState === "copied" ? "Copied" : "Copy message"}
          state={copyState}
          onClick={() => void copy(text)}
        />
        <Toggle
          className="message-time"
          title={fullTime}
          aria-label={`Show full message time: ${fullTime}`}
          pressed={showTime}
          onPressedChange={setShowTime}
        >
          <time dateTime={event.createdAt}>
            {showTime
              ? fullTime
              : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </time>
        </Toggle>
        <span className="text-[var(--text-secondary)] text-[11px]" role="status">
          {copyStatusText(copyState)}
        </span>
      </div>
    </div>
  )
}

function MessageAttachments({ payload }: { payload: unknown }) {
  const attachments =
    payload && typeof payload === "object" && "attachments" in payload ? payload.attachments : null
  if (!Array.isArray(attachments)) return null
  return (
    <div className="flex flex-wrap gap-[6px] mt-[8px]">
      {attachments.map((attachment, index) => {
        if (!attachment || typeof attachment.value !== "string") return null
        if (attachment.type !== "mention" && attachment.type !== "skill") return null
        const reference = fileReference(attachment.value)
        return reference ? (
          <ReferenceChip
            key={index}
            reference={{ ...reference, skill: attachment.type === "skill" }}
            label={typeof attachment.name === "string" ? attachment.name : undefined}
          />
        ) : null
      })}
    </div>
  )
}

const iconFor = (event: CanonicalEvent): React.JSX.Element => {
  const props = { size: 13, strokeWidth: 1.75 }
  switch (event.kind) {
    case "reasoning":
      return <Brain {...props} />
    case "plan":
      return <ListChecks {...props} />
    case "command":
      return <Terminal {...props} />
    case "file-change":
      return <FileCode2 {...props} />
    case "error":
      return <CircleAlert {...props} />
    default:
      return <Wrench {...props} />
  }
}

const toolSummary = (event: CanonicalEvent): string => {
  const text = fallbackText(event)
  if (event.method === "turn/diff/updated") return "All changes in this turn"
  if (event.kind === "reasoning") return "Reasoning"
  if (event.kind === "plan") return "Updated plan"
  if (event.kind === "command")
    return commandLabel(event.payload, text.split("\n\n", 1)[0] ?? "Command")
  return text.split("\n", 1)[0] ?? event.method.replaceAll("/", " · ")
}

function ToolBody({
  event,
  tool,
  text,
  commandOutput,
  patches,
}: {
  event: CanonicalEvent
  tool: ReturnType<typeof toolDetails>
  text: string
  commandOutput: string
  patches: ReturnType<typeof fileChangePatches>
}): React.JSX.Element | null {
  if (event.kind === "command")
    return (
      <>
        <ToolOutput label="Command" text={tool.command || text.split("\n\n", 1)[0] || ""} command />
        {(tool.output || commandOutput) && (
          <ToolOutput label="Output" text={tool.output || commandOutput} />
        )}
      </>
    )
  if (event.kind === "tool")
    return (
      <>
        {tool.input && <ToolOutput label="Input" text={tool.input} />}
        {tool.output && (
          <ToolOutput
            label={tool.images.length > 0 ? "Description" : "Output"}
            text={tool.output}
          />
        )}
        {!tool.input && !tool.output && tool.images.length === 0 && (
          <ToolOutput label="Details" text={text} />
        )}
      </>
    )
  if (patches.length > 0)
    return (
      <>
        {patches.map(({ path, patch }, index) => (
          <ChangeDiff key={index} path={path} patch={patch} />
        ))}
      </>
    )
  return (
    <div className="work-item-output max-h-[220px] m-0 overflow-auto text-[var(--text-secondary)] [font-family:var(--font-mono)] text-[10.75px] leading-[1.55] whitespace-pre-wrap">
      {text}
    </div>
  )
}

function ToolLine({ event }: { readonly event: CanonicalEvent }): React.JSX.Element {
  const tool = toolDetails(event)
  const text = fallbackText(event)
  const commandOutput = event.kind === "command" ? text.split("\n\n").slice(1).join("\n\n") : ""
  const patches = event.kind === "file-change" ? fileChangePatches(event) : []
  const detail =
    event.kind === "file-change" ||
    event.kind === "command" ||
    event.kind === "tool" ||
    Boolean(tool.progress) ||
    Boolean(tool.status) ||
    tool.failed ||
    event.kind === "plan" ||
    commandOutput !== "" ||
    event.kind === "reasoning"

  if (!detail) {
    return (
      <div className="flex min-w-0 min-h-[28px] items-center gap-[7px] [padding:4px_7px] rounded-[var(--radius-sm)] text-[var(--text-tertiary)] [font-family:var(--font-mono)] text-[10.75px] [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap">
        {iconFor(event)}
        <span>{toolSummary(event)}</span>
      </div>
    )
  }
  return (
    <Collapsible.Root className="work-item" defaultOpen={false}>
      <Collapsible.Trigger className={`motion-colors ${workItemTriggerClasses}`}>
        {iconFor(event)}
        <span className="work-item-title" title={toolSummary(event)}>
          {toolSummary(event)}
        </span>
        {tool.status && (
          <span
            className="work-item-status [&[data-failed]]:text-[var(--color-deleted)]"
            data-failed={tool.failed || undefined}
          >
            {tool.status}
          </span>
        )}
        {tool.status === "Running" && tool.progress && (
          <span title={tool.progress}>{tool.progress}</span>
        )}
        {tool.parent && <span title={tool.parent}>Subagent</span>}
        <ChevronRight className={disclosureChevronClasses} size={13} />
      </Collapsible.Trigger>
      <CollapsiblePanel className="grid gap-[10px] min-w-0 [margin:6px_6px_16px_26px]">
        <ToolBody
          event={event}
          tool={tool}
          text={text}
          commandOutput={commandOutput}
          patches={patches}
        />
        {tool.progress && <ToolOutput label="Progress" text={tool.progress} />}
        {event.kind === "file-change" && patches.every(({ patch }) => !patch) && tool.input && (
          <ToolOutput label="Input" text={tool.input} />
        )}
        {tool.error && <ToolOutput label="Error" text={tool.error} error />}
        {tool.images.length > 0 && <ToolImageGallery images={tool.images} />}
        {(tool.cwd || tool.outputFile || tool.exitCode !== null) && (
          <dl
            className={
              "[&_>_div[data-failed]]:text-[var(--color-deleted)] grid gap-[5px] m-0 text-[var(--text-tertiary)] text-[11px] leading-[1.5] [&_>_div]:flex [&_>_div]:[align-items:baseline] [&_>_div]:gap-[10px] [&_dt]:flex-[0_0_64px] [&_dd]:min-w-0 [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_code]:[font-family:var(--font-mono)]"
            }
          >
            {tool.exitCode !== null && (
              <div data-failed={tool.exitCode !== 0 || undefined}>
                <dt>Exit code</dt>
                <dd>{tool.exitCode}</dd>
              </div>
            )}
            {tool.cwd && (
              <div>
                <dt>Directory</dt>
                <dd>
                  <code>{tool.cwd}</code>
                </dd>
              </div>
            )}
            {tool.outputFile && (
              <div>
                <dt>Output file</dt>
                <dd>
                  <code>{tool.outputFile}</code>
                </dd>
              </div>
            )}
          </dl>
        )}
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

// Final errors surface as cards; retrying errors stay in the working log.
const isFailure = (event: CanonicalEvent): boolean =>
  event.kind === "error" && toolDetails(event).failed

const formatDuration = (durationMs: number): string => {
  const seconds = Math.max(1, Math.round(durationMs / 1_000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function WorkingSection({
  turn,
  live,
}: {
  readonly turn: TranscriptTurn
  readonly live: boolean
}): React.JSX.Element | null {
  const [open, setOpen] = useState(!turn.complete)
  const [complete, setComplete] = useState(turn.complete)
  // A finishing turn folds its working log into the summary.
  if (turn.complete !== complete) {
    setComplete(turn.complete)
    setOpen(!turn.complete)
  }
  if (turn.workingEvents.length === 0)
    return live && turn.finalResponse === null ? (
      <FadeDiv
        className="flex min-h-[28px] items-center gap-[6px] [padding:3px_6px_3px_4px] text-[11px] font-medium"
        role="status"
      >
        <GradientSpinner size={11} />
        <Shimmer>Thinking</Shimmer>
      </FadeDiv>
    ) : null

  return (
    <Collapsible.Root className="text-[var(--text-tertiary)]" open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="motion-colors [list-style:none] flex min-h-[28px] items-center gap-[6px] [padding:3px_6px_3px_2px] rounded-[var(--radius-sm)] cursor-pointer text-[11px] font-medium w-full border-0 bg-transparent text-inherit [font:inherit] text-left [&::-webkit-details-marker]:hidden [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)]">
        <ChevronRight className={disclosureChevronClasses} size={14} />
        {turn.complete ? (
          <>
            <WorkIcon work={primaryWork(turn.workingEvents)} />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {workSummary(turn.workingEvents) || "Worked"}
            </span>
          </>
        ) : (
          <>
            <GradientSpinner size={11} />
            <Shimmer className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {workSummary(turn.workingEvents) || "Working"}
            </Shimmer>
          </>
        )}
        <span className="flex-none font-normal text-[var(--text-tertiary)] opacity-[0.8] [font-variant-numeric:tabular-nums]">
          {formatDuration(turn.durationMs)}
        </span>
      </Collapsible.Trigger>
      <CollapsiblePanel className="flex flex-col gap-[1px] [margin:3px_0_1px_7px] [padding:3px_0_3px_12px] border-l-[1px] border-l-[color:var(--line-subtle)]">
        {turn.workingEvents.map((event) => {
          if (turn.complete && event.method === "turn/diff/updated") return null
          if (isFailure(event)) return null
          if (event.kind === "assistant")
            return (
              <Markdown
                key={event.id}
                text={fallbackText(event)}
                className="[padding:6px_8px] text-[var(--text-secondary)] text-[11.5px] leading-[1.55]"
              />
            )
          return <ToolLine key={event.id} event={event} />
        })}
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

const workIcons: Readonly<Record<Work, typeof Terminal>> = {
  edit: FilePen,
  command: Terminal,
  fetch: Globe,
  search: Search,
  read: FileText,
  tool: Wrench,
  plan: ListChecks,
  thought: Brain,
}

function WorkIcon({ work }: { work: Work | null }) {
  if (work === null) return null
  const Icon = workIcons[work]
  return <Icon size={12} strokeWidth={1.75} className="flex-none" aria-hidden="true" />
}

const settle = [0.16, 1, 0.3, 1] as const

function TurnRow({
  threadId,
  turn,
  entering = false,
  live = false,
  flash,
  onAnswer,
}: {
  readonly threadId: string
  readonly turn: TranscriptTurn
  readonly flash?: number
  /** Answers the turn's open questions with a new message; absent once they cannot be answered. */
  readonly onAnswer?: (text: string) => void
  /** The thread's latest turn while the provider is still working on it. */
  readonly live?: boolean
  /** A turn appended while the thread is open rises into place once. */
  readonly entering?: boolean
}): React.JSX.Element {
  const reduced = useMotionPreference()
  const sources = sourceTitles([
    ...turn.workingEvents.map((event) => event.payload),
    turn.finalResponse?.payload,
  ])
  return (
    <MarkdownSources value={sources}>
      <MarkdownStreaming value={!turn.complete}>
        <motion.article
          className="transcript-turn select-text flex flex-col gap-[10px]"
          initial={entering && !reduced ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: settle }}
        >
          {turn.userMessages.map((event, index) => (
            <Message
              key={event.id}
              event={event}
              arrivingIn={entering && !reduced && index === 0 ? threadId : undefined}
              flash={index === 0 ? flash : undefined}
              className={
                "[&_>_.message-actions]:justify-end [&_>_.event-markdown]:[padding:12px_16px] [&_>_.event-markdown]:border-[1px] [&_>_.event-markdown]:border-[color:var(--line-subtle)] [&_>_.event-markdown]:rounded-[var(--radius-lg)] [&_>_.event-markdown]:bg-[var(--surface-hover)] [&_>_.event-markdown]:text-[var(--text-primary)] w-[fit-content] max-w-[min(78%,_680px)] ml-[auto] relative [&_>_.message-actions]:absolute [&_>_.message-actions]:bottom-[0] [&_>_.message-actions]:right-[calc(100%_+_4px)] [&_>_.message-actions]:mt-[0] [&_>_.message-actions]:flex-row-reverse [&_>_.message-actions]:flex-nowrap [&_>_.message-actions]:whitespace-nowrap"
              }
            />
          ))}
          <WorkingSection turn={turn} live={live && !turn.complete} />
          {turn.workingEvents.filter(isFailure).map((event) => (
            <Notice
              key={event.id}
              title="The provider reported an error"
              message={toolDetails(event).error || fallbackText(event)}
            />
          ))}
          {turn.finalResponse !== null ? (
            <Message
              event={turn.finalResponse}
              className={
                "[&_>_.event-markdown]:text-[var(--text-primary)] text-[var(--text-primary)]"
              }
            >
              {turn.complete && <TurnChanges events={turn.workingEvents} />}
            </Message>
          ) : (
            turn.complete && <TurnChanges events={turn.workingEvents} />
          )}
          {turn.questions.length > 0 && (
            <AsyncQuestions questions={turn.questions} onAnswer={onAnswer} />
          )}
        </motion.article>
      </MarkdownStreaming>
    </MarkdownSources>
  )
}

/** The turn appended since the last commit. Turns from first load or older pages never animate in. */
function useEnteringTurn(turns: ReadonlyArray<TranscriptTurn> | undefined): string | null {
  const seen = useRef<Set<string> | null>(null)
  const entering = useRef<string | null>(null)
  const lastId = turns?.at(-1)?.id
  if (turns !== undefined) {
    if (seen.current === null) seen.current = new Set(turns.map((turn) => turn.id))
    else if (lastId !== undefined && !seen.current.has(lastId)) entering.current = lastId
    for (const turn of turns) seen.current.add(turn.id)
  }
  // The row mounted with its entrance; a later remount from scrolling should not replay it.
  useEffect(() => {
    entering.current = null
  })
  return entering.current
}

export function Transcript({
  threadId,
  targetTurnId,
  scope,
  origin,
  running = false,
  onAnswer,
}: {
  readonly running?: boolean
  /** Sends a reply to the latest turn's questions; absent while the thread cannot take one. */
  readonly onAnswer?: (text: string) => void
  readonly targetTurnId?: string
  readonly threadId: string
  /** Where file references resolve; a worktree thread reads its own checkout. */
  readonly scope?: WorkspaceScope
  /** Shown in place of the transcript before the first turn. */
  readonly origin?: React.ReactNode
}): React.JSX.Element {
  "use no memo"
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLatest, setShowLatest] = useState(false)
  const [jump, setJump] = useState<{ readonly turnId: string; readonly at: number } | null>(null)
  const reduced = useMotionPreference()
  // A row remounted by scrolling should not replay the landing mark.
  useEffect(() => {
    if (jump === null) return
    const timer = window.setTimeout(() => setJump(null), 1500)
    return () => window.clearTimeout(timer)
  }, [jump])
  const client = useQueryClient()
  const key = queryKeys.transcript(threadId)
  const current = () => client.getQueryData<TranscriptWindow>(key)
  const query = useQuery({
    queryKey: key,
    queryFn: () => refreshTranscript(window.meldshell.getTranscript, threadId, current(), current),
    // The incremental merger already retains unchanged turn references. Avoid a
    // second deep traversal of every historical native payload on each delta.
    structuralSharing: false,
  })
  const turns = query.data?.turns ?? []
  const enteringTurn = useEnteringTurn(query.data?.turns)
  // TanStack Virtual exposes imperative measurements, so the compiler opt-out stays local.
  const virtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 190,
    getItemKey: (index) => turns[index]!.id,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: 80,
    overscan: 6,
  })

  // Row measurements notify before the virtual height commits. Read the DOM
  // afterward so collapsing content also clears the button without a scroll event.
  useLayoutEffect(() => {
    const element = scrollRef.current
    setShowLatest(
      element !== null && element.scrollHeight - element.clientHeight - element.scrollTop > 80,
    )
  })

  const hasTurns = turns.length > 0
  const targetIndex = useMemo(
    () => turns.findIndex((turn) => turn.id === targetTurnId),
    [turns, targetTurnId],
  )
  useEffect(() => {
    if (targetIndex >= 0) virtualizer.scrollToIndex(targetIndex, { align: "start" })
    else if (hasTurns) virtualizer.scrollToEnd()
  }, [targetIndex, hasTurns, virtualizer])

  if (query.isLoading)
    return (
      <div className="transcript-loading min-h-0 [padding:36px_clamp(24px,_7vw,_104px)] text-[var(--text-tertiary)] text-[12px]">
        Loading transcript…
      </div>
    )
  if (query.isError && !query.data)
    return (
      <div className="transcript-loading min-h-0 [padding:36px_clamp(24px,_7vw,_104px)] text-[var(--text-tertiary)] text-[12px]">
        This transcript could not be read from disk.
      </div>
    )
  if (turns.length === 0)
    return (
      <div className="transcript-origin [padding:0_clamp(24px,_7vw,_104px)_24px]">
        <FadeDiv className="w-full max-w-[680px] [margin:0_auto]">{origin}</FadeDiv>
      </div>
    )

  return (
    <MarkdownWorkspace value={scope}>
      <div className="@container relative grid min-h-0 min-w-0 grid-rows-[minmax(0,_1fr)]">
        {query.isError && (
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Retry transcript updates
          </Button>
        )}
        <div
          ref={scrollRef}
          className="transcript min-h-0 [padding:36px_clamp(24px,_7vw,_104px)] overflow-y-auto [scrollbar-gutter:stable] [mask-image:linear-gradient(to_bottom,transparent,black_28px,black_calc(100%_-_28px),transparent)]"
          aria-live="polite"
        >
          <div
            className="relative w-full max-w-[720px] [margin:0_auto]"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const turn = turns[item.index]
              if (turn === undefined) return null
              return (
                <div
                  key={turn.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute top-[0] left-[0] w-full pb-[44px] [&[data-search-match]_.transcript-turn]:border-l-[2px] [&[data-search-match]_.transcript-turn]:border-l-[color:var(--text-secondary)] [&[data-search-match]_.transcript-turn]:pl-[16px]"
                  data-search-match={turn.id === targetTurnId || undefined}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <TurnRow
                    threadId={threadId}
                    turn={turn}
                    entering={turn.id === enteringTurn}
                    flash={jump?.turnId === turn.id ? jump.at : undefined}
                    live={running && item.index === turns.length - 1}
                    onAnswer={item.index === turns.length - 1 ? onAnswer : undefined}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <MessageRail
          turns={turns}
          readingIndex={
            // At the end, a short final turn can start below the reading line; it is still the one being read.
            showLatest
              ? (virtualizer.getVirtualItemForOffset((virtualizer.scrollOffset ?? 0) + 120)
                  ?.index ?? 0)
              : turns.length - 1
          }
          onJump={(index) => {
            virtualizer.scrollToIndex(index, {
              align: "start",
              behavior: reduced ? "auto" : "smooth",
            })
            const turn = turns[index]
            if (turn !== undefined) setJump({ turnId: turn.id, at: Date.now() })
          }}
        />
        <div className="absolute z-[2] bottom-[12px] inset-x-[16px] flex justify-center pointer-events-none">
          <PopPresence show={showLatest}>
            <BaseButton
              type="button"
              className="pointer-events-auto flex items-center gap-[6px] [box-shadow:var(--shadow-raised)] [padding:7px_12px] border-[1px] border-[color:var(--line-strong)] rounded-[999px] bg-[var(--surface-menu)] text-[var(--text-primary)] text-[12px] whitespace-nowrap cursor-pointer [&:hover]:bg-[var(--surface-overlay)]"
              onClick={() => virtualizer.scrollToEnd()}
            >
              <ArrowDown size={14} aria-hidden="true" />
              Scroll to latest
            </BaseButton>
          </PopPresence>
        </div>
      </div>
    </MarkdownWorkspace>
  )
}

const workingSectionClasses = [
  "message-actions select-none flex items-center flex-wrap gap-[4px] min-h-[28px] mt-[4px] opacity-[0]",
  "[&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:min-h-[26px]",
  "[&_button]:[padding:4px_6px] [&_button]:border-0 [&_button]:rounded-[4px] [&_button]:bg-transparent",
  "[&_button]:text-[var(--text-tertiary)] [&_button]:[font-family:inherit]",
  "[&_button]:[line-height:inherit] [&_button]:[font-weight:inherit] [&_button]:text-[11px]",
  "[&_button]:cursor-pointer [&_button:hover]:bg-[var(--surface-hover)]",
  "[&_button:hover]:text-[var(--text-primary)] [@media(hover:_none)]:opacity-[1]",
].join(" ")

const workItemTriggerClasses = [
  "[list-style:none] flex min-w-0 min-h-[28px] items-center gap-[7px] [padding:4px_7px]",
  "rounded-[var(--radius-sm)] [font-family:var(--font-mono)] text-[10.75px] cursor-pointer w-full",
  "border-0 bg-transparent text-inherit [font:inherit] text-left [&::-webkit-details-marker]:hidden",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)] [&_span]:min-w-0",
  "[&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap",
  "[&_.disclosure-chevron]:ml-[auto] [&_.work-item-title]:flex-1 [&_.work-item-status]:shrink-0",
  "[&_.work-item-status]:text-[11px]",
].join(" ")
