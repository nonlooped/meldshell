import { ActivitySpinner } from "../ui/motion"
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
  const draggable = useThreadDraggable(thread.id, "inbox")
  return (
    <div
      data-motion="background-color border-color color box-shadow"
      className={threadRowClasses}
      data-status={thread.status}
      data-activity={thread.activity}
      {...(selectedThreadId === thread.id ? { "data-selected": "" } : {})}
    >
      <BaseButton
        ref={draggable.ref}
        type="button"
        className="thread-open relative flex min-w-0 flex-1 flex-col justify-start gap-[5px] [padding:8px_10px] border-0 bg-transparent text-inherit cursor-default text-left [&:focus-visible]:[outline-offset:-2px]"
        data-dragging={draggable.isDragging ? "" : undefined}
        aria-current={selectedThreadId === thread.id ? "true" : undefined}
        title={`${thread.title}\nDrag onto a pane to open it there`}
        onClick={() => onOpen(thread.id)}
      >
        {thread.status === "active" ? (
          <>
            <span className="thread-title overflow-hidden text-ellipsis whitespace-nowrap text-inherit text-[12.5px] font-medium">
              {thread.title}
            </span>
            <span className={threadContextClasses}>
              <ProviderIcon provider={providersByThreadId.get(thread.id)} size={13} />
              {workspaceId === "all" && (
                <span className="thread-workspace">
                  {workspaceNames.get(thread.workspaceId) ?? "Unknown workspace"}
                </span>
              )}
              {thread.activity === "running" && (
                <span
                  className="thread-activity [&[data-attention]]:text-[var(--color-modified)] [&[data-activity='failed']]:text-[var(--color-deleted)] [&[data-activity='running']]:text-[var(--color-info)]"
                  data-activity="running"
                  role="img"
                  aria-label="Running"
                  title="Running"
                >
                  <ActivitySpinner />
                </span>
              )}
              {thread.activity === "approval" && (
                <span
                  className="thread-activity [&[data-attention]]:text-[var(--color-modified)] [&[data-activity='failed']]:text-[var(--color-deleted)] [&[data-activity='running']]:text-[var(--color-info)]"
                  data-activity={thread.activity}
                  data-attention=""
                >
                  <CircleAlert size={12} aria-hidden="true" />
                  Needs approval
                </span>
              )}
              {thread.activity === "queued" && (
                <span className="thread-activity [&[data-attention]]:text-[var(--color-modified)] [&[data-activity='failed']]:text-[var(--color-deleted)] [&[data-activity='running']]:text-[var(--color-info)]">
                  Queued
                </span>
              )}
              {thread.activity === "failed" && (
                <span
                  className="thread-activity [&[data-attention]]:text-[var(--color-modified)] [&[data-activity='failed']]:text-[var(--color-deleted)] [&[data-activity='running']]:text-[var(--color-info)]"
                  data-activity={thread.activity}
                  data-attention=""
                >
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
            <span className="flex-[0_0_14px] text-[var(--text-tertiary)]">
              <ProviderIcon provider={providersByThreadId.get(thread.id)} size={14} />
            </span>
            <span className="thread-title overflow-hidden text-ellipsis whitespace-nowrap text-inherit text-[12.5px] font-medium">
              {thread.title}
            </span>
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
            data-motion="background-color color opacity border-color"
            type="button"
            className={iconButtonClasses}
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
      <div className="pb-[8px] border-b-[1px] border-b-[color:var(--line-subtle)] mb-[4px]">
        <div className="flex items-center gap-[2px] [padding:0_3px] [&_.inbox-search]:gap-[6px] [&_.inbox-search]:px-[8px]">
          <BaseButton
            data-motion="background-color border-color color opacity box-shadow"
            data-motion-duration="0.2"
            type="button"
            className={inboxSearchClasses}
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
            className="shrink-0"
            onClick={onNewThread}
            icon={<SquarePen size={16} strokeWidth={1.7} />}
          >
            New thread
          </Button>
        </div>

        <div className="flex h-[36px] items-center gap-[4px] [padding:0_3px_0_8px]">
          <DropdownMenu
            align="start"
            trigger={
              <BaseButton type="button" className={workspaceSelectorClasses}>
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

      <div
        ref={listRef}
        className="min-h-0 overflow-y-auto [scrollbar-gutter:stable]"
        aria-label="Thread inbox"
      >
        {noResultsMessage !== null && (
          <div className="m-0 [padding:18px_10px] text-[var(--text-secondary)] text-[11.5px] leading-[1.45] [&_p]:[margin:0_0_10px]">
            <p role="status">{noResultsMessage}</p>
            <BaseButton
              type="button"
              className="[padding:4px_8px] border-[1px] border-[color:var(--line)] rounded-[var(--radius-sm)] bg-transparent text-[var(--text-secondary)] cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]"
              onClick={workspaceId !== "all" ? () => setWorkspaceId("all") : onNewThread}
            >
              {workspaceId !== "all" ? "Show all workspaces" : "New thread"}
            </BaseButton>
          </div>
        )}
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (row === undefined) return null
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
                      className="flex h-[34px] items-center gap-[7px] [padding:4px_10px_0] text-[var(--text-secondary)] text-[11px] font-medium w-full border-0 bg-transparent text-left cursor-default [&:hover]:text-[var(--text-primary)] [&[aria-expanded='false']_svg]:[transform:rotate(-90deg)]"
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
            className="sticky bottom-[0] w-full p-[7px] border-0 border-t-[1px] border-t-[color:var(--line-subtle)] text-[var(--text-secondary)] bg-[var(--surface-overlay)] cursor-pointer"
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

const threadRowClasses = [
  "relative flex h-[calc(100%_-_4px)] [margin:2px_0] items-stretch rounded-[var(--radius)]",
  "text-[var(--text-secondary)] [&[data-status='active']]:min-h-[56px]",
  "[&[data-status='settled']]:min-h-[36px] [&[data-status='settled']]:text-[var(--text-secondary)]",
  "[&:hover]:bg-[var(--surface-hover)] [&[data-status='settled']:hover]:text-[var(--text-secondary)]",
  "[&[data-selected]]:bg-[var(--surface-active)] [&[data-selected]]:text-[var(--text-primary)]",
  "[&[data-selected]::before]:absolute [&[data-selected]::before]:top-[12px]",
  "[&[data-selected]::before]:bottom-[12px] [&[data-selected]::before]:left-[0]",
  "[&[data-selected]::before]:w-[2px] [&[data-selected]::before]:rounded-[2px]",
  "[&[data-selected]::before]:bg-[var(--accent)] [&[data-selected]::before]:[content:'']",
  "[&[data-selected]_.thread-context]:text-[var(--text-secondary)]",
  "[&[data-status='settled']_.thread-open]:flex-row [&[data-status='settled']_.thread-open]:items-center",
  "[&[data-status='settled']_.thread-open]:gap-[9px]",
  "[&[data-status='settled']_.thread-open]:[padding:0_10px]",
  "[&[data-status='active']:not([data-selected])_.thread-title]:text-[var(--text-secondary)]",
  "[&[data-selected]_.thread-title]:text-[var(--text-primary)]",
  "[&[data-selected]_.thread-title]:font-medium [&[data-status='active']_.thread-title]:pr-[28px]",
  "[&[data-status='settled']_.thread-title]:min-w-0",
  "[&[data-status='settled']_.thread-title]:flex-[1_1_auto]",
  "[&[data-status='settled']_.thread-title]:font-normal [&[data-status='settled']_time]:min-w-[30px]",
  "[&[data-status='settled']_time]:shrink-0 [&[data-status='settled']_time]:text-[var(--text-tertiary)]",
  "[&[data-status='settled']_time]:text-[10.5px] [&[data-status='settled']_time]:tabular-nums",
  "[&[data-status='settled']_time]:text-right",
  "[&[data-status='settled']:is(:hover,_:focus-within,_[data-selected])_time]:opacity-[0]",
  "[&[data-status='settled']:has(.row-menu-trigger[data-popup-open])_time]:opacity-[0]",
  "[&[data-status='settled']_.row-menu-trigger]:top-[4px]",
  "[&:hover_.row-menu-trigger]:text-[var(--text-secondary)] [&:hover_.row-menu-trigger]:opacity-[1]",
  "[&:focus-within_.row-menu-trigger]:text-[var(--text-secondary)]",
  "[&:focus-within_.row-menu-trigger]:opacity-[1]",
  "[&[data-selected]_.row-menu-trigger]:text-[var(--text-secondary)]",
  "[&[data-selected]_.row-menu-trigger]:opacity-[1]",
].join(" ")

const threadContextClasses = [
  "thread-context [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap flex",
  "min-w-0 items-center gap-[6px] pr-[0] text-[var(--text-tertiary)] text-[10.5px] [&_time]:ml-[auto]",
  "[&_time]:tabular-nums [&_time]:shrink-0 [&_>_svg]:shrink-0 [&_.thread-workspace]:min-w-0",
  "[&_.thread-activity]:inline-flex [&_.thread-activity]:shrink-0 [&_.thread-activity]:items-center",
  "[&_.thread-activity]:gap-[4px]",
].join(" ")

const iconButtonClasses = [
  "icon-button [display:inline-grid] w-[28px] h-[28px] flex-[0_0_28px] border-[1px] border-[color:transparent]",
  "rounded-[var(--radius-sm)] bg-transparent text-[var(--text-secondary)] cursor-default",
  "place-items-center [&:hover:not(:disabled)]:bg-[var(--surface-hover)]",
  "[&:hover:not(:disabled)]:text-[var(--text-primary)] [&[data-popup-open]]:bg-[var(--surface-hover)]",
  "[&[data-popup-open]]:text-[var(--text-primary)] [&:disabled]:text-[var(--text-disabled)]",
  "row-menu-trigger absolute z-[1] top-[6px] right-[4px] text-[var(--text-tertiary)] opacity-[0]",
  "[&:focus-visible]:text-[var(--text-secondary)] [&:focus-visible]:opacity-[1]",
  "[&[data-popup-open]]:text-[var(--text-secondary)] [&[data-popup-open]]:opacity-[1]",
].join(" ")

const inboxSearchClasses = [
  "inbox-search flex h-[34px] min-w-0 flex-[1_1_auto] items-center gap-[9px] [padding:0_10px]",
  "rounded-[var(--radius)] text-[var(--text-secondary)] [&:focus-within]:bg-[var(--surface-hover)]",
  "[&:focus-within]:[box-shadow:inset_0_0_0_1px_var(--line-strong)]",
  "[&:focus-within]:text-[var(--text-secondary)]",
  "[&:has(input:focus-visible)]:[outline:2px_solid_var(--accent)]",
  "[&:has(input:focus-visible)]:[outline-offset:-2px] [&_input]:w-full [&_input]:min-w-0 [&_input]:p-0",
  "[&_input]:border-0 [&_input]:[outline:0] [&_input]:bg-transparent",
  "[&_input]:text-[var(--text-primary)] [&_input]:text-[12.5px]",
  "[&_input::placeholder]:text-[var(--text-tertiary)] [&_input::-webkit-search-cancel-button]:hidden",
  "[&_kbd]:[font:10px_var(--font-mono)] [&_kbd]:text-[var(--text-tertiary)] [&_kbd]:shrink-0 w-full",
  "border-[1px] border-[color:var(--line)] rounded-[var(--radius)] bg-[var(--surface-hover)] [padding:0_10px]",
  "[font:inherit] text-left cursor-pointer text-[var(--text-secondary)] [&_span]:flex-1",
  "[&_span]:text-[11.5px] [&_span]:whitespace-nowrap [&:hover]:bg-[var(--surface-hover)]",
  "[&:hover]:text-[var(--text-primary)]",
].join(" ")

const workspaceSelectorClasses = [
  "flex min-w-0 flex-[1_1_auto] items-center gap-[9px] [padding:6px_2px] border-0 bg-transparent",
  "text-[var(--text-secondary)] cursor-default text-left [&_svg]:flex-none",
  "[&_svg]:text-[var(--text-tertiary)] [&_span]:min-w-0 [&_span]:flex-[1_1_auto]",
  "[&_span]:overflow-hidden [&_span]:text-[var(--text-secondary)] [&_span]:text-ellipsis",
  "[&_span]:whitespace-nowrap [&:hover]:text-[var(--text-primary)]",
  "[&:hover_span]:text-[var(--text-primary)] [&:hover_svg]:text-[var(--text-secondary)]",
].join(" ")
