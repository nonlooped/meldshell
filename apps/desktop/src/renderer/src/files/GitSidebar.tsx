import { useState } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels"
import type { Workspace } from "@meldshell/contracts"
import type { GitChange, GitSnapshot, GitDiffSide, GitFileAction } from "@meldshell/contracts/ipc"
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Plus,
  Minus,
  Undo2,
  Sparkles,
  Check,
  Upload,
} from "lucide-react"
import { Button, IconButton, DropdownMenu, MenuAction, TextField } from "../ui/controls"
import { FileIcon } from "../ui/FileIcon"
import { useTabStore } from "../app/tab-store"
import { ChangeDiff } from "../ui/ChangeDiff"
import { type GraphRow, layoutGraph } from "./git-graph"
const graphColors = [
  "var(--color-info)",
  "var(--color-added)",
  "var(--color-modified)",
  "var(--color-renamed)",
  "var(--color-deleted)",
]

function laneColor(lane: number): string {
  return graphColors[lane % graphColors.length]!
}

function changeKind(status: string): string {
  if (status === "??") return "untracked"
  if (/U|AA|DD/.test(status)) return "conflict"
  if (status.includes("D")) return "deleted"
  if (status.includes("A")) return "added"
  if (/[RC]/.test(status)) return "renamed"
  return "modified"
}

function statusLabel(change: GitChange): string {
  if (change.status === "??") return "Untracked"
  if (/U|AA|DD/.test(change.status)) return "Conflict"
  const names: Record<string, string> = {
    M: "Modified",
    A: "Added",
    D: "Deleted",
    R: "Renamed",
    C: "Copied",
    T: "Type changed",
  }
  return [
    ...new Set(
      change.status
        .trim()
        .split("")
        .map((code) => names[code] ?? code),
    ),
  ].join(", ")
}

function FileRow({
  workspaceId,
  change,
  side,
  busy,
  onAction,
}: {
  side: GitDiffSide
  busy: boolean
  onAction: (path: string, action: GitFileAction) => void
  workspaceId: string
  change: GitChange
}): React.JSX.Element {
  const openDiff = useTabStore((state) => state.openDiff)
  const slash = change.path.lastIndexOf("/")
  return (
    <div className="git-file-entry">
      <div
        className={
          "flex items-center gap-[0] pr-[6px] [&_.git-file]:flex-1 [&_.git-file]:min-w-0 [&_.git-file]:pr-[6px] [&_>_.icon-button]:shrink-0"
        }
      >
        <button
          type="button"
          onClick={() => openDiff(workspaceId, change.path, side)}
          className={
            "git-file [&:hover]:bg-[var(--surface-hover)] flex items-center gap-[7px] w-full h-[28px] border-0 [padding:0_14px] bg-transparent text-left cursor-pointer [&_>_svg]:shrink-0 [&_>_svg]:text-[var(--text-tertiary)]"
          }
          title={`${change.originalPath ? `${change.originalPath} → ` : ""}${change.path} · ${statusLabel(change)}`}
          aria-label={`${change.path}, ${statusLabel(change)}`}
        >
          <FileIcon path={change.path} size={16} />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-primary)]">
            {change.path.slice(slash + 1)}
          </span>
          <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)] text-[10px]">
            {change.path.slice(0, Math.max(0, slash))}
          </span>
          <span className={gitFileStatusClasses} data-kind={changeKind(change.status)}>
            {change.status === "??" ? "U" : change.status.trim()}
          </span>
        </button>
        <IconButton
          label={`${side === "staged" ? "Unstage" : "Stage"} ${change.path}`}
          disabled={busy}
          onClick={() => onAction(change.path, side === "staged" ? "unstage" : "stage")}
        >
          {side === "staged" ? <Minus size={14} /> : <Plus size={14} />}
        </IconButton>
        {side === "unstaged" && (
          <IconButton
            label={`Restore ${change.path}`}
            disabled={busy || /U|AA|DD/.test(change.status)}
            onClick={() => onAction(change.path, "restore")}
          >
            <Undo2 size={14} />
          </IconButton>
        )}
      </div>
    </div>
  )
}

export function GitSidebar({
  workspace,
  threadId,
}: {
  workspace?: Workspace
  threadId?: string
}): React.JSX.Element {
  const [limit, setLimit] = useState(100)
  const client = useQueryClient()
  const refresh = async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["git", workspace?.id] }),
      client.invalidateQueries({ queryKey: ["git-diff", workspace?.id] }),
    ])
  }
  const action = useMutation({
    mutationFn: (input: { path: string; action: GitFileAction }) =>
      window.meldshell.gitFileAction({ workspaceId: workspace!.id, ...input }),
    onSettled: refresh,
  })
  const [commitBusy, setCommitBusy] = useState(false)
  const [changesOpen, setChangesOpen] = useState(true)
  const [graphOpen, setGraphOpen] = useState(true)
  const changesPanelRef = usePanelRef()
  const graphPanelRef = usePanelRef()
  const query = useQuery({
    queryKey: ["git", workspace?.id, limit],
    queryFn: () => window.meldshell.getGitSnapshot({ workspaceId: workspace!.id, limit }),
    enabled: Boolean(workspace),
    refetchInterval: 5000,
    retry: false,
  })
  return (
    <aside
      className="h-full min-w-0 flex flex-col overflow-hidden text-[var(--text-secondary)] text-[12px]"
      aria-label="Source control"
    >
      {!workspace ? (
        <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
          Select a thread to view its workspace changes and history.
        </p>
      ) : query.isPending ? (
        <p
          className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
          role="status"
        >
          Reading repository…
        </p>
      ) : query.isError ? (
        <p
          className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
          role="alert"
        >
          {query.error.message}
          <br />
          Check the workspace folder and refresh to try again.
          <Button size="sm" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        </p>
      ) : (
        <>
          <CommitSection
            threadId={threadId}
            workspaceId={workspace.id}
            data={query.data}
            busy={action.isPending}
            onBusy={setCommitBusy}
            onRefresh={refresh}
          />
          {action.isError && (
            <p
              className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
              role="alert"
            >
              {action.error.message}
            </p>
          )}
          <Group className="min-h-0 flex-1" orientation="vertical">
            <Panel
              id="changes"
              panelRef={changesPanelRef}
              className="min-h-0"
              defaultSize="65%"
              minSize="96px"
              collapsedSize="32px"
              collapsible
              onResize={({ inPixels }) => setChangesOpen(inPixels > 32)}
            >
              <ChangesSection
                open={changesOpen}
                onOpenChange={(open) => {
                  setChangesOpen(open)
                  if (open) changesPanelRef.current?.expand()
                  else changesPanelRef.current?.collapse()
                }}
                busy={action.isPending || commitBusy}
                onAction={(path, operation) => action.mutate({ path, action: operation })}
                workspaceId={workspace.id}
                changes={query.data.changes}
                refreshing={query.isFetching}
                onRefresh={() => void query.refetch()}
              />
            </Panel>
            <Separator
              className={gitSectionSeparatorClasses}
              aria-label="Resize source control sections"
            />
            <Panel
              id="graph"
              panelRef={graphPanelRef}
              className="min-h-0"
              defaultSize="35%"
              minSize="96px"
              collapsedSize="32px"
              collapsible
              onResize={({ inPixels }) => setGraphOpen(inPixels > 32)}
            >
              <GraphSection
                open={graphOpen}
                onOpenChange={(open) => {
                  setGraphOpen(open)
                  if (open) graphPanelRef.current?.expand()
                  else graphPanelRef.current?.collapse()
                }}
                workspaceId={workspace.id}
                data={query.data}
                limit={limit}
                setLimit={setLimit}
              />
            </Panel>
          </Group>
        </>
      )}
    </aside>
  )
}

function CommitSection({
  threadId,
  workspaceId,
  data,
  busy,
  onBusy,
  onRefresh,
}: {
  threadId?: string
  workspaceId: string
  data: GitSnapshot
  busy: boolean
  onBusy: (busy: boolean) => void
  onRefresh: () => Promise<void>
}): React.JSX.Element {
  const [message, setMessage] = useState("")
  const [notice, setNotice] = useState("")
  const staged = data.changes.some((change) => change.status !== "??" && change.status[0] !== " ")
  const conflicts = data.changes.some((change) => /U|AA|DD/.test(change.status))
  const mutation = useMutation({
    mutationFn: async (operation: "generate" | "commit" | "commit-push" | "push") => {
      onBusy(true)
      setNotice("")
      if (operation === "generate") {
        const generated = await window.meldshell.generateCommitMessage({
          workspaceId,
          threadId,
        })
        setMessage(generated.replace(/\s*\r?\n\s*/g, " ").trim())
        return
      }
      if (operation !== "push") {
        await window.meldshell.gitCommit({ workspaceId, message })
        setMessage("")
        setNotice("Committed staged changes.")
      }
      if (operation === "push" || operation === "commit-push") {
        try {
          await window.meldshell.gitPush(workspaceId)
        } catch (error) {
          throw new Error(
            `${operation === "commit-push" ? "Commit succeeded, but push failed. " : ""}${String(error)}`,
          )
        }
        setNotice(
          operation === "push" ? "Pushed successfully." : "Committed and pushed successfully.",
        )
      }
    },
    onSettled: async () => {
      try {
        await onRefresh()
      } finally {
        onBusy(false)
      }
    },
  })
  const disabled = busy || mutation.isPending
  const canCommit = !disabled && staged && !conflicts && Boolean(message.trim())
  return (
    <section className="[padding:10px_12px] shrink-0" aria-label="Commit changes">
      <div
        className={
          "relative [&_>_.icon-button]:absolute [&_>_.icon-button]:top-[50%] [&_>_.icon-button]:right-[4px] [&_>_.icon-button]:[transform:translateY(-50%)] [&_.git-commit-message]:pr-[34px]"
        }
      >
        <TextField
          className="git-commit-message w-full min-w-0"
          aria-label="Commit message"
          placeholder={`Message on ${data.branch} (Ctrl+Enter to commit)`}
          value={message}
          disabled={disabled}
          onValueChange={setMessage}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault()
              if (canCommit) mutation.mutate("commit")
            }
          }}
        />
        <IconButton
          label="Generate commit message"
          disabled={disabled || !staged || conflicts}
          onClick={() => mutation.mutate("generate")}
        >
          <Sparkles size={15} />
        </IconButton>
      </div>
      <div className={"flex items-center gap-[6px] mt-[8px] [&_>_.button:first-child]:flex-1"}>
        <Button variant="primary" disabled={!canCommit} onClick={() => mutation.mutate("commit")}>
          <Check size={14} />
          Commit
        </Button>
        <DropdownMenu
          align="end"
          trigger={
            <Button aria-label="More commit actions" disabled={disabled}>
              <ChevronDown size={14} />
            </Button>
          }
        >
          <MenuAction disabled={!canCommit} onClick={() => mutation.mutate("commit-push")}>
            Commit &amp; Push
          </MenuAction>
          <MenuAction
            disabled={disabled}
            onClick={() => mutation.mutate("push")}
            icon={<Upload size={14} />}
          >
            Push
          </MenuAction>
        </DropdownMenu>
      </div>
      {mutation.isPending && (
        <p
          className="[margin:8px_0_0] text-[var(--text-tertiary)] text-[11px] [overflow-wrap:anywhere]"
          role="status"
        >
          {mutation.variables === "generate" ? "Generating message…" : "Running Git…"}
        </p>
      )}
      {notice && (
        <p
          className="[margin:8px_0_0] text-[var(--text-tertiary)] text-[11px] [overflow-wrap:anywhere]"
          role="status"
        >
          {notice}
        </p>
      )}
      {mutation.isError && (
        <p
          className="[margin:8px_0_0] text-[var(--text-tertiary)] text-[11px] [overflow-wrap:anywhere]"
          role="alert"
        >
          {mutation.error.message}
        </p>
      )}
    </section>
  )
}

function ChangesSection({
  open,
  onOpenChange,
  changes,
  busy,
  onAction,
  workspaceId,
  refreshing,
  onRefresh,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  changes: readonly GitChange[]
  busy: boolean
  onAction: (path: string, action: GitFileAction) => void
  workspaceId: string
  refreshing: boolean
  onRefresh: () => void
}): React.JSX.Element {
  return (
    <Collapsible.Root
      render={<section />}
      className="flex flex-col h-full min-h-0 border-t-[1px] border-t-[color:var(--line-subtle)]"
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex items-center shrink-0 pr-[6px] [&_.git-section-heading]:flex-1 [&_.git-section-heading]:min-w-0">
        <Collapsible.Trigger className="git-section-heading flex items-center gap-[6px] w-full min-h-[32px] shrink-0 [padding:0_12px] border-0 bg-transparent cursor-pointer text-[11px] font-medium [&:hover]:bg-[var(--surface-hover)]">
          <ChevronRight
            data-motion="transform background-color"
            data-motion-duration="0.2"
            size={13}
            className={
              "disclosure-chevron flex-none [[data-panel-open]_>_&]:[transform:rotate(90deg)]"
            }
          />
          <span>Changes</span>
          <span className="ml-[auto] text-[var(--text-tertiary)] text-[10px] font-normal">
            {changes.length}
          </span>
        </Collapsible.Trigger>
        <IconButton label="Refresh source control" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={14} />
        </IconButton>
      </div>
      <Collapsible.Panel className="flex-1 min-h-0 overflow-x-auto pb-[8px] overflow-y-auto [scrollbar-gutter:stable]">
        {(["staged", "unstaged"] as const).map((side) => {
          const files = changes.filter((change) =>
            side === "staged"
              ? change.status !== "??" && change.status[0] !== " " && !/U|AA|DD/.test(change.status)
              : change.status[1] !== " " || /U|AA|DD/.test(change.status),
          )
          return (
            <div key={side}>
              <div className="flex items-center gap-[6px] [padding:7px_14px] text-[11px] font-medium">
                {side === "staged" ? "Staged changes" : "Unstaged changes"}
                <span className="ml-[auto] text-[var(--text-tertiary)] text-[10px] font-normal">
                  {files.length}
                </span>
              </div>
              {files.length === 0 ? (
                <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
                  No {side} changes.
                </p>
              ) : (
                files.map((change) => (
                  <FileRow
                    key={change.path}
                    workspaceId={workspaceId}
                    change={change}
                    side={side}
                    busy={busy}
                    onAction={onAction}
                  />
                ))
              )}
            </div>
          )
        })}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function GraphSection({
  open,
  onOpenChange,
  workspaceId,
  data,
  limit,
  setLimit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  data: GitSnapshot
  limit: number
  setLimit: (limit: number) => void
}): React.JSX.Element {
  const rows = layoutGraph(data.commits)
  const graphWidth = Math.max(1, ...rows.map((row) => row.width)) * 14 + 12
  return (
    <Collapsible.Root
      render={<section />}
      className="flex flex-col h-full min-h-0"
      open={open}
      onOpenChange={onOpenChange}
    >
      <Collapsible.Trigger className="git-section-heading flex items-center gap-[6px] w-full min-h-[32px] shrink-0 [padding:0_12px] border-0 bg-transparent cursor-pointer text-[11px] font-medium [&:hover]:bg-[var(--surface-hover)]">
        <ChevronRight
          data-motion="transform background-color"
          data-motion-duration="0.2"
          size={13}
          className={
            "disclosure-chevron flex-none [[data-panel-open]_>_&]:[transform:rotate(90deg)]"
          }
        />
        <span>Graph</span>
        <span className="ml-[auto] text-[var(--text-tertiary)] text-[10px] font-normal">
          All branches
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel
        className="flex-1 min-h-0 overflow-x-auto pb-[8px] overflow-y-auto [scrollbar-gutter:stable]"
        tabIndex={0}
        role="region"
        aria-label="Commit graph"
      >
        {rows.length === 0 && (
          <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
            No commits yet.
          </p>
        )}
        <ol className="[list-style:none] p-0 m-0">
          {rows.map((row) => (
            <CommitRow
              key={row.commit.hash}
              workspaceId={workspaceId}
              row={row}
              graphWidth={graphWidth}
            />
          ))}
        </ol>
        {data.hasMore &&
          (limit < 2000 ? (
            <Button
              variant="ghost"
              size="sm"
              block
              onClick={() => setLimit(Math.min(limit + 100, 2000))}
            >
              Load older commits
            </Button>
          ) : (
            <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
              Showing the latest 2,000 commits.
            </p>
          ))}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function CommitDiff({
  workspaceId,
  hash,
}: {
  workspaceId: string
  hash: string
}): React.JSX.Element {
  const query = useQuery({
    queryKey: ["git-commit-diff", workspaceId, hash],
    queryFn: () => window.meldshell.getGitCommitDiff({ workspaceId, hash }),
    staleTime: Infinity,
    retry: false,
  })
  if (query.isPending)
    return (
      <p
        className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
        role="status"
      >
        Loading commit changes…
      </p>
    )
  if (query.isError)
    return (
      <div
        className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
        role="alert"
      >
        {query.error.message}
        <Button size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    )
  return <ChangeDiff path={hash.slice(0, 7)} patch={query.data} />
}

function CommitRow({
  workspaceId,
  row,
  graphWidth,
}: {
  workspaceId: string
  row: GraphRow
  graphWidth: number
}): React.JSX.Element {
  const { commit, lane, edges, incoming } = row
  return (
    <Collapsible.Root render={<li />}>
      <Collapsible.Trigger
        className="w-full border-0 bg-transparent text-left cursor-pointer pl-[0] flex items-center gap-[6px] h-[28px] pr-[12px] [&:hover]:bg-[var(--surface-hover)] [&[aria-expanded='true']]:bg-[var(--surface-hover)]"
        title={`${commit.subject}\n${commit.author} · ${commit.date}\n${commit.hash}\n${commit.refs}`}
      >
        <svg
          width={graphWidth}
          height={28}
          aria-hidden="true"
          className="shrink-0 overflow-visible [&_path]:[fill:none] [&_path]:[stroke:currentColor] [&_path]:stroke-[1.25] [&_circle]:[fill:currentColor] [&_circle]:[stroke:currentColor]"
        >
          {edges.map((edge, index) => (
            <path
              key={index}
              style={{ color: laneColor(edge.color) }}
              d={`M ${12 + edge.from * 14} ${edge.startsAtNode ? 14 : 0} L ${12 + edge.from * 14} 14 L ${12 + edge.to * 14} 28`}
            />
          ))}
          {incoming && (
            <path style={{ color: laneColor(row.color) }} d={`M ${12 + lane * 14} 0 V 14`} />
          )}
          <circle style={{ color: laneColor(row.color) }} cx={12 + lane * 14} cy={14} r={3.5} />
        </svg>
        <span className="flex-1 min-w-[50px] overflow-hidden text-ellipsis whitespace-nowrap">
          {commit.subject}
        </span>
        {commit.refs && (
          <span className="max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap border-[1px] border-[color:var(--line-strong)] rounded-[var(--radius-sm)] [padding:1px_4px] text-[10px] text-[var(--color-info)]">
            {commit.refs}
          </span>
        )}
        <span className="[font-family:var(--font-mono)] text-[var(--text-tertiary)] text-[10px]">
          {commit.hash.slice(0, 7)}
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel
        className="[&_.event-diff]:border-0 [&_.event-diff]:rounded-[0] max-h-[480px] overflow-auto border-y-[1px] border-y-[color:var(--line-subtle)] [&_.work-item-output]:m-0 [&_.work-item-output]:whitespace-pre-wrap [&_.work-item-output]:[overflow-wrap:anywhere]"
        role="region"
        aria-label={`Changes in ${commit.hash.slice(0, 7)}`}
        tabIndex={0}
      >
        <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
          {commit.subject}
          <br />
          {commit.author} · {commit.date.slice(0, 10)}
          {commit.parents.length > 1 && (
            <>
              <br />
              Compared with first parent
            </>
          )}
        </p>
        <CommitDiff workspaceId={workspaceId} hash={commit.hash} />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

const gitFileStatusClasses = [
  "ml-[auto] [font-family:var(--font-mono)] text-[11px] whitespace-pre",
  "[&[data-kind='added']]:text-[var(--color-added)] [&[data-kind='untracked']]:text-[var(--color-added)]",
  "[&[data-kind='modified']]:text-[var(--color-modified)]",
  "[&[data-kind='renamed']]:text-[var(--color-renamed)]",
  "[&[data-kind='deleted']]:text-[var(--color-deleted)]",
  "[&[data-kind='conflict']]:text-[var(--color-deleted)]",
].join(" ")

const gitSectionSeparatorClasses = [
  "relative h-[1px] flex-[0_0_1px] bg-[var(--line-subtle)] outline-none [&::after]:absolute",
  "[&::after]:z-[2] [&::after]:[inset:-3px_0] [&::after]:[content:''] [&:hover]:bg-[var(--line-strong)]",
  "[&:focus-visible]:bg-[var(--line-strong)] [&[data-separator='active']]:bg-[var(--line-strong)]",
].join(" ")
