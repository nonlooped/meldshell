import { Button as BaseButton } from "@base-ui-components/react/button"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Thread } from "@meldshell/contracts"
import { ChevronDown } from "lucide-react"
import { replaceSnapshot } from "../data/cache"
import { DropdownMenu, MenuChoice, MenuRadioGroup } from "../ui/controls"
import { ErrorToast } from "../ui/Notice"

/**
 * The branch half of an empty thread's workspace line. Before the first message it chooses between
 * the shared workspace folder and the thread's own branch in a Git worktree. New threads reuse an
 * empty draft, so this is where the choice has to live.
 */
export function ThreadBranchChoice({ thread }: { thread: Thread }): React.JSX.Element {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (isolated: boolean) =>
      window.meldshell.setThreadIsolated({ threadId: thread.id, isolated }),
    onSuccess: (snapshot) => replaceSnapshot(client, snapshot),
  })
  const worktree = thread.worktree?.state === "removed" ? undefined : thread.worktree
  const label = mutation.isPending
    ? mutation.variables
      ? "Creating worktree…"
      : "Switching to workspace folder…"
    : (worktree?.branch ?? "Workspace folder")
  return (
    <>
      <span className="ml-[10px]">Branch</span>
      <DropdownMenu
        align="start"
        trigger={
          <BaseButton
            type="button"
            disabled={mutation.isPending}
            className="motion-colors inline-flex min-w-0 items-center gap-[3px] p-0 border-0 bg-transparent text-[var(--text-secondary)] font-medium cursor-default [&:hover]:text-[var(--text-primary)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px] [&:disabled]:text-[var(--text-tertiary)]"
            aria-label={`Branch: ${label}`}
          >
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
            <ChevronDown
              size={12}
              strokeWidth={2}
              className="flex-none text-[var(--text-tertiary)]"
            />
          </BaseButton>
        }
      >
        <MenuRadioGroup
          value={worktree === undefined ? "shared" : "own"}
          onValueChange={(value) => mutation.mutate(value === "own")}
        >
          <MenuChoice value="shared" className="h-auto [padding:7px_9px] items-start">
            <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
              <span className="text-inherit text-[12.5px]">Workspace folder</span>
              <span className="text-[var(--text-tertiary)] text-[11px]">
                Shares files with other threads in this workspace
              </span>
            </span>
          </MenuChoice>
          <MenuChoice value="own" className="h-auto [padding:7px_9px] items-start">
            <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
              <span className="text-inherit text-[12.5px]">Own branch</span>
              <span className="text-[var(--text-tertiary)] text-[11px]">
                A Git worktree from the current commit, so parallel threads never collide
              </span>
            </span>
          </MenuChoice>
        </MenuRadioGroup>
      </DropdownMenu>
      {mutation.isError && (
        <ErrorToast message={mutation.error.message} onDismiss={() => mutation.reset()} />
      )}
    </>
  )
}
