import { Button as BaseButton } from "@base-ui-components/react/button"
import { useRef, useState } from "react"
import type { Provider, Thread, Workspace } from "@meldshell/contracts"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  Archive,
  ChevronDown,
  Columns2,
  Folder,
  FolderPlus,
  LoaderCircle,
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
import { threadDragProps } from "../app/thread-drag"
import type { SplitEdge } from "../app/thread-layout"
import { Button, DropdownMenu, MenuAction, MenuChoice, MenuRadioGroup } from "../ui/controls"

type InboxRow =
  | {
      readonly type: "heading"
      readonly id: string
      readonly label: string
      readonly count: number
    }
  | { readonly type: "thread"; readonly id: string; readonly thread: Thread }

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
> & { thread: Thread; workspaceId: string }): React.JSX.Element {
  return (
    <div
      className="thread-row"
      data-status={thread.status}
      data-activity={thread.activity}
      {...(selectedThreadId === thread.id ? { "data-selected": "" } : {})}
    >
      <BaseButton
        type="button"
        className="thread-open"
        {...threadDragProps(thread.id)}
        aria-current={selectedThreadId === thread.id ? "true" : undefined}
        title={`${thread.title}\nDrag onto a pane to open it there`}
        onClick={() => onOpen(thread.id)}
      >
        {thread.status === "active" ? (
          <>
            <span className="thread-title">{thread.title}</span>
            <span className="thread-context">
              <ProviderIcon provider={providersByThreadId.get(thread.id)} size={13} />
              {workspaceId === "all" && (
                <span className="thread-workspace">
                  {workspaceNames.get(thread.workspaceId) ?? "Unknown workspace"}
                </span>
              )}
              {thread.activity === "running" && (
                <span
                  className="thread-activity"
                  data-activity="running"
                  role="img"
                  aria-label="Running"
                  title="Running"
                >
                  <LoaderCircle className="thread-spinner" size={12} aria-hidden="true" />
                </span>
              )}
              {thread.activity === "approval" && (
                <span className="thread-activity" data-activity={thread.activity} data-attention="">
                  <CircleAlert size={12} aria-hidden="true" />
                  Needs approval
                </span>
              )}
              {thread.activity === "queued" && <span className="thread-activity">Queued</span>}
              {thread.activity === "failed" && (
                <span className="thread-activity" data-activity={thread.activity} data-attention="">
                  Failed
                </span>
              )}
              <time dateTime={thread.updatedAt} title={new Date(thread.updatedAt).toLocaleString()}>
                {formatThreadAge(thread.updatedAt)}
              </time>
            </span>
          </>
        ) : (
          <>
            <span className="thread-row-icon">
              <ProviderIcon provider={providersByThreadId.get(thread.id)} size={14} />
            </span>
            <span className="thread-title">{thread.title}</span>
            <time dateTime={thread.updatedAt} title={new Date(thread.updatedAt).toLocaleString()}>
              {formatThreadAge(thread.updatedAt)}
            </time>
          </>
        )}
      </BaseButton>
      <DropdownMenu
        align="end"
        trigger={
          <BaseButton
            type="button"
            className="icon-button row-menu-trigger"
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
          {thread.status === "active" ? "Archive thread" : "Restore thread"}
        </MenuAction>
        <MenuAction icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={() => onDelete(thread)}>
          Delete permanently
        </MenuAction>
      </DropdownMenu>
    </div>
  )
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

  const [archivedExpanded, setArchivedExpanded] = useState(true)
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
  const rows: ReadonlyArray<InboxRow> = [
    ...(pinnedThreads.length
      ? [
          { type: "heading" as const, id: "pinned", label: "Pinned", count: pinnedThreads.length },
          ...pinnedThreads.map((thread) => ({ type: "thread" as const, id: thread.id, thread })),
          ...(activeThreads.length
            ? [
                {
                  type: "heading" as const,
                  id: "active",
                  label: "Active",
                  count: activeThreads.length,
                },
              ]
            : []),
        ]
      : []),
    ...activeThreads.map((thread) => ({ type: "thread" as const, id: thread.id, thread })),
    ...(settledThreads.length === 0
      ? []
      : [
          {
            type: "heading" as const,
            id: "settled",
            label: "Archived",
            count: settledThreads.length,
          },
          ...(archivedExpanded ? settledThreads : []).map((thread) => ({
            type: "thread" as const,
            id: thread.id,
            thread,
          })),
        ]),
  ]
  const noResultsMessage =
    rows.length > 0
      ? null
      : workspaceId !== "all"
        ? "No threads to show in this workspace."
        : threads.length === 0
          ? "No threads yet."
          : "No active threads. Search your history or start a new thread."
  const listRef = useRef<HTMLDivElement>(null)
  // TanStack Virtual deliberately exposes mutable imperative methods. The compiler opt-out is
  // confined to this list so the rest of MeldShell remains React Compiler managed.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (row?.type === "heading") return 34
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
      <div className="inbox-top">
        <div className="inbox-search-row">
          <BaseButton
            type="button"
            className="inbox-search search-trigger"
            onClick={onSearch}
            aria-label="Search transcripts"
            aria-keyshortcuts="Control+k"
          >
            <Search size={15} strokeWidth={1.7} aria-hidden="true" />
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </BaseButton>
          <Button
            variant="ghost"
            className="inbox-new-thread"
            onClick={onNewThread}
            icon={<SquarePen size={16} strokeWidth={1.7} />}
          >
            New thread
          </Button>
        </div>

        <div className="inbox-workspace-bar">
          <DropdownMenu
            align="start"
            trigger={
              <BaseButton type="button" className="workspace-selector">
                <Folder size={15} strokeWidth={1.65} />
                <span>{selectedWorkspaceName}</span>
                <ChevronDown size={13} strokeWidth={1.7} />
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
      </div>

      <div ref={listRef} className="inbox-list scrollable" aria-label="Thread inbox">
        {noResultsMessage !== null && (
          <div className="inbox-no-results">
            <p role="status">{noResultsMessage}</p>
            <BaseButton
              type="button"
              className="inbox-reset"
              onClick={workspaceId !== "all" ? () => setWorkspaceId("all") : onNewThread}
            >
              {workspaceId !== "all" ? "Show all workspaces" : "New thread"}
            </BaseButton>
          </div>
        )}
        <div className="virtual-list" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (row === undefined) return null
            return (
              <div
                key={row.id}
                className="virtual-row"
                style={{ transform: `translateY(${item.start}px)`, height: item.size }}
              >
                {row.type === "heading" ? (
                  row.id === "settled" ? (
                    <BaseButton
                      type="button"
                      className="section-heading section-toggle"
                      aria-expanded={archivedExpanded}
                      onClick={() => setArchivedExpanded((expanded) => !expanded)}
                    >
                      <ChevronDown size={13} aria-hidden="true" />
                      <span>{row.label}</span>
                      <span className="section-count">{row.count}</span>
                    </BaseButton>
                  ) : (
                    <div className="section-heading">
                      <span>{row.label}</span>
                      <span className="section-count">{row.count}</span>
                    </div>
                  )
                ) : (
                  <InboxThread
                    thread={row.thread}
                    workspaceId={workspaceId}
                    workspaceNames={workspaceNames}
                    providersByThreadId={providersByThreadId}
                    selectedThreadId={selectedThreadId}
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
            className="inbox-load-more"
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

const formatThreadAge = (timestamp: string): string => {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000),
  )
  if (elapsedSeconds < 60) return "now"
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}m`
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}h`
  if (elapsedSeconds < 604_800) return `${Math.floor(elapsedSeconds / 86_400)}d`
  if (elapsedSeconds < 2_592_000) return `${Math.floor(elapsedSeconds / 604_800)}w`
  return `${Math.floor(elapsedSeconds / 2_592_000)}mo`
}
