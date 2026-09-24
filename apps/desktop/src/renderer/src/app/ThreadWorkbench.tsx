import {
  centeredStateClasses,
  textInputClasses,
  iconButtonClasses,
  paneSeparatorClasses,
} from "../ui/styles"
import { Pressable, FadeDiv } from "../ui/motion"
import { useState } from "react"
import type { AppSnapshot, Thread, TranscriptSearchResult } from "@meldshell/contracts"
import { Group, Panel, Separator } from "react-resizable-panels"
import { Columns2, Maximize2, MoreHorizontal, Rows2, SquareTerminal, X } from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { AppDialog, Button, DropdownMenu, IconButton, MenuAction } from "../ui/controls"
import { ThreadView } from "../threads/ThreadView"
import { TerminalPanel } from "../terminals/TerminalPanel"
import { terminalApi, useTerminalStore } from "../terminals/terminal-store"
import { useTabStore } from "./tab-store"
import {
  movePane,
  splitPane,
  type DropZone,
  type SplitEdge,
  type ThreadLayout,
} from "./thread-layout"
import { useThreadDrag, useThreadDraggable, useThreadDroppable } from "./thread-drag"

interface WorkbenchProps {
  readonly snapshot: AppSnapshot
  readonly threads: ReadonlyArray<Thread>
  readonly searchTarget: TranscriptSearchResult | null
}

const zoneLabels: Readonly<Record<DropZone, string>> = {
  left: "Split left",
  right: "Split right",
  top: "Split above",
  bottom: "Split below",
  center: "Show here",
}

const edgeLabels: Readonly<Record<SplitEdge, string>> = {
  left: "Split — open on the left",
  right: "Split — open on the right",
  top: "Split — open above",
  bottom: "Split — open below",
}

/** The keyboard route to a split: pick the thread the new pane should show. */
function SplitPicker({
  thread,
  threads,
  edge,
  onClose,
}: {
  thread: Thread
  threads: ReadonlyArray<Thread>
  edge: SplitEdge
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const candidates = threads.filter(
    (candidate) =>
      candidate.id !== thread.id &&
      candidate.title.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={edgeLabels[edge]}
      actions={<Button onClick={onClose}>Cancel</Button>}
    >
      <input
        className={`motion-colors motion-duration-200 ${textInputClasses}`}
        aria-label="Find a thread to open beside this one"
        placeholder="Find a thread…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="grid max-h-[320px] gap-[4px] mt-[12px] [&_.button]:justify-start [&_.button]:[overflow-wrap:anywhere] overflow-y-auto [scrollbar-gutter:stable]">
        {candidates.map((candidate) => (
          <Button
            key={candidate.id}
            variant="ghost"
            block
            onClick={() => {
              useTabStore.getState().dropThread(thread.id, candidate.id, edge)
              onClose()
            }}
          >
            {candidate.title}
          </Button>
        ))}
        {candidates.length === 0 && <p>No matching threads. Create another thread with Ctrl+N.</p>}
      </div>
    </AppDialog>
  )
}

function ThreadTileHeader({
  thread,
  threads,
  onFocus,
}: {
  thread: Thread
  threads: ReadonlyArray<Thread>
  onFocus: () => void
}): React.JSX.Element {
  const [picker, setPicker] = useState<SplitEdge | null>(null)
  const draggable = useThreadDraggable(thread.id, "pane")
  const terminalShown = useTerminalStore((state) => state.threads[thread.id]?.open === true)
  return (
    <div className="thread-tile-header flex min-w-0 items-center gap-[2px] [padding:3px_6px] border-b-[1px] border-b-[color:var(--line-subtle)] text-[var(--text-tertiary)]">
      <BaseButton
        ref={draggable.ref}
        type="button"
        className={
          "flex min-w-0 flex-1 items-center gap-[8px] p-[4px] border-0 bg-transparent text-inherit [font:inherit] text-[12px] text-left [cursor:grab] [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap [&_>_small]:flex-none [&_>_small]:text-[var(--color-modified)] [&_>_small]:whitespace-nowrap"
        }
        data-dragging={draggable.isDragging ? "" : undefined}
        onClick={onFocus}
        title={`${thread.title}\nDrag onto a pane to move or split it`}
      >
        <span>{thread.title}</span>
        {thread.activity === "approval" && <small>Needs approval</small>}
      </BaseButton>
      <DropdownMenu
        align="end"
        trigger={
          <BaseButton
            render={<Pressable />}
            type="button"
            className={`motion-colors ${iconButtonClasses}`}
            aria-label={`Pane layout for ${thread.title}`}
          >
            <MoreHorizontal size={15} strokeWidth={1.75} />
          </BaseButton>
        }
      >
        <MenuAction icon={<Columns2 size={13} />} onClick={() => setPicker("right")}>
          Split right…
        </MenuAction>
        <MenuAction icon={<Rows2 size={13} />} onClick={() => setPicker("bottom")}>
          Split below…
        </MenuAction>
        <MenuAction
          icon={<Maximize2 size={13} />}
          onClick={() => useTabStore.getState().maximizeThread(thread.id)}
        >
          Show only this thread
        </MenuAction>
        {terminalApi !== undefined && (
          <MenuAction
            icon={<SquareTerminal size={13} />}
            onClick={() => useTerminalStore.getState().toggle(thread.id)}
          >
            {terminalShown ? "Hide terminal" : "Show terminal"}
          </MenuAction>
        )}
      </DropdownMenu>
      <IconButton
        label={`Close ${thread.title}`}
        onClick={() => useTabStore.getState().closeThread(thread.id)}
      >
        <X size={13} strokeWidth={2} />
      </IconButton>
      {picker !== null && (
        <SplitPicker
          thread={thread}
          threads={threads}
          edge={picker}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

function ThreadTile({
  thread,
  split,
  snapshot,
  threads,
  searchTarget,
}: WorkbenchProps & { thread: Thread; split: boolean }): React.JSX.Element {
  const focused = useTabStore((state) => state.selectedThreadId === thread.id)
  const droppable = useThreadDroppable(thread.id)
  const focus = (): void => {
    if (!focused) useTabStore.getState().selectThread(thread.id)
  }
  return (
    <section
      ref={droppable.ref}
      className={threadTileClasses}
      aria-label={thread.title}
      data-focused={split && focused ? "" : undefined}
      onFocusCapture={focus}
      onPointerDownCapture={focus}
    >
      {split && <ThreadTileHeader thread={thread} threads={threads} onFocus={focus} />}
      <ThreadBody snapshot={snapshot} thread={thread} searchTarget={searchTarget} />
    </section>
  )
}

/** The conversation, with the thread's terminal panel below it while that panel is shown. */
function ThreadBody({
  snapshot,
  thread,
  searchTarget,
}: Omit<WorkbenchProps, "threads"> & { thread: Thread }): React.JSX.Element {
  const terminals = useTerminalStore((state) => state.threads[thread.id])
  const terminalPanelId = `terminals:${thread.id}`
  // The group stays mounted either way, so showing the terminal never remounts the conversation.
  return (
    <Group
      className="w-full h-full min-w-0 min-h-0"
      orientation="vertical"
      onLayoutChanged={(layout, meta) => {
        const size = layout[terminalPanelId]
        if (meta.isUserInteraction && size !== undefined)
          useTerminalStore.getState().resizePanel(thread.id, size)
      }}
    >
      <Panel id={`conversation:${thread.id}`} minSize="160px">
        <ThreadView snapshot={snapshot} thread={thread} searchTarget={searchTarget} />
      </Panel>
      {terminals?.open && (
        <>
          <Separator
            className={`motion-colors ${paneSeparatorClasses}`}
            aria-label="Resize terminal"
          />
          <Panel id={terminalPanelId} defaultSize={`${terminals.size}%`} minSize="96px">
            <TerminalPanel thread={thread} terminals={terminals} />
          </Panel>
        </>
      )}
    </Group>
  )
}

function DropPreviewNode({
  node,
  threadId,
  label,
}: {
  readonly node: ThreadLayout
  readonly threadId: string
  readonly label: string
}): React.JSX.Element {
  if (node.kind === "thread") {
    const dropped = node.threadId === threadId
    return (
      <div className={dropPreviewPaneClasses} data-dropped={dropped ? "" : undefined}>
        {dropped && <span>{label}</span>}
      </div>
    )
  }
  return (
    <div
      className="flex w-full h-full min-w-0 min-h-0"
      style={{ flexDirection: node.orientation === "horizontal" ? "row" : "column" }}
    >
      <div className="flex-none min-w-0 min-h-0" style={{ flexBasis: `${node.ratio}%` }}>
        <DropPreviewNode node={node.first} threadId={threadId} label={label} />
      </div>
      <div className="flex-none min-w-0 min-h-0" style={{ flexBasis: `${100 - node.ratio}%` }}>
        <DropPreviewNode node={node.second} threadId={threadId} label={label} />
      </div>
    </div>
  )
}

function LayoutNode({
  node,
  split,
  ...props
}: WorkbenchProps & { node: ThreadLayout; split: boolean }): React.JSX.Element {
  if (node.kind === "thread") {
    const thread = props.threads.find((candidate) => candidate.id === node.threadId)
    return thread === undefined ? (
      <FadeDiv className={centeredStateClasses} role="status">
        <p>Loading thread…</p>
      </FadeDiv>
    ) : (
      <ThreadTile thread={thread} split={split} {...props} />
    )
  }
  return (
    <Group
      className="w-full h-full min-w-0 min-h-0"
      orientation={node.orientation}
      onLayoutChanged={(layout, meta) => {
        const ratio = layout[node.first.id]
        // Non-interactive callbacks report the sizes this tree already holds; only drags and the
        // separator's arrow keys change them.
        if (meta.isUserInteraction && ratio !== undefined)
          useTabStore.getState().resizeSplit(node.id, ratio)
      }}
    >
      <Panel id={node.first.id} defaultSize={`${node.ratio}%`} minSize="15%">
        <LayoutNode key={node.first.id} node={node.first} split {...props} />
      </Panel>
      <Separator
        className={`motion-colors ${paneSeparatorClasses}`}
        aria-label="Resize thread panes"
      />
      <Panel id={node.second.id} defaultSize={`${100 - node.ratio}%`} minSize="15%">
        <LayoutNode key={node.second.id} node={node.second} split {...props} />
      </Panel>
    </Group>
  )
}

export function ThreadWorkbench(props: WorkbenchProps): React.JSX.Element | null {
  const layout = useTabStore((state) => state.layout)
  const preview = useThreadDrag((state) => state.preview)
  if (layout === null) return null
  const previewLayout =
    preview === null
      ? null
      : preview.zone === "center"
        ? movePane(layout, preview.targetThreadId, preview.threadId)
        : splitPane(layout, preview.targetThreadId, preview.threadId, preview.zone, "drop-preview")
  // A single pane keeps the plain thread view: pane chrome appears only once panes have to be told
  // apart.
  return (
    <div className="relative w-full h-full min-w-0 min-h-0">
      <LayoutNode key={layout.id} node={layout} split={layout.kind === "split"} {...props} />
      {preview !== null && previewLayout !== null && (
        <div className="absolute z-[5] [inset:0] pointer-events-none" aria-hidden="true">
          <DropPreviewNode
            node={previewLayout}
            threadId={preview.threadId}
            label={zoneLabels[preview.zone]}
          />
        </div>
      )}
    </div>
  )
}

const threadTileClasses = [
  "relative grid w-full h-full min-w-0 min-h-0 grid-rows-[minmax(0,_1fr)] overflow-hidden",
  "[&:has(>_.thread-tile-header)]:grid-rows-[auto_minmax(0,_1fr)]",
  "[&:has(>_.thread-tile-header)]:[container-type:inline-size]",
  "[&[data-focused]_>_.thread-tile-header]:[border-bottom-color:var(--line)]",
  "[&[data-focused]_>_.thread-tile-header]:text-[var(--text-primary)]",
  "[&:has(>_.thread-tile-header)_.transcript]:px-[clamp(16px,_7cqi,_104px)]",
  "[&:has(>_.thread-tile-header)_.transcript-loading]:px-[clamp(16px,_7cqi,_104px)]",
  "[&:has(>_.thread-tile-header)_.transcript-origin]:px-[clamp(16px,_7cqi,_104px)]",
  "[&:has(>_.thread-tile-header)_.composer-zone]:px-[clamp(16px,_7cqi,_104px)]",
  "[&:has(>_.thread-tile-header)_.thread-branch-toggle]:px-[clamp(16px,_7cqi,_104px)]",
].join(" ")

const dropPreviewPaneClasses = [
  "grid w-full h-full min-w-0 min-h-0 border-[1px] border-[color:var(--line-strong)] place-items-center",
  "[&[data-dropped]]:border-[color:var(--accent)] [&[data-dropped]]:bg-[var(--surface-selected)]",
  "[&_>_span]:[padding:5px_9px] [&_>_span]:rounded-[var(--radius-sm)] [&_>_span]:bg-[var(--accent)]",
  "[&_>_span]:text-[var(--accent-foreground)] [&_>_span]:text-[12px]",
].join(" ")
