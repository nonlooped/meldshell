import { queryKeys } from "../data/cache"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
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
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import {
  mergeTranscript,
  readTranscriptPage,
  refreshTranscript,
  type TranscriptWindow,
} from "../data/transcript"
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
    <div className={`message ${className}`}>
      <Markdown text={text} />
      {event.kind === "user" && <MessageAttachments payload={event.payload} />}
      {children}
      <div className="message-actions">
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
        <span className="message-copy-status" role="status">
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
    <div className="message-attachments">
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
  return <div className="work-item-output">{text}</div>
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
      <div className="work-item-static">
        {iconFor(event)}
        <span>{toolSummary(event)}</span>
      </div>
    )
  }
  return (
    <Collapsible.Root className="work-item" defaultOpen={false}>
      <Collapsible.Trigger className="work-item-trigger">
        {iconFor(event)}
        <span className="work-item-title" title={toolSummary(event)}>
          {toolSummary(event)}
        </span>
        {tool.status && (
          <span className="work-item-status" data-failed={tool.failed || undefined}>
            {tool.status}
          </span>
        )}
        {tool.status === "Running" && tool.progress && (
          <span title={tool.progress}>{tool.progress}</span>
        )}
        {tool.parent && <span title={tool.parent}>Subagent</span>}
        <ChevronRight className="disclosure-chevron" size={13} />
      </Collapsible.Trigger>
      <Collapsible.Panel className="work-item-detail">
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
          <dl className="tool-metadata">
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

const formatDuration = (durationMs: number): string => {
  const seconds = Math.max(1, Math.round(durationMs / 1_000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function WorkingSection({ turn }: { readonly turn: TranscriptTurn }): React.JSX.Element | null {
  if (turn.workingEvents.length === 0) return null

  return (
    <Collapsible.Root className="working-section" defaultOpen={!turn.complete}>
      <Collapsible.Trigger className="working-summary">
        <ChevronRight className="disclosure-chevron" size={14} />
        <span>Working for {formatDuration(turn.durationMs)}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="working-body">
        {turn.workingEvents.map((event) => {
          if (turn.complete && event.method === "turn/diff/updated") return null
          if (event.kind === "assistant")
            return <Markdown key={event.id} text={fallbackText(event)} className="working-note" />
          return <ToolLine key={event.id} event={event} />
        })}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function TurnRow({ turn }: { readonly turn: TranscriptTurn }): React.JSX.Element {
  const sources = sourceTitles([
    ...turn.workingEvents.map((event) => event.payload),
    turn.finalResponse?.payload,
  ])
  return (
    <MarkdownSources value={sources}>
      <MarkdownStreaming value={!turn.complete}>
        <article className="transcript-turn">
          {turn.userMessages.map((event) => (
            <Message key={event.id} event={event} className="turn-user" />
          ))}
          <WorkingSection key={turn.complete ? "complete" : "working"} turn={turn} />
          {turn.finalResponse !== null ? (
            <Message event={turn.finalResponse} className="turn-final">
              {turn.complete && <TurnChanges events={turn.workingEvents} />}
            </Message>
          ) : (
            turn.complete && <TurnChanges events={turn.workingEvents} />
          )}
        </article>
      </MarkdownStreaming>
    </MarkdownSources>
  )
}

export function Transcript({
  threadId,
  targetTurnId,
  workspace,
}: {
  readonly targetTurnId?: string
  readonly threadId: string
  readonly workspace?: Workspace
}): React.JSX.Element {
  "use no memo"
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLatest, setShowLatest] = useState(false)
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
  const older = useMutation({
    mutationFn: async () => {
      const beforeSequence = current()?.olderCursor
      if (beforeSequence == null) return
      const page = await readTranscriptPage(window.meldshell.getTranscript, {
        threadId,
        beforeSequence,
        limit: 200,
      })
      if (page.nextCursor !== null && page.nextCursor >= beforeSequence)
        throw new Error("Transcript cursor did not advance.")
      client.setQueryData<TranscriptWindow>(key, (previous) =>
        previous ? mergeTranscript(previous, page.events, page.nextCursor) : previous,
      )
    },
  })
  const turns = query.data?.turns ?? []
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
  const targetIndex = turns.findIndex((turn) => turn.id === targetTurnId)
  // Search is an explicit request to walk older windows, not streaming work.
  useEffect(() => {
    if (
      targetTurnId &&
      targetIndex < 0 &&
      query.data?.olderCursor != null &&
      !older.isPending &&
      !older.isError
    )
      older.mutate()
  }, [
    targetTurnId,
    targetIndex,
    query.data?.olderCursor,
    older.isPending,
    older.isError,
    older.mutate,
  ])
  useEffect(() => {
    if (targetIndex >= 0) virtualizer.scrollToIndex(targetIndex, { align: "start" })
    else if (hasTurns) virtualizer.scrollToEnd()
  }, [targetIndex, hasTurns, virtualizer])

  if (query.isLoading) return <div className="transcript-loading">Loading transcript…</div>
  if (query.isError && !query.data)
    return <div className="transcript-loading">This transcript could not be read from disk.</div>
  if (turns.length === 0 && query.data?.olderCursor == null)
    return (
      <div className="transcript-origin">
        <div className="transcript-origin-body">
          {workspace !== undefined && (
            <p className="transcript-origin-workspace" title={workspace.path}>
              <span>Workspace</span>
              <strong>{workspace.name}</strong>
            </p>
          )}
        </div>
      </div>
    )

  return (
    <MarkdownWorkspace value={workspace}>
      <div className="transcript-region">
        {query.isError && (
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Retry transcript updates
          </Button>
        )}
        {query.data?.olderCursor != null && (
          <Button
            variant="ghost"
            size="sm"
            disabled={older.isPending}
            onClick={() => older.mutate()}
          >
            {older.isPending
              ? "Loading earlier messages…"
              : older.isError
                ? "Retry loading earlier messages"
                : "Load earlier messages"}
          </Button>
        )}
        <div ref={scrollRef} className="transcript scrollable" aria-live="polite">
          <div className="transcript-virtual" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const turn = turns[item.index]
              if (turn === undefined) return null
              return (
                <div
                  key={turn.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="transcript-virtual-row"
                  data-search-match={turn.id === targetTurnId || undefined}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <TurnRow turn={turn} />
                </div>
              )
            })}
          </div>
        </div>
        {showLatest && (
          <BaseButton
            type="button"
            className="scroll-latest"
            onClick={() => virtualizer.scrollToEnd()}
          >
            <ArrowDown size={14} aria-hidden="true" />
            Scroll to latest
          </BaseButton>
        )}
      </div>
    </MarkdownWorkspace>
  )
}
