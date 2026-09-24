import { GradientSpinner, PopPresence, TextSwap } from "../ui/motion"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { useRef, useState } from "react"
import type { Provider, Thread, Workspace } from "@meldshell/contracts"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronsUpDown,
  Columns2,
  Folder,
  FolderPlus,
  GitBranch,
  Inbox as InboxIcon,
  CircleAlert,
  MoreHorizontal,
  Rows2,
  Search,
  SquarePen,
  Trash2,
  Pin,
  PinOff,
  Settings,
} from "lucide-react"
import { ProviderIcon } from "../ui/ProviderIcon"
import { useThreadDraggable } from "../app/thread-drag"
import type { SplitEdge } from "../app/thread-layout"
import { ariaShortcut, useKeybindings, withShortcut } from "../app/keybindings"
import {
  Button,
  ChordKeys,
  DropdownMenu,
  IconButton,
  MenuAction,
  MenuChoice,
  MenuRadioGroup,
} from "../ui/controls"
import { relativeAge } from "../ui/relative-age"
import { useScheduledThreadIds } from "../schedules/schedule-queries"

type InboxRow =
  | {
      readonly type: "heading"
      readonly id: string
      readonly label: string
      readonly count: number
    }
  | { readonly type: "thread"; readonly id: string; readonly thread: Thread }
  | { readonly type: "notice"; readonly id: string; readonly message: string }

interface InboxProps {
  readonly showSettled: boolean
  readonly onSearch: () => void
  readonly onManageWorkspaces: () => void
  readonly onPin: (thread: Thread) => void
  readonly threads: ReadonlyArray<Thread>
  readonly workspaces: ReadonlyArray<Workspace>
  readonly workspaceNames: ReadonlyMap<string, string>
  readonly providersByThreadId: ReadonlyMap<string, Provider>
  readonly selectedThreadId: string | null
  /** Threads that finished out of view and have not been opened since. */
  readonly unseenThreadIds: ReadonlySet<string>
  readonly onNewThread: () => void
  readonly onAddWorkspace: () => void
  readonly onOpen: (threadId: string) => void
  /** Opens the thread in a new pane beside the one in front, the keyboard route to a split. */
  readonly onOpenBeside: (threadId: string, edge: SplitEdge) => void
  readonly onSetStatus: (thread: Thread) => void
  readonly onDelete: (thread: Thread) => void
  readonly canLoadMore: boolean
  readonly loadingMore: boolean
  readonly onLoadMore: () => void
}

function InboxThread({
  thread,
  workspaceId,
  workspaceNames,
  providersByThreadId,
  selectedThreadId,
  onOpen,
  onOpenBeside,
  onPin,
  onSetStatus,
  onDelete,
  unseen,
  scheduled,
}: Pick<
  InboxProps,
  | "workspaceNames"
  | "providersByThreadId"
  | "selectedThreadId"
  | "onOpen"
  | "onOpenBeside"
  | "onPin"
  | "onSetStatus"
  | "onDelete"
> & {
  thread: Thread
  workspaceId: string
  unseen: boolean
  scheduled: boolean
}): React.JSX.Element {
  const draggable = useThreadDraggable(thread.id, "inbox")
  const archiveChord = useKeybindings((state) => state.bindings.archiveThread)
  const selected = selectedThreadId === thread.id
  const archiveLabel = thread.status === "active" ? "Archive" : "Restore to inbox"
  const finishedUnseen = unseen && finishedActivities.has(thread.activity)
  const attention = attentionColor(thread, finishedUnseen)
  return (
    <div
      className={`motion-colors ${threadRowClasses}`}
      data-status={thread.status}
      data-activity={thread.activity}
      {...(selected ? { "data-selected": "" } : {})}
      {...(attention !== null ? { "data-attention": "" } : {})}
    >
      {attention !== null && (
        <span
          aria-hidden="true"
          className="absolute left-[0] top-[12px] bottom-[12px] w-[2px] rounded-full"
          style={{ background: attention }}
        />
      )}
      <BaseButton
        ref={draggable.ref}
        type="button"
        className="thread-open relative flex min-w-0 flex-1 flex-col justify-start gap-[5px] [padding:8px_10px] border-0 bg-transparent text-inherit cursor-default text-left [&:focus-visible]:[outline-offset:-2px]"
        data-dragging={draggable.isDragging ? "" : undefined}
        aria-current={selected ? "true" : undefined}
        title={`${thread.title}\nDrag onto a pane to open it there`}
        onClick={() => onOpen(thread.id)}
      >
        {thread.status === "active" ? (
          <>
            <span className="thread-title relative overflow-hidden text-ellipsis whitespace-nowrap text-inherit text-[12.5px] font-medium">
              <TextSwap text={thread.title} />
            </span>
            <span className={threadContextClasses}>
              <ProviderIcon provider={providersByThreadId.get(thread.id)} size={13} />
              {thread.worktree !== undefined && (
                <span
                  className="inline-flex shrink-0"
                  role="img"
                  aria-label={`Own branch ${thread.worktree.branch}`}
                  title={`Works on its own branch: ${thread.worktree.branch}`}
                >
                  <GitBranch size={12} strokeWidth={1.75} aria-hidden="true" />
                </span>
              )}
              {scheduled && (
                <span
                  className="inline-flex shrink-0"
                  role="img"
                  aria-label="Has scheduled prompts"
                  title="Has scheduled prompts"
                >
                  <AlarmClock size={12} strokeWidth={1.75} aria-hidden="true" />
                </span>
              )}
              {workspaceId === "all" && (
                <span className="thread-workspace">
                  {workspaceNames.get(thread.workspaceId) ?? "Unknown workspace"}
                </span>
              )}
              <PopPresence className="inline-flex shrink-0" show={thread.activity === "running"}>
                <span
                  className="thread-activity [&[data-attention]]:text-[var(--color-modified)] [&[data-activity='failed']]:text-[var(--color-deleted)] [&[data-activity='running']]:text-[var(--color-info)]"
                  data-activity="running"
                  role="img"
                  aria-label="Running"
                  title="Running"
                >
                  <GradientSpinner />
                </span>
              </PopPresence>
              <PopPresence className="inline-flex shrink-0" show={thread.activity === "approval"}>
                <span
                  className="thread-activity [&[data-attention]]:text-[var(--color-modified)] [&[data-activity='failed']]:text-[var(--color-deleted)] [&[data-activity='running']]:text-[var(--color-info)]"
                  data-activity={thread.activity}
                  data-attention=""
                >
                  <CircleAlert size={12} aria-hidden="true" />
                  Needs approval
                </span>
              </PopPresence>
              <PopPresence className="inline-flex shrink-0" show={thread.activity === "queued"}>
                <span className="thread-activity [&[data-attention]]:text-[var(--color-modified)] [&[data-activity='failed']]:text-[var(--color-deleted)] [&[data-activity='running']]:text-[var(--color-info)]">
                  Queued
                </span>
              </PopPresence>
              <PopPresence className="inline-flex shrink-0" show={thread.activity === "failed"}>
                <span
                  className="thread-activity [&[data-attention]]:text-[var(--color-modified)] [&[data-activity='failed']]:text-[var(--color-deleted)] [&[data-activity='running']]:text-[var(--color-info)]"
                  data-activity={thread.activity}
                  data-attention=""
                >
                  Failed
                </span>
              </PopPresence>
              <PopPresence className="inline-flex shrink-0" show={finishedUnseen}>
                <UnseenMark />
              </PopPresence>
              <time dateTime={thread.updatedAt} title={new Date(thread.updatedAt).toLocaleString()}>
                {relativeAge(thread.updatedAt)}
              </time>
            </span>
          </>
        ) : (
          <>
            <span className="flex-[0_0_14px] text-[var(--text-tertiary)]">
              <ProviderIcon provider={providersByThreadId.get(thread.id)} size={14} />
            </span>
            <span className="thread-title relative overflow-hidden text-ellipsis whitespace-nowrap text-inherit text-[12.5px] font-medium">
              <TextSwap text={thread.title} />
            </span>
            <time dateTime={thread.updatedAt} title={new Date(thread.updatedAt).toLocaleString()}>
              {relativeAge(thread.updatedAt)}
            </time>
          </>
        )}
      </BaseButton>
      <div className={rowActionsClasses}>
        <IconButton
          unstyled
          className={`motion-colors ${rowButtonClasses}`}
          label={selected ? withShortcut(archiveLabel, archiveChord) : archiveLabel}
          onClick={() => onSetStatus(thread)}
        >
          {thread.status === "active" ? (
            <Archive size={14} strokeWidth={1.75} />
          ) : (
            <ArchiveRestore size={14} strokeWidth={1.75} />
          )}
        </IconButton>
        <DropdownMenu
          align="end"
          trigger={
            <BaseButton
              type="button"
              className={`motion-colors ${rowButtonClasses}`}
              aria-label={`Actions for ${thread.title}`}
            >
              <MoreHorizontal size={15} strokeWidth={1.75} />
            </BaseButton>
          }
        >
          <MenuAction
            icon={<Columns2 size={13} strokeWidth={1.75} />}
            onClick={() => onOpenBeside(thread.id, "right")}
          >
            Open to the right
          </MenuAction>
          <MenuAction
            icon={<Rows2 size={13} strokeWidth={1.75} />}
            onClick={() => onOpenBeside(thread.id, "bottom")}
          >
            Open below
          </MenuAction>
          <MenuAction
            icon={thread.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            onClick={() => onPin(thread)}
          >
            {thread.pinned ? "Unpin thread" : "Pin thread"}
          </MenuAction>
          <MenuAction
            icon={<Archive size={13} strokeWidth={1.75} />}
            onClick={() => onSetStatus(thread)}
          >
            {thread.status === "active" ? "Archive thread" : "Restore to inbox"}
          </MenuAction>
          <MenuAction
            icon={<Trash2 size={13} strokeWidth={1.75} />}
            onClick={() => onDelete(thread)}
          >
            Delete permanently
          </MenuAction>
        </DropdownMenu>
      </div>
    </div>
  )
}

const finishedActivities = new Set<Thread["activity"]>(["completed", "idle", "interrupted"])

/** The colour that marks an inbox thread the operator should look at next, like an unread message. */
function attentionColor(thread: Thread, finishedUnseen: boolean): string | null {
  if (thread.status !== "active") return null
  if (thread.activity === "approval") return "var(--color-modified)"
  if (thread.activity === "failed") return "var(--color-deleted)"
  return finishedUnseen ? "var(--color-info)" : null
}

function UnseenMark() {
  return (
    <span className="thread-activity text-[var(--color-info)]">
      <span
        aria-hidden="true"
        className="block w-[6px] h-[6px] rounded-full bg-[var(--color-info)]"
      />
      Done
    </span>
  )
}

const threadRow = (thread: Thread): InboxRow => ({ type: "thread", id: thread.id, thread })

/** What the list says when nothing waits in the inbox, or null while something does. */
function inboxNotice({
  threads,
  visibleThreads,
  workspaceId,
  pinnedThreads,
  activeThreads,
  settledThreads,
}: {
  threads: ReadonlyArray<Thread>
  visibleThreads: ReadonlyArray<Thread>
  workspaceId: string
  pinnedThreads: ReadonlyArray<Thread>
  activeThreads: ReadonlyArray<Thread>
  settledThreads: ReadonlyArray<Thread>
}): string | null {
  if (pinnedThreads.length + activeThreads.length > 0) return null
  if (visibleThreads.length === 0 && workspaceId !== "all")
    return "No threads in this workspace yet."
  if (threads.length === 0) return "No threads yet."
  // The Archived section is right below; without it, search is the way back to them.
  return settledThreads.length > 0
    ? "All caught up."
    : "All caught up. Archived threads stay in search."
}

/** The inbox's sections in order: pinned, the inbox itself, then archived threads when expanded. */
function inboxRows({
  notice,
  pinnedThreads,
  activeThreads,
  settledThreads,
  archivedExpanded,
}: {
  notice: string | null
  pinnedThreads: ReadonlyArray<Thread>
  activeThreads: ReadonlyArray<Thread>
  settledThreads: ReadonlyArray<Thread>
  archivedExpanded: boolean
}): ReadonlyArray<InboxRow> {
  const rows: InboxRow[] = []
  if (notice !== null) rows.push({ type: "notice", id: "notice", message: notice })
  if (pinnedThreads.length > 0)
    rows.push(
      { type: "heading", id: "pinned", label: "Pinned", count: pinnedThreads.length },
      ...pinnedThreads.map(threadRow),
    )
  // A lone inbox needs no label; beside pinned or archived threads it names its section.
  if (activeThreads.length > 0 && (pinnedThreads.length > 0 || settledThreads.length > 0))
    rows.push({ type: "heading", id: "active", label: "Inbox", count: activeThreads.length })
  rows.push(...activeThreads.map(threadRow))
  if (settledThreads.length > 0)
    rows.push(
      { type: "heading", id: "settled", label: "Archived", count: settledThreads.length },
      ...(archivedExpanded ? settledThreads.map(threadRow) : []),
    )
  return rows
}

export function Inbox({
  threads,
  showSettled,
  onSearch,
  onManageWorkspaces,
  onPin,
  workspaces,
  workspaceNames,
  providersByThreadId,
  selectedThreadId,
  unseenThreadIds,
  onNewThread,
  onAddWorkspace,
  onOpen,
  onOpenBeside,
  onSetStatus,
  onDelete,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: InboxProps): React.JSX.Element {
  "use no memo"

  const bindings = useKeybindings((state) => state.bindings)
  const scheduledThreadIds = useScheduledThreadIds()
  // Archived threads are done; they stay out of sight until asked for.
  const [archivedExpanded, setArchivedExpanded] = useState(false)
  const [selectedWorkspaceId, setWorkspaceId] = useState("all")
  const workspaceId = workspaces.some((workspace) => workspace.id === selectedWorkspaceId)
    ? selectedWorkspaceId
    : "all"
  const visibleThreads = threads.filter(
    (thread) => workspaceId === "all" || thread.workspaceId === workspaceId,
  )
  const pinnedThreads = visibleThreads.filter((thread) => thread.pinned)
  const activeThreads = visibleThreads.filter(
    (thread) => thread.status === "active" && !thread.pinned,
  )
  const settledThreads = visibleThreads.filter(
    (thread) => thread.status === "settled" && !thread.pinned && showSettled,
  )
  const rows = inboxRows({
    notice: inboxNotice({
      threads,
      visibleThreads,
      workspaceId,
      pinnedThreads,
      activeThreads,
      settledThreads,
    }),
    pinnedThreads,
    activeThreads,
    settledThreads,
    archivedExpanded,
  })
  const listRef = useRef<HTMLDivElement>(null)
  // TanStack Virtual deliberately exposes mutable imperative methods. The compiler opt-out is
  // confined to this list so the rest of MeldShell remains React Compiler managed.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (row?.type === "heading") return 34
      if (row?.type === "notice") return 110
      return row?.thread.status === "active" ? 60 : 40
    },
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 12,
  })

  const selectedWorkspaceName =
    workspaceId === "all"
      ? "All workspaces"
      : (workspaceNames.get(workspaceId) ?? "Unknown workspace")

  return (
    <>
      <div className="flex flex-col gap-[2px] [padding:0_3px_8px] border-b-[1px] border-b-[color:var(--line-subtle)] mb-[4px]">
        <Button
          variant="primary"
          block
          className="mb-[6px]"
          onClick={onNewThread}
          aria-keyshortcuts={ariaShortcut(bindings.newThread)}
          icon={<SquarePen size={15} strokeWidth={1.8} />}
        >
          New thread
        </Button>
        <BaseButton
          type="button"
          className={`motion-colors ${inboxSearchClasses}`}
          onClick={onSearch}
          aria-label="Search threads and messages"
          aria-keyshortcuts={ariaShortcut(bindings.threadPalette)}
        >
          <Search size={15} strokeWidth={1.7} aria-hidden="true" />
          <span>Search</span>
          {bindings.threadPalette !== "" && <ChordKeys chord={bindings.threadPalette} />}
        </BaseButton>
        <DropdownMenu
          align="start"
          trigger={
            <BaseButton
              type="button"
              className={`motion-colors ${workspaceSelectorClasses}`}
              aria-label={`Show threads from: ${selectedWorkspaceName}`}
            >
              <Folder size={15} strokeWidth={1.65} />
              <span>{selectedWorkspaceName}</span>
              <ChevronsUpDown size={13} strokeWidth={1.7} />
            </BaseButton>
          }
        >
          <MenuRadioGroup
            value={workspaceId}
            onValueChange={(value) => setWorkspaceId(String(value))}
          >
            <MenuChoice value="all">All workspaces</MenuChoice>
            {workspaces.map((workspace) => (
              <MenuChoice key={workspace.id} value={workspace.id}>
                {workspace.name}
              </MenuChoice>
            ))}
          </MenuRadioGroup>
          <MenuAction icon={<FolderPlus size={14} />} onClick={onAddWorkspace}>
            Add workspace
          </MenuAction>
          <MenuAction icon={<Settings size={14} />} onClick={onManageWorkspaces}>
            Manage workspaces
          </MenuAction>
        </DropdownMenu>
      </div>

      <div
        ref={listRef}
        className="min-h-0 overflow-y-auto [scrollbar-gutter:stable]"
        aria-label="Thread inbox"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (row === undefined) return null
            if (row.type === "notice") {
              const showAll = workspaceId !== "all" && visibleThreads.length === 0
              // Its wrapped height depends on the sidebar width, so the list measures it.
              return (
                <div
                  key={row.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute top-[0] left-[0] w-full flex flex-col items-start gap-[8px] [padding:18px_10px_14px] text-[var(--text-secondary)] text-[11.5px] leading-[1.45]"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <InboxIcon
                    size={18}
                    strokeWidth={1.6}
                    aria-hidden="true"
                    className="text-[var(--text-tertiary)]"
                  />
                  <p role="status" className="m-0">
                    {row.message}
                  </p>
                  <Button
                    size="sm"
                    className="mt-[2px]"
                    icon={showAll ? undefined : <SquarePen size={13} strokeWidth={1.8} />}
                    onClick={showAll ? () => setWorkspaceId("all") : onNewThread}
                  >
                    {showAll ? "Show all workspaces" : "New thread"}
                  </Button>
                </div>
              )
            }
            return (
              <div
                key={row.id}
                className="absolute top-[0] left-[0] w-full"
                style={{ transform: `translateY(${item.start}px)`, height: item.size }}
              >
                {row.type === "heading" ? (
                  row.id === "settled" ? (
                    <BaseButton
                      type="button"
                      className="flex h-[34px] items-center gap-[7px] [padding:4px_10px_0] text-[var(--text-secondary)] text-[11px] font-medium w-full border-0 bg-transparent text-left cursor-default motion-colors [&:hover]:text-[var(--text-primary)] [&_svg]:motion-transform [&[aria-expanded='false']_svg]:[transform:rotate(-90deg)]"
                      aria-expanded={archivedExpanded}
                      onClick={() => setArchivedExpanded((expanded) => !expanded)}
                    >
                      <ChevronDown size={13} aria-hidden="true" />
                      <span>{row.label}</span>
                      <span className="text-[var(--text-tertiary)] tabular-nums">{row.count}</span>
                    </BaseButton>
                  ) : (
                    <div className="flex h-[34px] items-center gap-[7px] [padding:4px_10px_0] text-[var(--text-secondary)] text-[11px] font-medium">
                      <span>{row.label}</span>
                      <span className="text-[var(--text-tertiary)] tabular-nums">{row.count}</span>
                    </div>
                  )
                ) : (
                  <InboxThread
                    thread={row.thread}
                    workspaceId={workspaceId}
                    workspaceNames={workspaceNames}
                    providersByThreadId={providersByThreadId}
                    selectedThreadId={selectedThreadId}
                    unseen={unseenThreadIds.has(row.thread.id)}
                    scheduled={scheduledThreadIds.has(row.thread.id)}
                    onOpen={onOpen}
                    onOpenBeside={onOpenBeside}
                    onPin={onPin}
                    onSetStatus={onSetStatus}
                    onDelete={onDelete}
                  />
                )}
              </div>
            )
          })}
        </div>
        {canLoadMore && (
          <BaseButton
            type="button"
            className="sticky bottom-[0] w-full p-[7px] border-0 border-t-[1px] border-t-[color:var(--line-subtle)] text-[var(--text-secondary)] text-[11.5px] bg-[var(--surface-overlay)] cursor-default motion-colors [&:hover:not(:disabled)]:text-[var(--text-primary)] [&:disabled]:text-[var(--text-tertiary)]"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "Loading…" : "Load older threads"}
          </BaseButton>
        )}
      </div>
    </>
  )
}

const threadRowClasses = [
  "relative flex h-[calc(100%_-_4px)] [margin:2px_0] items-stretch rounded-[var(--radius)]",
  "text-[var(--text-secondary)] [&[data-status='active']]:min-h-[56px]",
  "[&[data-status='settled']]:min-h-[36px] [&[data-status='settled']]:text-[var(--text-secondary)]",
  "[&:hover]:bg-[var(--surface-hover)] [&[data-status='settled']:hover]:text-[var(--text-secondary)]",
  "[&[data-selected]]:bg-[var(--surface-selected)] [&[data-selected]]:text-[var(--text-primary)]",
  "[&[data-selected]]:[box-shadow:inset_0_0_0_1px_var(--line-subtle)]",
  "[&[data-selected]_.thread-context]:text-[var(--text-secondary)]",
  "[&[data-status='settled']_.thread-open]:flex-row [&[data-status='settled']_.thread-open]:items-center",
  "[&[data-status='settled']_.thread-open]:gap-[9px]",
  "[&[data-status='settled']_.thread-open]:[padding:0_10px]",
  "[&[data-status='active']:not([data-selected])_.thread-title]:text-[var(--text-secondary)]",
  "[&[data-selected]_.thread-title]:text-[var(--text-primary)]",
  "[&[data-status='active'][data-attention]:not([data-selected])_.thread-title]:text-[var(--text-primary)]",
  "[&[data-status='settled']:not([data-selected])_.thread-title]:text-[var(--text-tertiary)]",
  "[&[data-status='settled']:not([data-selected]):hover_.thread-title]:text-[var(--text-secondary)]",
  "[&[data-status='active']_.thread-title]:pr-[28px]",
  // Room for the archive and menu buttons while they show.
  "[&[data-status='active']:is(:hover,_:focus-within,_[data-selected])_.thread-title]:pr-[60px]",
  "[&[data-status='settled']:is(:hover,_:focus-within,_[data-selected])_.thread-title]:pr-[14px]",
  "[@media(hover:_none)]:[&[data-status='active']_.thread-title]:pr-[60px]",
  "[@media(hover:_none)]:[&[data-status='settled']_.thread-title]:pr-[14px]",
  "[&[data-status='settled']_.thread-title]:min-w-0",
  "[&[data-status='settled']_.thread-title]:flex-[1_1_auto]",
  "[&[data-status='settled']_.thread-title]:font-normal [&[data-status='settled']_time]:min-w-[30px]",
  "[&[data-status='settled']_time]:shrink-0 [&[data-status='settled']_time]:text-[var(--text-tertiary)]",
  "[&[data-status='settled']_time]:text-[11px] [&[data-status='settled']_time]:tabular-nums",
  "[&[data-status='settled']_time]:text-right",
  "[&[data-status='settled']:is(:hover,_:focus-within,_[data-selected])_time]:opacity-[0]",
  "[&[data-status='settled']:has([data-popup-open])_time]:opacity-[0]",
  "[&[data-status='settled']_.row-actions]:top-[4px]",
  "[&:is(:hover,_:focus-within,_[data-selected])_.row-actions]:opacity-[1]",
  "[&:is(:hover,_:focus-within,_[data-selected])_.row-button]:text-[var(--text-secondary)]",
].join(" ")

const threadContextClasses = [
  "thread-context [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap flex",
  "min-w-0 items-center gap-[6px] pr-[0] text-[var(--text-tertiary)] text-[11px] [&_time]:ml-[auto]",
  "[&_time]:tabular-nums [&_time]:shrink-0 [&_>_svg]:shrink-0 [&_.thread-workspace]:min-w-0",
  "[&_.thread-activity]:inline-flex [&_.thread-activity]:shrink-0 [&_.thread-activity]:items-center",
  "[&_.thread-activity]:gap-[4px]",
].join(" ")

const rowActionsClasses = [
  "row-actions absolute z-[1] top-[6px] right-[4px] flex gap-[2px] opacity-[0]",
  "[&:has([data-popup-open])]:opacity-[1] [@media(hover:_none)]:opacity-[1]",
].join(" ")

const rowButtonClasses = [
  "row-button [display:inline-grid] w-[28px] h-[28px] flex-[0_0_28px] border-[1px] border-[color:transparent]",
  "rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default",
  "place-items-center [&:hover:not(:disabled)]:bg-[var(--surface-hover)]",
  "[&:hover:not(:disabled)]:text-[var(--text-primary)] [&[data-popup-open]]:bg-[var(--surface-hover)]",
  "[&[data-popup-open]]:text-[var(--text-primary)] [&:disabled]:text-[var(--text-disabled)]",
].join(" ")

const inboxSearchClasses = [
  "flex h-[32px] min-w-0 w-full items-center gap-[9px] [padding:0_10px] border-0 rounded-[var(--radius)]",
  "bg-transparent text-[var(--text-secondary)] text-left cursor-default [font:inherit]",
  "[&_svg]:flex-none [&_svg]:text-[var(--text-tertiary)] [&_span]:flex-1 [&_span]:text-[12.5px]",
  "[&_kbd]:text-[10px] [&_kbd]:shrink-0 [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]",
  "[&:hover_svg]:text-[var(--text-secondary)]",
].join(" ")

const workspaceSelectorClasses = [
  "flex h-[32px] min-w-0 w-full items-center gap-[9px] [padding:0_8px_0_10px] mt-[4px] border-[1px]",
  "border-[color:var(--line)] rounded-[var(--radius)] [background:rgba(0,_0,_0,_0.12)]",
  "text-[var(--text-secondary)] cursor-default text-left [&_svg]:flex-none",
  "[&_svg]:text-[var(--text-tertiary)] [&_span]:min-w-0 [&_span]:flex-[1_1_auto] [&_span]:text-[12.5px]",
  "[&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap",
  "[&:hover]:[border-color:var(--line-strong)] [&:hover]:text-[var(--text-primary)]",
  "[&[data-popup-open]]:[border-color:var(--line-strong)] [&[data-popup-open]]:text-[var(--text-primary)]",
  "[:root[data-theme='light']_&]:bg-[var(--surface-raised)]",
].join(" ")
