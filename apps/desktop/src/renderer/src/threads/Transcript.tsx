import { FadeDiv, GradientSpinner, PopPresence, Shimmer, useMotionPreference } from "../ui/motion"
import { motion } from "motion/react"
import { queryKeys } from "../data/cache"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { Toggle } from "@base-ui-components/react/toggle"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { Button, IconButton } from "../ui/controls"
import type { CanonicalEvent, Workspace } from "@meldshell/contracts"
import { ChangeDiff } from "../ui/ChangeDiff"
import { TurnChanges } from "./TurnChanges"
import { ToolOutput } from "./ToolOutput"
import { fileChangePatches } from "./file-change-diffs"
import { toolDetails } from "./tool-details"
import { commandLabel } from "./command-summary"
import { workSummary } from "./work-summary"
import { MessageRail } from "./MessageRail"
import { Notice } from "../ui/Notice"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { refreshTranscript, type TranscriptWindow } from "../data/transcript"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowDown,
  Check,
  Copy,
  Brain,
  ChevronRight,
  CircleAlert,
  FileCode2,
  ListChecks,
  Terminal,
  Wrench,
} from "lucide-react"
import { Markdown } from "../ui/Markdown"
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
}: {
  readonly event: CanonicalEvent
  readonly className?: string
  readonly children?: ReactNode
}): React.JSX.Element {
  const [copyState, setCopyState] = useState("idle")
  const [showTime, setShowTime] = useState(false)
  const text = fallbackText(event)
  const date = new Date(event.createdAt)
  const fullTime = date.toLocaleString()

  useEffect(() => {
    if (copyState === "idle") return
    const timer = window.setTimeout(() => setCopyState("idle"), 2000)
    return () => window.clearTimeout(timer)
  }, [copyState])

  return (
    <div
      className={`min-w-0 [&:hover_>_.message-actions]:opacity-[1] [&:focus-within_>_.message-actions]:opacity-[1] [&_>_.turn-changes]:mt-[14px] ${className}`}
    >
      <Markdown text={text} />
      {event.kind === "user" && <MessageAttachments payload={event.payload} />}
      {children}
      <div data-motion="opacity" className={workingSectionClasses}>
        <IconButton
          unstyled
          label={copyState === "copied" ? "Copied" : "Copy message"}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopyState("copied")
            } catch {
              setCopyState("failed")
            }
          }}
        >
          {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
        </IconButton>
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
          {copyState === "failed"
            ? "Copy failed. Try again."
            : copyState === "copied"
              ? "Copied"
              : ""}
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
      <Collapsible.Trigger
        data-motion="background-color border-color color box-shadow"
        className={workItemTriggerClasses}
      >
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
        <ChevronRight
          data-motion="transform background-color"
          data-motion-duration="0.2"
          className={
            "disclosure-chevron flex-none [[data-panel-open]_>_&]:[transform:rotate(90deg)]"
          }
          size={13}
        />
      </Collapsible.Trigger>
      <Collapsible.Panel className="grid gap-[10px] min-w-0 [margin:6px_6px_16px_26px]">
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
      </Collapsible.Panel>
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
    <Collapsible.Root className="text-[var(--text-tertiary)]" defaultOpen={!turn.complete}>
      <Collapsible.Trigger
        data-motion="background-color border-color color box-shadow"
        className="[list-style:none] flex min-h-[28px] items-center gap-[6px] [padding:3px_6px_3px_2px] rounded-[var(--radius-sm)] cursor-pointer text-[11px] font-medium w-full border-0 bg-transparent text-inherit [font:inherit] text-left [&::-webkit-details-marker]:hidden [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)]"
      >
        <ChevronRight
          data-motion="transform background-color"
          data-motion-duration="0.2"
          className={
            "disclosure-chevron flex-none [[data-panel-open]_>_&]:[transform:rotate(90deg)]"
          }
          size={14}
        />
        {turn.complete ? (
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {workSummary(turn.workingEvents) || "Worked"}
          </span>
        ) : (
          <>
            <GradientSpinner size={11} />
            <Shimmer className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {workSummary(turn.workingEvents) || "Working"}
            </Shimmer>
          </>
        )}
        <span className="flex-none font-normal text-[var(--text-disabled)] [font-variant-numeric:tabular-nums]">
          {formatDuration(turn.durationMs)}
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="flex flex-col gap-[1px] [margin:3px_0_1px_7px] [padding:3px_0_3px_12px] border-l-[1px] border-l-[color:var(--line-subtle)]">
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
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

const settle = [0.16, 1, 0.3, 1] as const

function TurnRow({
  turn,
  entering = false,
  live = false,
}: {
  readonly turn: TranscriptTurn
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
          className="transcript-turn select-text flex flex-col gap-[14px]"
          initial={entering && !reduced ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: settle }}
        >
          {turn.userMessages.map((event) => (
            <Message
              key={event.id}
              event={event}
              className={
                "[&_>_.message-actions]:justify-end [&_>_.event-markdown]:[padding:12px_16px] [&_>_.event-markdown]:border-[1px] [&_>_.event-markdown]:border-[color:var(--line-subtle)] [&_>_.event-markdown]:rounded-[var(--radius-lg)] [&_>_.event-markdown]:bg-[var(--surface-hover)] [&_>_.event-markdown]:text-[var(--text-primary)] w-[fit-content] max-w-[min(78%,_680px)] ml-[auto]"
              }
            />
          ))}
          <WorkingSection
            key={turn.complete ? "complete" : "working"}
            turn={turn}
            live={live && !turn.complete}
          />
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
  workspace,
  running = false,
}: {
  readonly running?: boolean
  readonly targetTurnId?: string
  readonly threadId: string
  readonly workspace?: Workspace
}): React.JSX.Element {
  "use no memo"
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLatest, setShowLatest] = useState(false)
  const reduced = useMotionPreference()
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
      <div className="transcript-origin [padding:0_clamp(24px,_7vw,_104px)_12px]">
        <FadeDiv className="w-full max-w-[680px] [margin:0_auto]">
          {workspace !== undefined && (
            <p
              className="flex [align-items:baseline] gap-[8px] m-0 px-[2px] text-[12px] leading-[1.5] [&_span]:shrink-0 [&_span]:text-[var(--text-tertiary)] [&_strong]:overflow-hidden [&_strong]:text-[var(--text-secondary)] [&_strong]:font-medium [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap"
              title={workspace.path}
            >
              <span>Workspace</span>
              <strong>{workspace.name}</strong>
            </p>
          )}
        </FadeDiv>
      </div>
    )

  return (
    <MarkdownWorkspace value={workspace}>
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
            className="relative w-full max-w-[860px] [margin:0_auto]"
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
                  className="absolute top-[0] left-[0] w-full pb-[26px] [&[data-search-match]_.transcript-turn]:border-l-[2px] [&[data-search-match]_.transcript-turn]:border-l-[color:var(--text-secondary)] [&[data-search-match]_.transcript-turn]:pl-[16px]"
                  data-search-match={turn.id === targetTurnId || undefined}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <TurnRow
                    turn={turn}
                    entering={turn.id === enteringTurn}
                    live={running && item.index === turns.length - 1}
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
          onJump={(index) =>
            virtualizer.scrollToIndex(index, {
              align: "start",
              behavior: reduced ? "auto" : "smooth",
            })
          }
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
