import { useEffect, useState } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Thread } from "@meldshell/contracts"
import type {
  PullRequest,
  PullRequestCheck,
  PullRequestStatus,
  WorkspaceScope,
} from "@meldshell/contracts/ipc"
import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Sparkles,
} from "lucide-react"
import { AppDialog, Button, Checkbox, IconButton, TextField } from "../ui/controls"
import { ActivitySpinner, CollapsiblePanel } from "../ui/motion"
import { textInputClasses } from "../ui/styles"
import { scopeKey, workspaceScope } from "../data/workspace-scope"

const pullRequestKey = (scope: WorkspaceScope) => ["pull-request", ...scopeKey(scope)]

/**
 * The checked-out branch's pull request. Running checks are polled closely so a result shows soon
 * after it lands; a settled pull request is checked now and then for new reviews.
 */
function usePullRequest(scope: WorkspaceScope | undefined) {
  return useQuery({
    queryKey: scope ? pullRequestKey(scope) : ["pull-request", null],
    queryFn: () => window.meldshell.getPullRequest(scope!),
    enabled: scope !== undefined,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const pullRequest = query.state.data?.pullRequest
      if (!pullRequest) return 60_000
      if (pullRequest.state === "merged" || pullRequest.state === "closed") return false
      return pullRequest.checks.some((check) => check.state === "pending") ? 15_000 : 60_000
    },
  })
}

const stateStyles: Record<
  PullRequest["state"],
  { label: string; color: string; Icon: typeof GitPullRequest }
> = {
  open: { label: "Open", color: "var(--color-added)", Icon: GitPullRequest },
  draft: { label: "Draft", color: "var(--text-tertiary)", Icon: GitPullRequestDraft },
  merged: { label: "Merged", color: "var(--color-renamed)", Icon: GitMerge },
  closed: { label: "Closed", color: "var(--color-deleted)", Icon: GitPullRequestClosed },
}

const checkStyles: Record<
  PullRequestCheck["state"],
  { color: string; Icon: typeof CircleCheck; label: string }
> = {
  passed: { color: "var(--color-added)", Icon: CircleCheck, label: "Passed" },
  failed: { color: "var(--color-deleted)", Icon: CircleX, label: "Failed" },
  pending: { color: "var(--color-modified)", Icon: CircleDashed, label: "Running" },
  skipped: { color: "var(--text-tertiary)", Icon: CircleMinus, label: "Skipped" },
}

/** One phrase for the checks, naming the worst state first, like GitHub's merge box. */
function checksSummary(checks: readonly PullRequestCheck[]): {
  text: string
  state: PullRequestCheck["state"] | null
} {
  if (checks.length === 0) return { text: "No checks", state: null }
  const count = (state: PullRequestCheck["state"]) =>
    checks.filter((check) => check.state === state).length
  const failed = count("failed")
  const pending = count("pending")
  if (failed > 0) return { text: `${failed} of ${checks.length} checks failed`, state: "failed" }
  if (pending > 0)
    return { text: `${pending} of ${checks.length} checks running`, state: "pending" }
  return {
    text: checks.length === 1 ? "Check passed" : `All ${checks.length} checks passed`,
    state: "passed",
  }
}

function reviewSummary(pullRequest: PullRequest): { text: string; color: string } | null {
  const approvedByReview =
    pullRequest.reviewDecision === null &&
    pullRequest.reviews.some((review) => review.state === "approved")
  if (pullRequest.reviewDecision === "approved" || approvedByReview)
    return { text: "Approved", color: "var(--color-added)" }
  if (pullRequest.reviewDecision === "changes-requested")
    return { text: "Changes requested", color: "var(--color-deleted)" }
  if (pullRequest.reviewDecision === "review-required")
    return { text: "Review required", color: "var(--color-modified)" }
  return null
}

function StateIcon({ pullRequest, size = 13 }: { pullRequest: PullRequest; size?: number }) {
  const style = stateStyles[pullRequest.state]
  return (
    <style.Icon
      size={size}
      strokeWidth={1.75}
      className="flex-none"
      style={{ color: style.color }}
      aria-label={style.label}
    />
  )
}

function CheckIcon({ state }: { state: PullRequestCheck["state"] }) {
  if (state === "pending")
    return (
      <span className="flex flex-none text-[var(--color-modified)]">
        <ActivitySpinner />
      </span>
    )
  const style = checkStyles[state]
  return (
    <style.Icon
      size={12}
      strokeWidth={2}
      className="flex-none"
      style={{ color: style.color }}
      aria-label={style.label}
    />
  )
}

/** The state line under a pull request's title: checks, then reviews, then conflicts. */
function StatusLine({ pullRequest }: { pullRequest: PullRequest }): React.JSX.Element {
  const checks = checksSummary(pullRequest.checks)
  const review = reviewSummary(pullRequest)
  const settled = pullRequest.state === "merged" || pullRequest.state === "closed"
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-[10px] gap-y-[2px] text-[11px] text-[var(--text-tertiary)]">
      {settled ? (
        <span style={{ color: stateStyles[pullRequest.state].color }}>
          {stateStyles[pullRequest.state].label}
        </span>
      ) : (
        <>
          <span className="inline-flex items-center gap-[4px]">
            {checks.state !== null && <CheckIcon state={checks.state} />}
            {checks.text}
          </span>
          {review !== null && <span style={{ color: review.color }}>{review.text}</span>}
          {pullRequest.conflicts && (
            <span className="text-[var(--color-deleted)]">Merge conflicts</span>
          )}
        </>
      )}
    </span>
  )
}

/** Each check with a link to its run, then who has reviewed. */
function PullRequestDetails({ pullRequest }: { pullRequest: PullRequest }): React.JSX.Element {
  const reviewed = pullRequest.reviews.filter((review) => review.state !== "commented")
  return (
    <div className="flex flex-col gap-[1px] [padding:4px_0]">
      {pullRequest.checks.map((check) => (
        <a
          key={`${check.name}:${check.url ?? ""}`}
          href={check.url ?? pullRequest.url}
          target="_blank"
          rel="noreferrer"
          className="motion-colors flex min-w-0 items-center gap-[8px] h-[24px] [padding:0_8px] rounded-[var(--radius-sm)] text-[11.5px] text-[var(--text-secondary)] no-underline [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]"
          title={`${checkStyles[check.state].label}: ${check.name}`}
        >
          <CheckIcon state={check.state} />
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {check.name}
          </span>
        </a>
      ))}
      {reviewed.map((review) => (
        <span
          key={review.author}
          className="flex min-w-0 items-center gap-[8px] h-[24px] [padding:0_8px] text-[11.5px] text-[var(--text-secondary)]"
        >
          {review.state === "approved" ? (
            <CircleCheck
              size={12}
              strokeWidth={2}
              className="flex-none text-[var(--color-added)]"
            />
          ) : (
            <CircleX size={12} strokeWidth={2} className="flex-none text-[var(--color-deleted)]" />
          )}
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {review.author}{" "}
            <span className="text-[var(--text-tertiary)]">
              {review.state === "approved" ? "approved" : "requested changes"}
            </span>
          </span>
        </span>
      ))}
    </div>
  )
}

function OpenOnGitHub({ pullRequest }: { pullRequest: PullRequest }): React.JSX.Element {
  return (
    <a
      href={pullRequest.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open pull request #${pullRequest.number} on GitHub`}
      title="Open on GitHub"
      className="motion-colors grid flex-none w-[24px] h-[24px] place-items-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]"
      onClick={(event) => event.stopPropagation()}
    >
      <ExternalLink size={13} strokeWidth={1.75} />
    </a>
  )
}

/** The thread's pull request above the composer, so CI and reviews show where the work is. */
export function ThreadPullRequest({ thread }: { thread: Thread }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const query = usePullRequest(workspaceScope(thread))
  const pullRequest = query.data?.pullRequest
  if (!pullRequest) return null
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label="Pull request" />}
      className="w-full max-w-[860px] [margin:0_auto_6px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-hover)]"
    >
      <div className="flex min-w-0 items-center pr-[4px]">
        <Collapsible.Trigger className="motion-colors flex min-w-0 flex-1 items-center gap-[8px] h-[30px] [padding:0_10px] border-0 bg-transparent text-left text-[var(--text-secondary)] text-[12px] cursor-default rounded-[var(--radius-lg)] [&:hover]:text-[var(--text-primary)] [&_.chevron]:motion-transform [&[data-panel-open]_.chevron]:[transform:rotate(180deg)]">
          <StateIcon pullRequest={pullRequest} />
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="text-[var(--text-tertiary)]">#{pullRequest.number} </span>
            <span className="text-[var(--text-primary)]">{pullRequest.title}</span>
          </span>
          <span className="flex-none max-[520px]:hidden">
            <StatusLine pullRequest={pullRequest} />
          </span>
          <ChevronDown
            size={13}
            className="chevron flex-none text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
        </Collapsible.Trigger>
        <OpenOnGitHub pullRequest={pullRequest} />
      </div>
      <CollapsiblePanel className="border-t-[1px] border-t-[color:var(--line-subtle)] [padding:0_4px]">
        <span className="hidden max-[520px]:flex [padding:6px_8px_0]">
          <StatusLine pullRequest={pullRequest} />
        </span>
        <PullRequestDetails pullRequest={pullRequest} />
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

const labelClasses = "block mb-[6px] text-[var(--text-secondary)] text-[11.5px] font-medium"

function CreatePullRequestDialog({
  scope,
  threadId,
  status,
  open,
  onOpenChange,
}: {
  scope: WorkspaceScope
  threadId?: string
  status: PullRequestStatus
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const client = useQueryClient()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [draft, setDraft] = useState(false)
  const generate = useMutation({
    // The thread picks the model, as it does for commit messages.
    mutationFn: () =>
      window.meldshell.generatePullRequest({
        workspaceId: scope.workspaceId,
        threadId: scope.threadId ?? threadId,
      }),
    onSuccess: (generated) => {
      setTitle(generated.title)
      setBody(generated.body)
    },
  })
  const create = useMutation({
    mutationFn: () => window.meldshell.createPullRequest({ ...scope, title, body, draft }),
    onSuccess: (next) => {
      client.setQueryData(pullRequestKey(scope), next)
      void client.invalidateQueries({ queryKey: ["git", ...scopeKey(scope)] })
      onOpenChange(false)
    },
  })
  // Opening the dialog writes a first draft; the fields wait for it, then stay editable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only opening the dialog drafts.
  useEffect(() => {
    if (!open) return
    create.reset()
    if (!title.trim()) generate.mutate()
  }, [open])
  const busy = generate.isPending || create.isPending
  const error = create.error ?? generate.error
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) onOpenChange(next)
      }}
      title="Create pull request"
      actions={
        <>
          <label className="mr-[auto] flex items-center gap-[8px] text-[12px] text-[var(--text-secondary)]">
            <Checkbox checked={draft} onCheckedChange={setDraft} disabled={busy} />
            Open as draft
          </label>
          <Button disabled={create.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !title.trim()}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <p>
        Merges <code>{status.branch}</code> into <code>{status.baseBranch}</code>
        {status.ahead > 0 && (
          <>
            {" "}
            with {status.ahead} commit{status.ahead === 1 ? "" : "s"}
          </>
        )}
        . Unpushed commits are pushed first.
      </p>
      <div className="pull-request-form flex flex-col gap-[14px] [padding:14px_20px_0]">
        <div>
          <span className={labelClasses}>Title</span>
          <div className="relative [&_.git-pr-title]:pr-[34px] [&_>_.icon-button]:absolute [&_>_.icon-button]:top-[50%] [&_>_.icon-button]:right-[3px] [&_>_.icon-button]:[transform:translateY(-50%)]">
            <TextField
              className="git-pr-title"
              aria-label="Pull request title"
              placeholder={generate.isPending ? "Writing a title…" : "Title"}
              value={title}
              disabled={busy}
              onValueChange={setTitle}
            />
            <IconButton
              label={generate.isPending ? "Writing…" : "Write title and description again"}
              disabled={busy}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? <ActivitySpinner /> : <Sparkles size={14} />}
            </IconButton>
          </div>
        </div>
        <label className="block">
          <span className={labelClasses}>Description</span>
          <textarea
            className={`motion-colors ${textInputClasses} h-auto! min-h-[180px] max-h-[calc(var(--viewport-h)_*_0.45)] [padding:8px_10px]! leading-[1.5] resize-y [font-family:var(--font-mono)] text-[11.5px]!`}
            aria-label="Pull request description"
            placeholder={generate.isPending ? "Writing a description…" : "Describe the change"}
            value={body}
            disabled={busy}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        {error && (
          <p
            role="alert"
            className="m-0 text-[12px] text-[var(--color-deleted)] [overflow-wrap:anywhere]"
          >
            {error.message}
          </p>
        )}
      </div>
    </AppDialog>
  )
}

/**
 * The step after a push in Source Control: open a pull request for the branch, then follow its
 * checks and reviews here.
 */
export function PullRequestSection({
  scope,
  threadId,
}: {
  scope: WorkspaceScope
  threadId?: string
}): React.JSX.Element | null {
  const [creating, setCreating] = useState(false)
  const query = usePullRequest(scope)
  const status = query.data
  if (status === undefined || status.branch === null) return null
  const pullRequest = status.pullRequest
  const live = pullRequest?.state === "open" || pullRequest?.state === "draft"
  const canCreate =
    !live && status.baseBranch !== null && status.branch !== status.baseBranch && status.ahead > 0
  if (!pullRequest && !canCreate && status.unavailable === null) return null
  return (
    <section className="shrink-0 [padding:0_12px_10px] text-[12px]" aria-label="Pull request">
      {pullRequest && (
        <div className="flex flex-col gap-[3px] [padding:7px_6px_7px_9px] mb-[6px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] bg-[var(--surface-hover)]">
          <div className="flex min-w-0 items-center gap-[7px]">
            <StateIcon pullRequest={pullRequest} />
            <span
              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-primary)]"
              title={pullRequest.title}
            >
              <span className="text-[var(--text-tertiary)]">#{pullRequest.number} </span>
              {pullRequest.title}
            </span>
            <OpenOnGitHub pullRequest={pullRequest} />
          </div>
          <span className="pl-[20px]">
            <StatusLine pullRequest={pullRequest} />
          </span>
        </div>
      )}
      {canCreate && status.unavailable === null && (
        <Button block icon={<GitPullRequest size={14} />} onClick={() => setCreating(true)}>
          Create pull request
        </Button>
      )}
      {status.unavailable !== null && canCreate && (
        <p className="m-0 text-[11px] text-[var(--text-tertiary)] [overflow-wrap:anywhere]">
          {status.unavailable}
        </p>
      )}
      {canCreate && (
        <CreatePullRequestDialog
          scope={scope}
          threadId={threadId}
          status={status}
          open={creating}
          onOpenChange={setCreating}
        />
      )}
    </section>
  )
}
