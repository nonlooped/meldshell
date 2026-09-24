import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Thread, ThreadWorktree } from "@meldshell/contracts"
import { GitBranch, GitMerge, MoreHorizontal, Trash2 } from "lucide-react"
import { AppDialog, Button, Checkbox, DropdownMenu, MenuAction } from "../ui/controls"
import { replaceSnapshot } from "../data/cache"

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

function stateNote(worktree: ThreadWorktree): string {
  if (worktree.state === "missing") return "Folder missing"
  if (worktree.state === "removed") return "Worktree removed"
  return worktree.baseBranch === null ? "from a detached HEAD" : `from ${worktree.baseBranch}`
}

function RemoveWorktreeDialog({
  thread,
  worktree,
  open,
  onOpenChange,
}: {
  thread: Thread
  worktree: ThreadWorktree
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const client = useQueryClient()
  const [deleteBranch, setDeleteBranch] = useState(false)
  // A missing folder has nothing left to count, so only a ready worktree reports its work.
  const status = useQuery({
    queryKey: ["worktree-status", thread.id],
    queryFn: () => window.meldshell.getWorktreeStatus(thread.id),
    enabled: open && worktree.state === "ready",
    retry: false,
  })
  const remove = useMutation({
    mutationFn: () => window.meldshell.removeWorktree({ threadId: thread.id, deleteBranch }),
    onSuccess: (snapshot) => {
      replaceSnapshot(client, snapshot)
      onOpenChange(false)
    },
  })
  const unmerged = status.data?.unmerged ?? null
  return (
    <AppDialog
      alert
      open={open}
      onOpenChange={(next) => {
        if (!next) remove.reset()
        onOpenChange(next)
      }}
      title="Remove this thread's worktree?"
      actions={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={remove.isPending || status.isFetching}
            onClick={() => remove.mutate()}
          >
            Remove worktree
          </Button>
        </>
      }
    >
      <p>
        The folder at <code>{worktree.path}</code> is deleted. The thread keeps its history but can
        no longer start turns.
      </p>
      {status.data !== undefined && status.data.changes > 0 && (
        <p className="text-[var(--color-deleted)]!">
          {plural(status.data.changes, "uncommitted change")} will be lost.
        </p>
      )}
      {status.isError && <p role="alert">{status.error.message}</p>}
      <label className="flex items-start gap-[8px] [padding:12px_20px_0] text-[12.5px] leading-[1.5]">
        <span className="flex pt-[2px]">
          <Checkbox checked={deleteBranch} onCheckedChange={setDeleteBranch} />
        </span>
        <span>
          Also delete the branch <code>{worktree.branch}</code>
          {deleteBranch && unmerged !== null && unmerged > 0 && (
            <span className="block text-[var(--color-deleted)]">
              {plural(unmerged, "commit")} not in {worktree.baseBranch} will be lost.
            </span>
          )}
        </span>
      </label>
      {remove.isError && (
        <p role="alert" className="text-[var(--color-deleted)]!">
          {remove.error.message}
        </p>
      )}
    </AppDialog>
  )
}

/** The branch a worktree thread works on, with the actions that finish or discard that work. */
export function WorktreeBar({ thread }: { thread: Thread }): React.JSX.Element | null {
  const client = useQueryClient()
  const [removing, setRemoving] = useState(false)
  const [notice, setNotice] = useState("")
  const merge = useMutation({
    mutationFn: () => window.meldshell.mergeWorktree(thread.id),
    onMutate: () => setNotice(""),
    onSuccess: () => setNotice(`Merged into ${thread.worktree?.baseBranch}.`),
    onSettled: () => client.invalidateQueries({ queryKey: ["git", thread.workspaceId] }),
  })
  const worktree = thread.worktree
  if (worktree === undefined) return null
  const ready = worktree.state === "ready"
  return (
    <section
      className="shrink-0 border-b-[1px] border-b-[color:var(--line-subtle)] [padding:6px_6px_6px_12px] text-[12px]"
      aria-label="Thread worktree"
    >
      <div className="flex items-center gap-[7px] min-w-0">
        <GitBranch size={13} className="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
          title={worktree.path}
        >
          {worktree.branch}
        </span>
        <span
          className={`shrink-0 text-[10.5px] ${ready ? "text-[var(--text-tertiary)]" : "text-[var(--color-modified)]"}`}
        >
          {stateNote(worktree)}
        </span>
        <span className="flex-1" />
        {worktree.state !== "removed" && (
          <DropdownMenu
            align="end"
            trigger={
              <Button
                size="sm"
                variant="ghost"
                aria-label="Worktree actions"
                disabled={merge.isPending}
              >
                <MoreHorizontal size={14} />
              </Button>
            }
          >
            <MenuAction
              icon={<GitMerge size={13} strokeWidth={1.75} />}
              disabled={!ready || worktree.baseBranch === null}
              onClick={() => merge.mutate()}
            >
              {worktree.baseBranch === null
                ? "No branch to merge into"
                : `Merge into ${worktree.baseBranch}`}
            </MenuAction>
            <MenuAction
              icon={<Trash2 size={13} strokeWidth={1.75} />}
              disabled={thread.activity === "running" || thread.queuedCount > 0}
              onClick={() => setRemoving(true)}
            >
              Remove worktree…
            </MenuAction>
          </DropdownMenu>
        )}
      </div>
      {merge.isPending && (
        <p className="[margin:4px_0_0] text-[var(--text-tertiary)] text-[11px]" role="status">
          Merging…
        </p>
      )}
      {notice && (
        <p className="[margin:4px_0_0] text-[var(--text-tertiary)] text-[11px]" role="status">
          {notice}
        </p>
      )}
      {merge.isError && (
        <p
          className="[margin:4px_0_0] text-[var(--color-deleted)] text-[11px] [overflow-wrap:anywhere]"
          role="alert"
        >
          {merge.error.message}
        </p>
      )}
      <RemoveWorktreeDialog
        thread={thread}
        worktree={worktree}
        open={removing}
        onOpenChange={setRemoving}
      />
    </section>
  )
}
