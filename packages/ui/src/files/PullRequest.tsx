import { useEffect, useState } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import type { Thread } from "@meldshell/contracts"
import type {
  PullRequest,
  PullRequestCheck,
  PullRequestStatus,
  WorkspaceScope,
} from "@meldshell/contracts/ipc"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleX,
  Eye,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Link2,
  PencilLine,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { AppDialog, Button, Checkbox, IconButton, TextField } from "../ui/controls"
import { ActivitySpinner, CollapsiblePanel, Shimmer, Swap, useMotionPreference } from "../ui/motion"
import { Markdown } from "../ui/Markdown"
import { segmentClasses, segmentGroupClasses, textInputClasses } from "../ui/styles"
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

/** Marks a draft ready for review and shows the result everywhere the pull request is shown. */
function useMarkReady(scope: WorkspaceScope) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => window.meldshell.markPullRequestReady(scope),
    onSuccess: (next) => client.setQueryData(pullRequestKey(scope), next),
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
  failed: { color: "var(--color-deleted)", Icon: CircleX, label: "Failed" },
  pending: { color: "var(--color-modified)", Icon: CircleDashed, label: "Running" },
  passed: { color: "var(--color-added)", Icon: CircleCheck, label: "Passed" },
  skipped: { color: "var(--text-tertiary)", Icon: CircleMinus, label: "Skipped" },
}
const checkStates = Object.keys(checkStyles) as PullRequestCheck["state"][]

const settled = (pullRequest: PullRequest) =>
  pullRequest.state === "merged" || pullRequest.state === "closed"

/**
 * One phrase for the checks, naming the worst state first like GitHub's merge box. A single
 * failing check is named, since that is what you would open next.
 */
function checksSummary(checks: readonly PullRequestCheck[]): {
  text: string
  state: PullRequestCheck["state"] | null
} {
  if (checks.length === 0) return { text: "No checks", state: null }
  const failed = checks.filter((check) => check.state === "failed")
  const pending = checks.filter((check) => check.state === "pending").length
  if (failed.length === 1) return { text: `${failed[0]!.name} failed`, state: "failed" }
  if (failed.length > 1)
    return { text: `${failed.length} of ${checks.length} checks failed`, state: "failed" }
  if (pending > 0)
    return { text: `${pending} of ${checks.length} checks running`, state: "pending" }
  return {
    text: checks.length === 1 ? "Check passed" : `${checks.length} checks passed`,
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
    return { text: "Awaiting review", color: "var(--color-modified)" }
  return null
}

function StateIcon({ pullRequest, size = 14 }: { pullRequest: PullRequest; size?: number }) {
  const style = stateStyles[pullRequest.state]
  return (
    <Swap id={pullRequest.state} className="grid flex-none place-items-center">
      <style.Icon
        size={size}
        strokeWidth={1.9}
        style={{ color: style.color }}
        aria-label={style.label}
      />
    </Swap>
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

/** A small tinted label in its state's color. */
function Pill({
  color,
  children,
}: {
  color: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span
      style={{ "--tone": color } as React.CSSProperties}
      className="inline-flex flex-none items-center gap-[4px] h-[18px] [padding:0_7px] rounded-[999px] whitespace-nowrap text-[10.5px] font-medium text-[color:var(--tone)] [background:color-mix(in_srgb,var(--tone)_13%,transparent)]"
    >
      {children}
    </span>
  )
}

/**
 * The checks as one segmented bar, so their balance reads at a glance; running checks breathe
 * until they finish.
 */
function CheckBar({ checks }: { checks: readonly PullRequestCheck[] }): React.JSX.Element | null {
  const reduced = useMotionPreference()
  if (checks.length === 0) return null
  return (
    <span
      className="flex h-[3px] w-full gap-[2px] overflow-hidden rounded-[999px]"
      aria-hidden="true"
    >
      {checkStates.map((state) => {
        const count = checks.filter((check) => check.state === state).length
        if (count === 0) return null
        return (
          <motion.span
            key={state}
            layout={!reduced}
            className="block h-full rounded-[999px]"
            style={{ flexGrow: count, background: checkStyles[state].color }}
            animate={
              state === "pending" && !reduced ? { opacity: [0.45, 1, 0.45] } : { opacity: 1 }
            }
            transition={
              state === "pending" && !reduced
                ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.2 }
            }
          />
        )
      })}
    </span>
  )
}

/** The pull request's state in a few pills: checks, then review, then conflicts. */
function StatusPills({ pullRequest }: { pullRequest: PullRequest }): React.JSX.Element {
  const checks = checksSummary(pullRequest.checks)
  const review = reviewSummary(pullRequest)
  if (settled(pullRequest))
    return (
      <span className="flex min-w-0 items-center gap-[6px]">
        <Pill color={stateStyles[pullRequest.state].color}>
          {pullRequest.state === "merged"
            ? `Merged into ${pullRequest.baseBranch}`
            : "Closed without merging"}
        </Pill>
      </span>
    )
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-[5px]">
      <span
        className="inline-flex min-w-0 max-w-full items-center gap-[5px] text-[11px] text-[var(--text-secondary)]"
        title={checks.text}
      >
        {checks.state !== null && <CheckIcon state={checks.state} />}
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {checks.text}
        </span>
      </span>
      {pullRequest.state === "draft" && <Pill color="var(--text-tertiary)">Draft</Pill>}
      {review !== null && <Pill color={review.color}>{review.text}</Pill>}
      {pullRequest.conflicts && (
        <Pill color="var(--color-deleted)">
          <TriangleAlert size={10} strokeWidth={2.2} />
          Conflicts
        </Pill>
      )}
    </span>
  )
}

const rowClasses =
  "motion-colors flex min-w-0 items-center gap-[8px] h-[26px] [padding:0_8px] rounded-[var(--radius-sm)] text-[11.5px] text-[var(--text-secondary)] no-underline"

/** Each check with a link to its run, then who has reviewed, then what you can do next. */
function PullRequestDetails({
  scope,
  pullRequest,
}: {
  scope: WorkspaceScope
  pullRequest: PullRequest
}): React.JSX.Element {
  const ready = useMarkReady(scope)
  const [copied, setCopied] = useState(false)
  const reviewed = pullRequest.reviews.filter((review) => review.state !== "commented")
  return (
    <div className="flex flex-col [padding:4px_0]">
      {pullRequest.checks.length > 0 && (
        <span className="[padding:4px_8px_2px] text-[10.5px] font-medium uppercase tracking-[0.04em] text-[var(--text-tertiary)]">
          Checks
        </span>
      )}
      {pullRequest.checks.map((check) => (
        <a
          key={`${check.name}:${check.url ?? ""}`}
          href={check.url ?? pullRequest.url}
          target="_blank"
          rel="noreferrer"
          className={`${rowClasses} group [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]`}
          title={`${checkStyles[check.state].label}: ${check.name}`}
        >
          <CheckIcon state={check.state} />
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {check.name}
          </span>
          <span className="flex-none text-[10.5px] text-[var(--text-tertiary)]">
            {checkStyles[check.state].label}
          </span>
          <ExternalLink
            size={11}
            className="flex-none text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100"
            aria-hidden="true"
          />
        </a>
      ))}
      {reviewed.length > 0 && (
        <span className="[padding:8px_8px_2px] text-[10.5px] font-medium uppercase tracking-[0.04em] text-[var(--text-tertiary)]">
          Reviews
        </span>
      )}
      {reviewed.map((review) => (
        <span key={review.author} className={rowClasses}>
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
            <span className="text-[var(--text-primary)]">{review.author}</span>{" "}
            {review.state === "approved" ? "approved" : "requested changes"}
          </span>
        </span>
      ))}
      <div className="flex flex-wrap items-center gap-[6px] [padding:8px_6px_4px]">
        {pullRequest.state === "draft" && (
          <Button
            size="sm"
            variant="primary"
            disabled={ready.isPending}
            onClick={() => ready.mutate()}
          >
            {ready.isPending ? "Marking ready…" : "Ready for review"}
          </Button>
        )}
        <Button
          size="sm"
          icon={<ExternalLink size={12} />}
          onClick={() => window.open(pullRequest.url, "_blank", "noreferrer")}
        >
          Open on GitHub
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={copied ? <CircleCheck size={12} /> : <Link2 size={12} />}
          onClick={() => {
            void navigator.clipboard.writeText(pullRequest.url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {ready.isError && (
        <p
          role="alert"
          className="m-0 [padding:2px_8px_4px] text-[11px] text-[var(--color-deleted)]"
        >
          {ready.error.message}
        </p>
      )}
    </div>
  )
}

/** The thread's pull request above the composer, so CI and reviews show where the work is. */
export function ThreadPullRequest({ thread }: { thread: Thread }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const reduced = useMotionPreference()
  const scope = workspaceScope(thread)
  const query = usePullRequest(scope)
  const pullRequest = query.data?.pullRequest
  if (!pullRequest) return null
  return (
    <motion.div
      className="w-full max-w-[860px] [margin:0_auto_6px]"
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <Collapsible.Root
        open={open}
        onOpenChange={setOpen}
        render={<section aria-label="Pull request" />}
        className="relative overflow-hidden border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-hover)]"
      >
        <Collapsible.Trigger className="motion-colors relative flex w-full min-w-0 items-center gap-[9px] h-[34px] [padding:0_10px] border-0 bg-transparent text-left text-[var(--text-secondary)] text-[12px] cursor-default [&:hover]:bg-[var(--surface-hover)] [&_.chevron]:motion-transform [&[data-panel-open]_.chevron]:[transform:rotate(180deg)]">
          <StateIcon pullRequest={pullRequest} />
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="text-[var(--text-tertiary)]">#{pullRequest.number}</span>{" "}
            <span className="text-[var(--text-primary)]">{pullRequest.title}</span>
          </span>
          <span className="flex-none max-[620px]:hidden">
            <StatusPills pullRequest={pullRequest} />
          </span>
          <ChevronDown
            size={13}
            className="chevron flex-none text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
          {!settled(pullRequest) && (
            <span className="absolute right-[10px] bottom-[0] left-[10px]">
              <CheckBar checks={pullRequest.checks} />
            </span>
          )}
        </Collapsible.Trigger>
        <CollapsiblePanel className="border-t-[1px] border-t-[color:var(--line-subtle)] [padding:0_4px]">
          <span className="hidden max-[620px]:flex [padding:8px_8px_0]">
            <StatusPills pullRequest={pullRequest} />
          </span>
          <PullRequestDetails scope={scope} pullRequest={pullRequest} />
        </CollapsiblePanel>
      </Collapsible.Root>
    </motion.div>
  )
}

const labelRowClasses =
  "flex items-center justify-between gap-[8px] min-h-[24px] mb-[6px] text-[var(--text-secondary)] text-[11.5px] font-medium"
const TITLE_LIMIT = 72

function BranchChip({ name }: { name: string }): React.JSX.Element {
  return (
    <span className="inline-flex min-w-0 items-center gap-[5px] h-[22px] [padding:0_8px] rounded-[var(--radius-sm)] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)] text-[var(--text-primary)] [font:11px_var(--font-mono)]">
      <GitBranch size={11} className="flex-none text-[var(--text-tertiary)]" aria-hidden="true" />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
    </span>
  )
}

/** Where the pull request goes, and the commits it carries in a list that opens on request. */
function BranchSummary({ status }: { status: PullRequestStatus }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const count = status.ahead
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="[padding:10px_20px_0]">
      <div className="flex min-w-0 flex-wrap items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
        <BranchChip name={status.baseBranch ?? ""} />
        <ArrowLeft size={13} className="flex-none" aria-label="from" />
        <BranchChip name={status.branch ?? ""} />
        <Collapsible.Trigger className="motion-colors inline-flex items-center gap-[3px] h-[22px] [padding:0_6px] border-0 rounded-[var(--radius-sm)] bg-transparent text-[12px] text-[var(--text-secondary)] cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)] [&[data-panel-open]_.chevron]:[transform:rotate(90deg)]">
          <ChevronRight size={12} className="chevron motion-transform" aria-hidden="true" />
          {count} commit{count === 1 ? "" : "s"}
        </Collapsible.Trigger>
        {status.unpushed > 0 && (
          <span className="text-[11.5px]">
            · {status.published ? `pushes ${status.unpushed} first` : "publishes the branch first"}
          </span>
        )}
      </div>
      {status.issue !== null && (
        <p className="m-0 mt-[8px] flex min-w-0 items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
          <CircleDot
            size={13}
            strokeWidth={2}
            className="flex-none text-[var(--color-added)]"
            aria-hidden="true"
          />
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            Closes{" "}
            <a
              href={status.issue.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--text-secondary)] no-underline [&:hover]:text-[var(--text-primary)] [&:hover]:underline"
            >
              #{status.issue.number} {status.issue.title}
            </a>{" "}
            when it merges
          </span>
        </p>
      )}
      <CollapsiblePanel>
        <ol className="m-0 mt-[8px] max-h-[120px] overflow-y-auto [padding:4px_10px] list-none border-l-[2px] border-l-[color:var(--line-subtle)] text-[11.5px] leading-[1.7] text-[var(--text-secondary)]">
          {status.commits.map((subject, index) => (
            // Subjects can repeat, so the position keeps each row apart; the list never reorders.
            <li key={index} className="overflow-hidden text-ellipsis whitespace-nowrap">
              {subject}
            </li>
          ))}
          {count > status.commits.length && (
            <li className="text-[var(--text-tertiary)]">
              and {count - status.commits.length} more
            </li>
          )}
        </ol>
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

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
  const [view, setView] = useState<"write" | "preview">("write")
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
  const canCreate = !busy && Boolean(title.trim())
  const error = create.error ?? generate.error
  const submit = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault()
      if (canCreate) create.mutate()
    }
  }
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
            <Checkbox checked={draft} onCheckedChange={setDraft} disabled={create.isPending} />
            Open as draft
          </label>
          <Button disabled={create.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canCreate}
            title="Create (Ctrl+Enter)"
            icon={
              create.isPending ? (
                <ActivitySpinner />
              ) : draft ? (
                <GitPullRequestDraft size={14} />
              ) : (
                <GitPullRequest size={14} />
              )
            }
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : draft ? "Create draft" : "Create"}
          </Button>
        </>
      }
    >
      <BranchSummary status={status} />
      <div className="pull-request-form flex flex-col gap-[14px] [padding:16px_20px_0]">
        <div>
          <div className={labelRowClasses}>
            <span>Title</span>
            {generate.isPending ? (
              <Shimmer className="font-normal">Writing from the branch…</Shimmer>
            ) : (
              <span
                className={`font-normal tabular-nums ${title.length > TITLE_LIMIT ? "text-[var(--color-modified)]" : "text-[var(--text-tertiary)]"}`}
                title="GitHub shows about 72 characters of a title in lists"
              >
                {title.length}/{TITLE_LIMIT}
              </span>
            )}
          </div>
          <div className="relative [&_.git-pr-title]:pr-[34px] [&_>_.icon-button]:absolute [&_>_.icon-button]:top-[50%] [&_>_.icon-button]:right-[3px] [&_>_.icon-button]:[transform:translateY(-50%)]">
            <TextField
              className="git-pr-title"
              aria-label="Pull request title"
              placeholder={generate.isPending ? "" : "Summarize the change"}
              value={title}
              disabled={busy}
              onValueChange={setTitle}
              onKeyDown={submit}
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
        <div>
          <div className={labelRowClasses}>
            <span>Description</span>
            <ToggleGroup
              aria-label="Description view"
              value={[view]}
              onValueChange={(value) => {
                const next = value[0] as typeof view | undefined
                if (next !== undefined) setView(next)
              }}
              className={`${segmentGroupClasses} p-[1px]!`}
            >
              <Toggle
                value="write"
                className={`${segmentClasses} h-[20px]! [padding:0_8px]! text-[11px]!`}
              >
                <PencilLine size={11} />
                Write
              </Toggle>
              <Toggle
                value="preview"
                disabled={!body.trim()}
                className={`${segmentClasses} h-[20px]! [padding:0_8px]! text-[11px]!`}
              >
                <Eye size={11} />
                Preview
              </Toggle>
            </ToggleGroup>
          </div>
          {view === "preview" && body.trim() ? (
            <div className="min-h-[200px] max-h-[calc(var(--viewport-h)_*_0.45)] overflow-y-auto [padding:10px_12px] border-[1px] border-[color:var(--line)] rounded-[var(--radius)] text-[12.5px]">
              <Markdown text={body} />
            </div>
          ) : (
            <textarea
              className={`motion-colors ${textInputClasses} block h-auto! min-h-[200px] max-h-[calc(var(--viewport-h)_*_0.45)] [padding:8px_10px]! leading-[1.55] resize-y [font-family:var(--font-mono)] text-[11.5px]!`}
              aria-label="Pull request description"
              placeholder={generate.isPending ? "" : "What changed, why, and what to check"}
              value={body}
              disabled={busy}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={submit}
            />
          )}
        </div>
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
  const [open, setOpen] = useState(false)
  const reduced = useMotionPreference()
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
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="mb-[6px]"
        >
          <Collapsible.Root
            open={open}
            onOpenChange={setOpen}
            className="relative overflow-hidden border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] bg-[var(--surface-hover)]"
          >
            <Collapsible.Trigger className="motion-colors relative flex w-full min-w-0 flex-col gap-[5px] [padding:8px_10px_10px] border-0 bg-transparent text-left cursor-default [&:hover]:bg-[var(--surface-hover)] [&_.chevron]:motion-transform [&[data-panel-open]_.chevron]:[transform:rotate(180deg)]">
              <span className="flex min-w-0 items-start gap-[7px]">
                <span className="pt-[1px]">
                  <StateIcon pullRequest={pullRequest} />
                </span>
                <span
                  className="min-w-0 flex-1 text-[12px] leading-[1.4] text-[var(--text-primary)] [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden"
                  title={pullRequest.title}
                >
                  <span className="text-[var(--text-tertiary)]">#{pullRequest.number}</span>{" "}
                  {pullRequest.title}
                </span>
                <ChevronDown
                  size={13}
                  className="chevron mt-[2px] flex-none text-[var(--text-tertiary)]"
                  aria-hidden="true"
                />
              </span>
              <span className="pl-[21px]">
                <StatusPills pullRequest={pullRequest} />
              </span>
              {!settled(pullRequest) && (
                <span className="absolute right-[10px] bottom-[0] left-[10px]">
                  <CheckBar checks={pullRequest.checks} />
                </span>
              )}
            </Collapsible.Trigger>
            <CollapsiblePanel className="border-t-[1px] border-t-[color:var(--line-subtle)] [padding:0_2px]">
              <PullRequestDetails scope={scope} pullRequest={pullRequest} />
            </CollapsiblePanel>
          </Collapsible.Root>
        </motion.div>
      )}
      {canCreate && status.unavailable === null && (
        <Button block icon={<GitPullRequest size={14} />} onClick={() => setCreating(true)}>
          {pullRequest ? "Create another pull request" : "Create pull request"}
        </Button>
      )}
      {status.unavailable !== null && canCreate && (
        <p className="m-0 flex items-start gap-[6px] text-[11px] leading-[1.5] text-[var(--text-tertiary)] [overflow-wrap:anywhere]">
          <GitPullRequest size={12} className="mt-[2px] flex-none" aria-hidden="true" />
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
