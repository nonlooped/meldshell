import {
  centeredStateClasses,
  textInputClasses,
  iconButtonClasses,
  paneSeparatorClasses,
} from "../ui/styles"
import { Pressable, FadeDiv, useMotionPreference } from "../ui/motion"
import { useLayoutEffect, useRef, useState } from "react"
import type { AppSnapshot, Thread, TranscriptSearchResult } from "@meldshell/contracts"
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels"
import { Columns2, Globe, Maximize2, MoreHorizontal, Rows2, SquareTerminal, X } from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { AppDialog, Button, DropdownMenu, IconButton, MenuAction } from "../ui/controls"
import { ThreadView } from "../threads/ThreadView"
import { TerminalPanel } from "../terminals/TerminalPanel"
import { terminalApi, useTerminalStore } from "../terminals/terminal-store"
import { useKeybindings } from "./keybindings"
import { PreviewPanel } from "../preview/PreviewPanel"
import { previewSupported, usePreviewStore } from "../preview/preview-store"
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
  const newThreadChord = useKeybindings((state) => state.bindings.newThread)
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
        {candidates.length === 0 && (
          <p>
            No matching threads.{" "}
            {newThreadChord === ""
              ? "Create another thread from the inbox."
              : `Create another thread with ${newThreadChord}.`}
          </p>
        )}
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
  const previewShown = usePreviewStore((state) => state.threads[thread.id]?.open === true)
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
        {previewSupported && (
          <MenuAction
            icon={<Globe size={13} />}
            onClick={() => usePreviewStore.getState().toggle(thread.id)}
          >
            {previewShown ? "Hide preview" : "Show preview"}
          </MenuAction>
        )}
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
    if (!focused) useTabStore.getState().openThread(thread.id)
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

/**
 * A panel shown and hidden from a store, which glides open and shut like the sidebars; drags still
 * apply instantly. The panel stays mounted collapsed, and `shown` keeps its content mounted until it
 * finishes folding shut.
 */
function useDrawer(open: boolean, size: number) {
  const reduced = useMotionPreference()
  const groupRef = useRef<HTMLDivElement>(null)
  const panelRef = usePanelRef()
  const [closing, setClosing] = useState(false)
  // Only a toggle reopens to the stored size; resizing an open panel is already on screen.
  const sizeRef = useRef(size)
  sizeRef.current = size
  const toggled = useRef(open)
  useLayoutEffect(() => {
    if (toggled.current === open) return
    toggled.current = open
    const group = groupRef.current
    if (group) group.dataset.panelMotion = ""
    if (open) panelRef.current?.resize(`${sizeRef.current}%`)
    else panelRef.current?.collapse()
    setClosing(!open)
    // Outlasts the transition, which is skipped entirely when motion is reduced.
    const settle = window.setTimeout(
      () => {
        if (group) delete group.dataset.panelMotion
        setClosing(false)
      },
      reduced ? 0 : 400,
    )
    return () => window.clearTimeout(settle)
  }, [open, panelRef, reduced])
  return {
    groupRef,
    panelRef,
    shown: open || closing,
    defaultSize: open ? `${size}%` : 0,
  }
}

/** The conversation, with the thread's terminal panel below it while that panel is shown. */
function ConversationAndTerminal({
  snapshot,
  thread,
  searchTarget,
}: Omit<WorkbenchProps, "threads"> & { thread: Thread }): React.JSX.Element {
  const terminals = useTerminalStore((state) => state.threads[thread.id])
  const drawer = useDrawer(terminals?.open === true, terminals?.size ?? 0)
  const terminalPanelId = `terminals:${thread.id}`
  // The group stays mounted either way, so showing the terminal never remounts the conversation.
  return (
    <Group
      elementRef={drawer.groupRef}
      className="motion-panels motion-duration-220 w-full h-full min-w-0 min-h-0"
      orientation="vertical"
      onLayoutChanged={(layout, meta) => {
        const size = layout[terminalPanelId]
        if (meta.isUserInteraction && size !== undefined && terminals?.open)
          useTerminalStore.getState().resizePanel(thread.id, size)
      }}
    >
      <Panel id={`conversation:${thread.id}`} minSize="160px">
        <ThreadView snapshot={snapshot} thread={thread} searchTarget={searchTarget} />
      </Panel>
      <Separator
        className={`motion-colors ${paneSeparatorClasses} ${drawer.shown ? "" : "invisible"}`}
        aria-label="Resize terminal"
        disabled={!terminals?.open}
      />
      <Panel
        id={terminalPanelId}
        panelRef={drawer.panelRef}
        defaultSize={drawer.defaultSize}
        minSize="96px"
        collapsible
        collapsedSize={0}
        disabled={!terminals?.open}
      >
        {drawer.shown && terminals !== undefined && (
          <TerminalPanel thread={thread} terminals={terminals} />
        )}
      </Panel>
    </Group>
  )
}

/** The conversation and terminal, with the thread's browser preview beside them while it is shown. */
function ThreadBody(
  props: Omit<WorkbenchProps, "threads"> & { thread: Thread },
): React.JSX.Element {
  const { thread } = props
  const preview = usePreviewStore((state) => state.threads[thread.id])
  const drawer = useDrawer(preview?.open === true, preview?.size ?? 0)
  const previewPanelId = `preview:${thread.id}`
  return (
    <Group
      elementRef={drawer.groupRef}
      className="motion-panels motion-duration-220 w-full h-full min-w-0 min-h-0"
      orientation="horizontal"
      onLayoutChanged={(layout, meta) => {
        const size = layout[previewPanelId]
        if (meta.isUserInteraction && size !== undefined && preview?.open)
          usePreviewStore.getState().resize(thread.id, size)
      }}
    >
      <Panel id={`work:${thread.id}`} minSize="280px">
        <ConversationAndTerminal {...props} />
      </Panel>
      <Separator
        className={`motion-colors ${paneSeparatorClasses} ${drawer.shown ? "" : "invisible"}`}
        aria-label="Resize preview"
        disabled={!preview?.open}
      />
      <Panel
        id={previewPanelId}
        panelRef={drawer.panelRef}
        defaultSize={drawer.defaultSize}
        minSize="240px"
        collapsible
        collapsedSize={0}
        disabled={!preview?.open}
      >
        {drawer.shown && preview !== undefined && (
          <PreviewPanel thread={thread} preview={preview} />
        )}
      </Panel>
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
