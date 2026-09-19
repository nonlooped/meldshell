import { useState } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
      <div className="git-file-row">
        <button
          type="button"
          onClick={() => openDiff(workspaceId, change.path, side)}
          className="git-file"
          title={`${change.originalPath ? `${change.originalPath} → ` : ""}${change.path} · ${statusLabel(change)}`}
          aria-label={`${change.path}, ${statusLabel(change)}`}
        >
          <FileIcon path={change.path} size={16} />
          <span className="git-file-name">{change.path.slice(slash + 1)}</span>
          <span className="git-file-directory">{change.path.slice(0, Math.max(0, slash))}</span>
          <span className="git-file-status" data-kind={changeKind(change.status)}>
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
  const query = useQuery({
    queryKey: ["git", workspace?.id, limit],
    queryFn: () => window.meldshell.getGitSnapshot({ workspaceId: workspace!.id, limit }),
    enabled: Boolean(workspace),
    refetchInterval: 5000,
    retry: false,
  })
  return (
    <aside className="git-sidebar" aria-label="Source control">
      {!workspace ? (
        <p className="git-notice">Select a thread to view its workspace changes and history.</p>
      ) : query.isPending ? (
        <p className="git-notice" role="status">
          Reading repository…
        </p>
      ) : query.isError ? (
        <p className="git-notice" role="alert">
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
            <p className="git-notice" role="alert">
              {action.error.message}
            </p>
          )}
          <ChangesSection
            busy={action.isPending || commitBusy}
            onAction={(path, operation) => action.mutate({ path, action: operation })}
            workspaceId={workspace.id}
            changes={query.data.changes}
            refreshing={query.isFetching}
            onRefresh={() => void query.refetch()}
          />
          <GraphSection
            workspaceId={workspace.id}
            data={query.data}
            limit={limit}
            setLimit={setLimit}
          />
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
    <section className="git-commit-section" aria-label="Commit changes">
      <div className="git-message-editor">
        <TextField
          className="git-commit-message"
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
      <div className="git-commit-actions">
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
        <p className="git-commit-hint" role="status">
          {mutation.variables === "generate" ? "Generating message…" : "Running Git…"}
        </p>
      )}
      {notice && (
        <p className="git-commit-hint" role="status">
          {notice}
        </p>
      )}
      {mutation.isError && (
        <p className="git-commit-hint" role="alert">
          {mutation.error.message}
        </p>
      )}
    </section>
  )
}

function ChangesSection({
  changes,
  busy,
  onAction,
  workspaceId,
  refreshing,
  onRefresh,
}: {
  changes: readonly GitChange[]
  busy: boolean
  onAction: (path: string, action: GitFileAction) => void
  workspaceId: string
  refreshing: boolean
  onRefresh: () => void
}): React.JSX.Element {
  return (
    <Collapsible.Root render={<section />} className="git-section" defaultOpen>
      <div className="git-section-toolbar">
        <Collapsible.Trigger className="git-section-heading">
          <ChevronRight size={13} className="disclosure-chevron" />
          <span>Changes</span>
          <span className="git-count">{changes.length}</span>
        </Collapsible.Trigger>
        <IconButton label="Refresh source control" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={14} />
        </IconButton>
      </div>
      <Collapsible.Panel className="git-section-body scrollable">
        {(["staged", "unstaged"] as const).map((side) => {
          const files = changes.filter((change) =>
            side === "staged"
              ? change.status !== "??" && change.status[0] !== " " && !/U|AA|DD/.test(change.status)
              : change.status[1] !== " " || /U|AA|DD/.test(change.status),
          )
          return (
            <div key={side}>
              <div className="git-change-group">
                {side === "staged" ? "Staged changes" : "Unstaged changes"}
                <span className="git-count">{files.length}</span>
              </div>
              {files.length === 0 ? (
                <p className="git-notice">No {side} changes.</p>
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
  workspaceId,
  data,
  limit,
  setLimit,
}: {
  workspaceId: string
  data: GitSnapshot
  limit: number
  setLimit: (limit: number) => void
}): React.JSX.Element {
  const rows = layoutGraph(data.commits)
  const graphWidth = Math.max(1, ...rows.map((row) => row.width)) * 14 + 12
  return (
    <Collapsible.Root render={<section />} className="git-section" defaultOpen>
      <Collapsible.Trigger className="git-section-heading">
        <ChevronRight size={13} className="disclosure-chevron" />
        <span>Graph</span>
        <span className="git-count">All branches</span>
      </Collapsible.Trigger>
      <Collapsible.Panel
        className="git-section-body scrollable"
        tabIndex={0}
        role="region"
        aria-label="Commit graph"
      >
        {rows.length === 0 && <p className="git-notice">No commits yet.</p>}
        <ol className="git-commits">
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
            <p className="git-notice">Showing the latest 2,000 commits.</p>
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
      <p className="git-notice" role="status">
        Loading commit changes…
      </p>
    )
  if (query.isError)
    return (
      <div className="git-notice" role="alert">
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
        className="git-commit"
        title={`${commit.subject}\n${commit.author} · ${commit.date}\n${commit.hash}\n${commit.refs}`}
      >
        <svg width={graphWidth} height={28} aria-hidden="true" className="git-lanes">
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
        <span className="git-commit-subject">{commit.subject}</span>
        {commit.refs && <span className="git-ref">{commit.refs}</span>}
        <span className="git-hash">{commit.hash.slice(0, 7)}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel
        className="git-inline-diff"
        role="region"
        aria-label={`Changes in ${commit.hash.slice(0, 7)}`}
        tabIndex={0}
      >
        <p className="git-notice">
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
