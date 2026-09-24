import { Button as BaseButton } from "@base-ui-components/react/button"
import { useIsMutating, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query"
import type { Thread, Workspace } from "@meldshell/contracts"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import { Folder, GitBranch } from "lucide-react"
import { replaceSnapshot } from "../data/cache"
import { DropdownMenu, MenuChoice, MenuRadioGroup } from "../ui/controls"
import { MeldMark } from "../ui/MeldMark"
import { ErrorToast } from "../ui/Notice"

type DraftLocation = { workspaceId?: string; isolated?: boolean }

const segmentClasses = [
  "motion-colors inline-flex h-[24px] items-center gap-[6px] [padding:0_10px] border-0 rounded-[var(--radius-sm)]",
  "bg-transparent text-[var(--text-tertiary)] text-[12px] cursor-default [&:hover]:text-[var(--text-primary)]",
  "[&[data-pressed]]:bg-[var(--surface-selected)] [&[data-pressed]]:text-[var(--text-primary)]",
  "[&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:disabled]:text-[var(--text-disabled)]",
].join(" ")

const draftLocationKey = (threadId: string) => ["draft-location", threadId] as const

/**
 * Moves an empty thread or switches its worktree. The heading and the branch toggle share one
 * mutation key, so either control is disabled while the other's change is in flight.
 */
function useDraftLocation(threadId: string) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationKey: draftLocationKey(threadId),
    mutationFn: (input: DraftLocation) => window.meldshell.setDraftLocation({ threadId, ...input }),
    onSuccess: (snapshot) => replaceSnapshot(client, snapshot),
  })
  const busy = useIsMutating({ mutationKey: draftLocationKey(threadId) }) > 0
  return { mutation, busy }
}

/**
 * An empty thread's heading. Until the first message, its workspace name opens a menu that moves
 * the thread to another workspace.
 */
export function ThreadOrigin({
  thread,
  workspaces,
}: {
  thread: Thread
  workspaces: readonly Workspace[]
}): React.JSX.Element {
  const { mutation, busy } = useDraftLocation(thread.id)
  const workspace = workspaces.find((entry) => entry.id === thread.workspaceId)
  return (
    <div className="flex flex-col items-center text-center">
      <MeldMark className="w-[24px] h-[24px] mb-[18px] text-[var(--text-tertiary)] opacity-[0.7]" />
      <h2 className="m-0 [font-family:var(--font-display)] text-[21px] font-semibold leading-[1.35] tracking-[-0.015em] text-[var(--text-primary)] [text-wrap:balance]">
        What should we work on in{" "}
        <DropdownMenu
          align="center"
          trigger={
            <BaseButton
              type="button"
              disabled={busy}
              title={workspace?.path}
              aria-label={`Workspace: ${workspace?.name ?? "Unknown workspace"}`}
              className="motion-colors inline-flex max-w-full [margin:0_-4px] [padding:0_4px] border-0 rounded-[var(--radius-sm)] bg-transparent text-inherit [font:inherit] cursor-default [&:hover:not(:disabled)]:bg-[var(--surface-hover)] [&[data-popup-open]]:bg-[var(--surface-hover)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]"
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap [text-decoration:underline_dotted] [text-decoration-color:var(--line-strong)] [text-decoration-thickness:1.5px] [text-underline-offset:5px]">
                {workspace?.name ?? "an unknown workspace"}
              </span>
            </BaseButton>
          }
        >
          <MenuRadioGroup
            value={thread.workspaceId}
            onValueChange={(next) => mutation.mutate({ workspaceId: String(next) })}
          >
            {workspaces.map((entry) => (
              <MenuChoice
                key={entry.id}
                value={entry.id}
                // Paths only disambiguate workspaces that share a name.
                detail={
                  workspaces.some((other) => other.id !== entry.id && other.name === entry.name)
                    ? entry.path
                    : undefined
                }
              >
                {entry.name}
              </MenuChoice>
            ))}
          </MenuRadioGroup>
        </DropdownMenu>
        ?
      </h2>
      {mutation.isError && (
        <ErrorToast message={mutation.error.message} onDismiss={() => mutation.reset()} />
      )}
    </div>
  )
}

/**
 * Sits under an empty thread's composer and chooses between the shared workspace folder and the
 * thread's own Git worktree until the first message.
 */
export function ThreadBranchToggle({ thread }: { thread: Thread }): React.JSX.Element {
  const { mutation, busy } = useDraftLocation(thread.id)
  const pending = useMutationState({
    filters: { mutationKey: draftLocationKey(thread.id), status: "pending" },
    select: (entry) => entry.state.variables as DraftLocation | undefined,
  }).at(-1)
  const worktree = thread.worktree?.state === "removed" ? undefined : thread.worktree
  const isolated = pending?.isolated ?? worktree !== undefined
  const note =
    pending?.isolated === true
      ? "Creating a worktree…"
      : pending?.isolated === false
        ? "Removing the worktree…"
        : pending !== undefined
          ? "Moving the thread…"
          : undefined
  return (
    <div className="thread-branch-toggle [padding:10px_clamp(24px,_7vw,_104px)_0]">
      <div className="flex w-full max-w-[680px] min-w-0 items-center justify-center gap-[10px] [margin:0_auto]">
        <ToggleGroup
          aria-label="Where the thread works"
          value={[isolated ? "own" : "shared"]}
          disabled={busy}
          onValueChange={(value) => {
            const next = value[0]
            if (next !== undefined) mutation.mutate({ isolated: next === "own" })
          }}
          className="flex shrink-0 gap-[2px] p-[2px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)]"
        >
          <Toggle
            value="shared"
            title="Shares files with the other threads in this workspace"
            className={segmentClasses}
          >
            <Folder size={13} strokeWidth={2} aria-hidden="true" />
            Workspace folder
          </Toggle>
          <Toggle
            value="own"
            title="A Git worktree from the current commit, so parallel threads never collide"
            className={segmentClasses}
          >
            <GitBranch size={13} strokeWidth={2} aria-hidden="true" />
            Own branch
          </Toggle>
        </ToggleGroup>
        {note !== undefined && (
          <span className="min-w-0 text-[var(--text-tertiary)] text-[12px]">{note}</span>
        )}
      </div>
      {mutation.isError && (
        <ErrorToast message={mutation.error.message} onDismiss={() => mutation.reset()} />
      )}
    </div>
  )
}
