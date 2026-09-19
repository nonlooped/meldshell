import { useState, type DragEvent } from "react"
import type { AppSnapshot, Thread, TranscriptSearchResult } from "@meldshell/contracts"
import { Group, Panel, Separator } from "react-resizable-panels"
import { Columns2, Maximize2, MoreHorizontal, Rows2, X } from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { AppDialog, Button, DropdownMenu, IconButton, MenuAction } from "../ui/controls"
import { ThreadView } from "../threads/ThreadView"
import { useTabStore } from "./tab-store"
import { dropZone, type DropZone, type SplitEdge, type ThreadLayout } from "./thread-layout"
import { endThreadDrag, threadDragProps, threadDragType, useThreadDrag } from "./thread-drag"

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

/** The pane's own coordinates decide the drop: its outer quarters split, its middle takes over. */
function zoneFor(event: DragEvent<HTMLElement>): DropZone {
  const bounds = event.currentTarget.getBoundingClientRect()
  return dropZone(
    (event.clientX - bounds.left) / bounds.width,
    (event.clientY - bounds.top) / bounds.height,
  )
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
        className="text-input"
        aria-label="Find a thread to open beside this one"
        placeholder="Find a thread…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="split-thread-picker scrollable">
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
  return (
    <div className="thread-tile-header">
      <BaseButton
        type="button"
        className="thread-tile-title"
        {...threadDragProps(thread.id)}
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
            type="button"
            className="icon-button"
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
  const dragging = useThreadDrag((state) => state.threadId)
  const [preview, setPreview] = useState<{ threadId: string; zone: DropZone } | null>(null)
  // A drop, a cancelled drag, or a drag that ended elsewhere leaves no event on this pane; the
  // preview is tied to the thread being dragged so it cannot outlive it.
  if (preview !== null && preview.threadId !== dragging) setPreview(null)
  const focus = (): void => {
    if (!focused) useTabStore.getState().selectThread(thread.id)
  }
  // Files and text dragged into the composer are not thread moves and must reach their own handlers.
  const accepts = (event: DragEvent<HTMLElement>): boolean =>
    dragging !== null &&
    dragging !== thread.id &&
    event.dataTransfer.types.includes(threadDragType) &&
    threads.some((candidate) => candidate.id === dragging)
  return (
    <section
      className="thread-tile"
      aria-label={thread.title}
      data-focused={split && focused ? "" : undefined}
      onFocusCapture={focus}
      onPointerDownCapture={focus}
      onDragOver={(event) => {
        if (dragging === null || !accepts(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        setPreview({ threadId: dragging, zone: zoneFor(event) })
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setPreview(null)
      }}
      onDrop={(event) => {
        if (dragging === null || !accepts(event)) return
        event.preventDefault()
        event.stopPropagation()
        useTabStore.getState().dropThread(thread.id, dragging, zoneFor(event))
        setPreview(null)
        endThreadDrag()
      }}
    >
      {split && <ThreadTileHeader thread={thread} threads={threads} onFocus={focus} />}
      <ThreadView snapshot={snapshot} thread={thread} searchTarget={searchTarget} />
      {preview !== null && (
        <div className="thread-drop-preview" data-zone={preview.zone}>
          <span>{zoneLabels[preview.zone]}</span>
        </div>
      )}
    </section>
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
      <div className="centered-state" role="status">
        <p>Loading thread…</p>
      </div>
    ) : (
      <ThreadTile thread={thread} split={split} {...props} />
    )
  }
  return (
    <Group
      className="thread-split"
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
        className="pane-separator thread-split-separator"
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
  if (layout === null) return null
  // A single pane keeps the plain thread view: pane chrome appears only once panes have to be told
  // apart.
  return <LayoutNode key={layout.id} node={layout} split={layout.kind === "split"} {...props} />
}
