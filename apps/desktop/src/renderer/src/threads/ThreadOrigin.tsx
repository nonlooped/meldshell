import { Button as BaseButton } from "@base-ui-components/react/button"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Thread, Workspace } from "@meldshell/contracts"
import { ChevronDown } from "lucide-react"
import { replaceSnapshot } from "../data/cache"
import { DropdownMenu, MenuChoice, MenuRadioGroup } from "../ui/controls"
import { ErrorToast } from "../ui/Notice"

type Choice = { readonly value: string; readonly name: string; readonly detail: string }

/** A label and a quiet value that opens a menu of choices, sized to sit in the workspace line. */
function OriginMenu({
  label,
  separated = false,
  value,
  text,
  title,
  choices,
  disabled,
  onChange,
}: {
  label: string
  /** Leaves extra room before the label so each pair reads as a unit. */
  separated?: boolean
  value: string
  text: string
  title?: string | undefined
  choices: readonly Choice[]
  disabled: boolean
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <>
      <span className={separated ? "ml-[10px]" : undefined}>{label}</span>
      <DropdownMenu
        align="start"
        trigger={
          <BaseButton
            type="button"
            disabled={disabled}
            title={title}
            className="motion-colors inline-flex min-w-0 items-center gap-[3px] p-0 border-0 bg-transparent text-[var(--text-secondary)] font-medium cursor-default [&:hover]:text-[var(--text-primary)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px] [&:disabled]:text-[var(--text-tertiary)]"
            aria-label={`${label}: ${text}`}
          >
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{text}</span>
            <ChevronDown
              size={12}
              strokeWidth={2}
              className="flex-none text-[var(--text-tertiary)]"
            />
          </BaseButton>
        }
      >
        <MenuRadioGroup value={value} onValueChange={(next) => onChange(String(next))}>
          {choices.map((choice) => (
            <MenuChoice
              key={choice.value}
              value={choice.value}
              className="h-auto [padding:7px_9px] items-start"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                <span className="text-inherit text-[12.5px]">{choice.name}</span>
                <span className="text-[var(--text-tertiary)] text-[11px] [overflow-wrap:anywhere]">
                  {choice.detail}
                </span>
              </span>
            </MenuChoice>
          ))}
        </MenuRadioGroup>
      </DropdownMenu>
    </>
  )
}

/**
 * An empty thread's workspace line. Until the first message, it moves the thread to another
 * workspace and chooses between the shared workspace folder and the thread's own Git worktree.
 */
export function ThreadOrigin({
  thread,
  workspaces,
}: {
  thread: Thread
  workspaces: readonly Workspace[]
}): React.JSX.Element {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { workspaceId?: string; isolated?: boolean }) =>
      window.meldshell.setDraftLocation({ threadId: thread.id, ...input }),
    onSuccess: (snapshot) => replaceSnapshot(client, snapshot),
  })
  const workspace = workspaces.find((entry) => entry.id === thread.workspaceId)
  const worktree = thread.worktree?.state === "removed" ? undefined : thread.worktree
  const pending = mutation.isPending ? mutation.variables : undefined
  const branchText =
    pending?.isolated === true
      ? "Creating worktree…"
      : pending !== undefined
        ? "Moving…"
        : (worktree?.branch ?? "Workspace folder")
  return (
    <>
      <OriginMenu
        label="Workspace"
        value={thread.workspaceId}
        text={workspace?.name ?? "Unknown workspace"}
        title={workspace?.path}
        choices={workspaces.map((entry) => ({
          value: entry.id,
          name: entry.name,
          detail: entry.path,
        }))}
        disabled={mutation.isPending}
        onChange={(workspaceId) => mutation.mutate({ workspaceId })}
      />
      <OriginMenu
        label="Branch"
        separated
        value={worktree === undefined ? "shared" : "own"}
        text={branchText}
        title={worktree?.path}
        choices={[
          {
            value: "shared",
            name: "Workspace folder",
            detail: "Shares files with other threads in this workspace",
          },
          {
            value: "own",
            name: "Own branch",
            detail: "A Git worktree from the current commit, so parallel threads never collide",
          },
        ]}
        disabled={mutation.isPending}
        onChange={(value) => mutation.mutate({ isolated: value === "own" })}
      />
      {mutation.isError && (
        <ErrorToast message={mutation.error.message} onDismiss={() => mutation.reset()} />
      )}
    </>
  )
}
