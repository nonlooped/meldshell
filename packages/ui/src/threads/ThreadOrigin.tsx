import { Button as BaseButton } from "@base-ui-components/react/button"
import { useIsMutating, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query"
import type { Thread, Workspace } from "@meldshell/contracts"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import { ArrowUpRight, CircleDot, Folder, GitBranch, SquareTerminal } from "lucide-react"
import { replaceSnapshot } from "../data/cache"
import { DropdownMenu, MenuChoice, MenuRadioGroup } from "../ui/controls"
import { MeldMark } from "../ui/MeldMark"
import { motion } from "motion/react"
import { useMotionPreference } from "../ui/motion"
import { ErrorToast } from "../ui/Notice"
import { segmentClasses, segmentGroupClasses } from "../ui/styles"
import { WorktreeSetupNote } from "../files/WorktreeSetup"
import { useViewStore } from "../app/view-store"

const originEase = [0.16, 1, 0.3, 1] as const

type DraftLocation = { workspaceId?: string; isolated?: boolean }

/** The quiet buttons beside the branch toggle that start the thread from something else. */
const originActionClasses =
  "motion-colors inline-flex shrink-0 items-center gap-[6px] h-[26px] [padding:0_9px] border-0 rounded-[var(--radius-sm)] bg-transparent text-[12px] text-[var(--text-secondary)] cursor-default [&:hover:not(:disabled)]:bg-[var(--surface-hover)] [&:hover:not(:disabled)]:text-[var(--text-primary)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]"

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
  const reduced = useMotionPreference()
  // The mark settles out of a blur, then the question rises beneath it, echoing the launch screen.
  const enter = (
    delay: number,
    from: Record<string, number | string>,
    to: Record<string, number | string>,
  ) => ({
    initial: reduced ? (false as const) : { opacity: 0, ...from },
    animate: { opacity: 1, ...to },
    transition: { duration: reduced ? 0 : 0.6, delay: reduced ? 0 : delay, ease: originEase },
  })
  const mark = (
    <motion.div
      {...enter(0, { scale: 0.8, filter: "blur(6px)" }, { scale: 1, filter: "blur(0px)" })}
    >
      <MeldMark className="block w-[24px] h-[24px] mb-[18px] text-[var(--text-tertiary)] opacity-[0.7]" />
    </motion.div>
  )
  // An issue already says what to work on, so its title takes the question's place.
  if (thread.issue !== undefined)
    return (
      <div className="flex flex-col items-center text-center">
        {mark}
        <motion.a
          {...enter(0.04, { y: 4 }, { y: 0 })}
          href={thread.issue.url}
          target="_blank"
          rel="noreferrer"
          title="Open the issue on GitHub"
          className="motion-colors group inline-flex items-center gap-[6px] h-[24px] mb-[8px] [padding:0_9px_0_8px] rounded-full border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)] text-[12px] text-[var(--text-secondary)] no-underline [&:hover]:text-[var(--text-primary)] [&:hover]:border-[color:var(--line)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]"
        >
          <CircleDot
            size={13}
            strokeWidth={2}
            className="text-[var(--color-added)]"
            aria-hidden="true"
          />
          <span className="tabular-nums">Issue #{thread.issue.number}</span>
          {workspace !== undefined && (
            <span className="text-[var(--text-tertiary)]">in {workspace.name}</span>
          )}
          <ArrowUpRight
            size={12}
            className="text-[var(--text-tertiary)] motion-transform group-hover:[transform:translate(1px,-1px)]"
            aria-hidden="true"
          />
        </motion.a>
        <motion.h2
          {...enter(0.08, { y: 6 }, { y: 0 })}
          className="m-0 max-w-[560px] [font-family:var(--font-display)] text-[21px] font-semibold leading-[1.35] tracking-[-0.015em] text-[var(--text-primary)] [text-wrap:balance]"
        >
          {thread.issue.title}
        </motion.h2>
        <motion.p
          {...enter(0.14, { y: 4 }, { y: 0 })}
          className="m-0 mt-[8px] max-w-[440px] text-[12.5px] leading-[1.55] text-[var(--text-tertiary)] [text-wrap:pretty]"
        >
          The issue's description and comments go to the agent with your first message.
        </motion.p>
      </div>
    )
  return (
    <div className="flex flex-col items-center text-center">
      {mark}
      <motion.h2
        {...enter(0.08, { y: 6 }, { y: 0 })}
        className="m-0 [font-family:var(--font-display)] text-[21px] font-semibold leading-[1.35] tracking-[-0.015em] text-[var(--text-primary)] [text-wrap:balance]"
      >
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
      </motion.h2>
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
    <div className="thread-branch-toggle [padding:10px_var(--pane-gutter)_0]">
      <div className="flex w-full max-w-[680px] min-w-0 items-center justify-center gap-[10px] [margin:0_auto]">
        <ToggleGroup
          aria-label="Where the thread works"
          value={[isolated ? "own" : "shared"]}
          disabled={busy}
          onValueChange={(value) => {
            const next = value[0]
            if (next !== undefined) mutation.mutate({ isolated: next === "own" })
          }}
          className={`shrink-0 ${segmentGroupClasses}`}
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
        {note !== undefined ? (
          <span className="min-w-0 text-[var(--text-tertiary)] text-[12px]">{note}</span>
        ) : (
          <WorktreeSetupNote thread={thread} className="text-[12px]" />
        )}
        {thread.issue === undefined && note === undefined && (
          <BaseButton
            type="button"
            disabled={busy}
            title="Start a thread on its own branch from an open GitHub issue"
            onClick={() => useViewStore.getState().openIssuePicker(thread.workspaceId)}
            className={originActionClasses}
          >
            <CircleDot size={13} strokeWidth={2} aria-hidden="true" />
            From an issue
          </BaseButton>
        )}
        {thread.issue === undefined && note === undefined && (
          <BaseButton
            type="button"
            disabled={busy}
            title="Continue a Claude Code or Codex session started in a terminal"
            onClick={() => useViewStore.getState().openSessionPicker(thread.workspaceId)}
            className={originActionClasses}
          >
            <SquareTerminal size={13} strokeWidth={2} aria-hidden="true" />
            From the terminal
          </BaseButton>
        )}
      </div>
      {mutation.isError && (
        <ErrorToast message={mutation.error.message} onDismiss={() => mutation.reset()} />
      )}
    </div>
  )
}
