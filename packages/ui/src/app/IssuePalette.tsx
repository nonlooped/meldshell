import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { Workspace } from "@meldshell/contracts"
import type { IssueList, IssueSummary } from "@meldshell/contracts/ipc"
import { CircleDot } from "lucide-react"
import { useState } from "react"
import { MenuAction } from "../ui/controls"
import { ActivitySpinner, Shimmer } from "../ui/motion"
import { relativeAge } from "../ui/relative-age"
import { Palette, PaletteSearch, useDebouncedQuery } from "./Palette"

const LABELS_SHOWN = 2

/** Ctrl+Shift+N: start a thread on its own branch from an open issue in the workspace's repository. */
export function IssuePalette({
  open,
  onOpenChange,
  workspace,
  onStart,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly workspace: Workspace | undefined
  /** Resolves once the thread exists; the palette stays open until then. */
  readonly onStart: (workspaceId: string, issue: IssueSummary) => Promise<unknown>
}): React.JSX.Element {
  return (
    <Palette open={open} onOpenChange={onOpenChange} title="Start a thread from an issue">
      <IssueSearch
        workspace={workspace}
        onStart={(issue) =>
          workspace === undefined
            ? Promise.resolve()
            : onStart(workspace.id, issue).then(() => onOpenChange(false))
        }
      />
    </Palette>
  )
}

function IssueSearch({
  workspace,
  onStart,
}: {
  readonly workspace: Workspace | undefined
  readonly onStart: (issue: IssueSummary) => Promise<unknown>
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const [starting, setStarting] = useState<IssueSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebouncedQuery(query)
  const issues = useQuery({
    queryKey: ["issues", workspace?.id, debounced],
    queryFn: () => window.meldshell.listIssues({ workspaceId: workspace!.id, query: debounced }),
    enabled: workspace !== undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  })
  const items = starting !== null ? [starting] : (issues.data?.issues ?? [])
  const start = (issue: IssueSummary) => {
    if (starting !== null) return
    setStarting(issue)
    setError(null)
    onStart(issue).catch((cause: unknown) => {
      setStarting(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }
  const notice = issueNotice({
    workspace,
    error,
    starting: starting !== null,
    searched: debounced !== "",
    issues,
  })
  return (
    <>
      <PaletteSearch<IssueSummary>
        items={items}
        query={query}
        onQueryChange={(next) => {
          if (starting === null) setQuery(next)
        }}
        placeholder={
          workspace === undefined
            ? "Start a thread from an issue"
            : `Start a thread from an issue in ${workspace.name}`
        }
        itemKey={(issue) => String(issue.number)}
        itemLabel={(issue) => `#${issue.number} ${issue.title}`}
        onPick={start}
        notice={notice}
        contextActions={(issue) => (
          <>
            <MenuAction onClick={() => start(issue)}>Start a thread</MenuAction>
            <MenuAction onClick={() => window.open(issue.url, "_blank")}>Open on GitHub</MenuAction>
            <MenuAction onClick={() => void navigator.clipboard.writeText(issue.url)}>
              Copy link
            </MenuAction>
          </>
        )}
        renderItem={(issue) => (
          <IssueRow issue={issue} starting={starting?.number === issue.number} />
        )}
      />
      <p className="m-0 flex items-center gap-[6px] [padding:7px_16px] border-t-[1px] border-t-[color:var(--line-subtle)] text-[11.5px] text-[var(--text-tertiary)]">
        {starting !== null
          ? `Creating a branch for #${starting.number}…`
          : "The thread gets its own branch, and the issue goes to the agent with your first message."}
      </p>
    </>
  )
}

/** Why the list is empty or not yet shown, or undefined when the results speak for themselves. */
function issueNotice({
  workspace,
  error,
  starting,
  searched,
  issues,
}: {
  readonly workspace: Workspace | undefined
  readonly error: string | null
  readonly starting: boolean
  readonly searched: boolean
  readonly issues: { readonly data?: IssueList | undefined; readonly error: Error | null }
}): React.ReactNode {
  if (workspace === undefined) return "Add a workspace first."
  if (error !== null)
    return <span className="text-[var(--color-deleted)] [overflow-wrap:anywhere]">{error}</span>
  if (starting) return undefined
  const problem = issues.error?.message ?? issues.data?.unavailable
  if (problem) return <span className="[overflow-wrap:anywhere]">{problem}</span>
  if (issues.data === undefined) return <Shimmer>Loading open issues…</Shimmer>
  if (issues.data.issues.length > 0) return undefined
  return searched ? "No open issues match." : `${workspace.name} has no open issues.`
}

function IssueRow({
  issue,
  starting,
}: {
  readonly issue: IssueSummary
  readonly starting: boolean
}): React.JSX.Element {
  const labels = issue.labels.slice(0, LABELS_SHOWN)
  return (
    <>
      <span className="grid w-[16px] flex-none place-items-center text-[var(--color-added)]">
        {starting ? (
          <ActivitySpinner />
        ) : (
          <CircleDot size={14} strokeWidth={2} aria-hidden="true" />
        )}
      </span>
      <span className="flex-none text-[var(--text-tertiary)] tabular-nums">#{issue.number}</span>
      <span className="min-w-0 flex-1 truncate">{issue.title}</span>
      {labels.map((label) => (
        <span
          key={label.name}
          className="hidden min-[560px]:inline-flex max-w-[120px] flex-none items-center gap-[5px] h-[18px] [padding:0_7px] rounded-full border-[1px] border-[color:var(--line-subtle)] text-[11px] text-[var(--text-secondary)]"
        >
          <span
            className="size-[7px] flex-none rounded-full"
            style={{
              background: /^[\da-f]{6}$/i.test(label.color)
                ? `#${label.color}`
                : "var(--text-tertiary)",
            }}
            aria-hidden="true"
          />
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {issue.labels.length > LABELS_SHOWN && (
        <span className="hidden min-[560px]:inline flex-none text-[11px] text-[var(--text-tertiary)]">
          +{issue.labels.length - LABELS_SHOWN}
        </span>
      )}
      {issue.updatedAt !== "" && (
        <span
          className="w-[28px] flex-none text-right text-[11.5px] text-[var(--text-tertiary)] tabular-nums"
          title={`Updated ${new Date(issue.updatedAt).toLocaleString()}`}
        >
          {relativeAge(issue.updatedAt)}
        </span>
      )}
    </>
  )
}
