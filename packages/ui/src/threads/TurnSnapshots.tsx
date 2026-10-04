import { createContext, useContext, useEffect, type ReactNode } from "react"
import { create } from "zustand"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, CircleAlert, GitFork, History, Rewind, Undo2, X } from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { TurnSnapshot } from "@meldshell/contracts/ipc"
import { IconButton, MenuAction } from "../ui/controls"
import { floatingPillClasses } from "../ui/styles"
import { GradientSpinner, PopPresence, Swap } from "../ui/motion"
import { queryKeys, replaceSnapshot } from "../data/cache"
import { useTabStore } from "../app/tab-store"
import { useThreadDrafts } from "../app/thread-drafts"
import { useViewStore } from "../app/view-store"

type SnapshotPoint = "before" | "after"

interface Restore {
  readonly turnId: string
  readonly point: SnapshotPoint
}

interface SnapshotScope {
  readonly workspaceId: string
  readonly threadId: string
  /** A turn is running or a restore is in flight, so the folder cannot be restored now. */
  readonly busy: boolean
  /** A restore, rewind, or fork is in flight. A fork only reads the folder, so a turn can run. */
  readonly pending: boolean
  /** The snapshot the folder was last restored to, while that restore can still be undone. */
  readonly restored: Restore | null
  readonly restore: (restore: Restore) => void
  /** Takes the conversation, and the files when they were snapshotted, back to before a turn. */
  readonly rewind: (turnId: string) => void
  /** Copies the conversation and files up to a point into a new thread on its own worktree. */
  readonly fork: (turnId: string, point: SnapshotPoint) => void
}

const SnapshotContext = createContext<SnapshotScope | null>(null)

/**
 * A turn's snapshots: the thread's files as they were when the turn started and when it finished.
 * Both are immutable once the turn ends, so they are read once per turn and refreshed only by a
 * restore.
 */
export function useTurnSnapshot(turnId: string, complete: boolean): TurnSnapshot | undefined {
  const scope = useContext(SnapshotContext)
  const query = useQuery({
    queryKey: queryKeys.turnSnapshot(scope?.threadId ?? "", turnId),
    queryFn: () =>
      window.meldshell.getTurnSnapshot({
        workspaceId: scope!.workspaceId,
        threadId: scope!.threadId,
        turnId,
      }),
    enabled: scope !== null && complete,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  return query.data
}

/** Rewinds the thread's files to just before a turn. Restores are undoable, so nothing asks first. */
export function RestoreBeforeButton({
  turnId,
  snapshot,
  className,
}: {
  readonly turnId: string
  readonly snapshot: TurnSnapshot | undefined
  /** Standard icon-button styling when absent; the message actions row styles its own. */
  readonly className?: string
}): React.JSX.Element | null {
  const scope = useContext(SnapshotContext)
  if (scope === null || snapshot?.before !== true) return null
  return (
    <IconButton
      unstyled={className === undefined}
      className={className}
      label="Restore files to before this turn"
      disabled={scope.busy}
      onClick={() => scope.restore({ turnId, point: "before" })}
    >
      <History size={13} />
    </IconButton>
  )
}

/**
 * Rewinds the thread to just before a message: later turns leave the conversation, the files go
 * back when they were snapshotted, and the message returns to the composer to edit and resend.
 */
export function RewindButton({ turnId }: { readonly turnId: string }): React.JSX.Element | null {
  const scope = useContext(SnapshotContext)
  if (scope === null || turnId.startsWith("event:")) return null
  return (
    <IconButton
      unstyled
      label="Rewind to this message"
      disabled={scope.busy}
      onClick={() => scope.rewind(turnId)}
    >
      <Rewind size={13} />
    </IconButton>
  )
}

export function RewindMenuAction({
  turnId,
}: {
  readonly turnId: string
}): React.JSX.Element | null {
  const scope = useContext(SnapshotContext)
  if (scope === null || scope.busy || turnId.startsWith("event:")) return null
  return <MenuAction onClick={() => scope.rewind(turnId)}>Rewind to this message</MenuAction>
}

const forkLabels: Readonly<Record<SnapshotPoint, string>> = {
  before: "Fork from this message",
  after: "Fork from this reply",
}

/**
 * Starts a new thread on its own worktree from this point, leaving this thread as it is. From a
 * message, the fork stops before it and the message waits in the fork's composer to be rewritten;
 * from a reply, the fork keeps the whole turn.
 */
export function ForkButton({
  turnId,
  point,
}: {
  readonly turnId: string
  readonly point: SnapshotPoint
}): React.JSX.Element | null {
  const scope = useContext(SnapshotContext)
  if (scope === null || turnId.startsWith("event:")) return null
  return (
    <IconButton
      unstyled
      label={forkLabels[point]}
      disabled={scope.pending}
      onClick={() => scope.fork(turnId, point)}
    >
      <GitFork size={13} />
    </IconButton>
  )
}

export function ForkMenuAction({
  turnId,
  point,
}: {
  readonly turnId: string
  readonly point: SnapshotPoint
}): React.JSX.Element | null {
  const scope = useContext(SnapshotContext)
  if (scope === null || scope.pending || turnId.startsWith("event:")) return null
  return <MenuAction onClick={() => scope.fork(turnId, point)}>{forkLabels[point]}</MenuAction>
}

/** Context menu entries for a turn's snapshots. */
export function SnapshotMenuActions({
  turnId,
  snapshot,
}: {
  readonly turnId: string
  readonly snapshot: TurnSnapshot | undefined
}): React.JSX.Element | null {
  const scope = useContext(SnapshotContext)
  if (scope === null || snapshot === undefined || scope.busy) return null
  return (
    <>
      {snapshot.before && (
        <MenuAction onClick={() => scope.restore({ turnId, point: "before" })}>
          Restore files to before this turn
        </MenuAction>
      )}
      {snapshot.after && (
        <MenuAction onClick={() => scope.restore({ turnId, point: "after" })}>
          Restore files to the end of this turn
        </MenuAction>
      )}
    </>
  )
}

const markerClasses = [
  "flex items-center gap-[8px] text-[var(--accent)] text-[11px] font-medium",
  "[&::before]:content-[''] [&::before]:flex-1 [&::before]:h-[1px] [&::before]:bg-[var(--accent)] [&::before]:opacity-[0.35]",
  "[&::after]:content-[''] [&::after]:flex-1 [&::after]:h-[1px] [&::after]:bg-[var(--accent)] [&::after]:opacity-[0.35]",
].join(" ")

/** A line across the transcript where the files now stand, so a restore shows where it landed. */
export function RestoredMarker({
  turnId,
  point,
}: {
  readonly turnId: string
  readonly point: SnapshotPoint
}): React.JSX.Element | null {
  const restored = useContext(SnapshotContext)?.restored
  if (restored?.turnId !== turnId || restored.point !== point) return null
  return (
    <div className={markerClasses} role="note">
      <History size={12} aria-hidden="true" />
      Files restored to here
    </div>
  )
}

const pillClasses = `pointer-events-auto max-w-full [padding:4px_4px_4px_12px] ${floatingPillClasses}`
const pillButtonClasses = [
  "motion-colors inline-flex items-center gap-[5px] shrink-0 h-[24px] [padding:0_10px] border-0",
  "rounded-[999px] bg-[var(--surface-hover)] text-[var(--text-primary)] text-[12px] cursor-default",
  "[&:hover]:bg-[var(--surface-active)] [&:disabled]:opacity-[0.5]",
].join(" ")
const dismissClasses = [
  "motion-colors grid place-items-center w-[24px] h-[24px] shrink-0 border-0 rounded-[999px]",
  "bg-transparent text-[var(--text-tertiary)] cursor-default",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]",
].join(" ")

interface Rewound {
  readonly turnCount: number
  readonly filesRestored: boolean
  /** The rewound message as it went into the composer. */
  readonly text: string
}

type Status =
  | { readonly state: "restoring" | "rewinding" | "forking" }
  | { readonly state: "forked"; readonly filesRestored: boolean }
  | { readonly state: "restored"; readonly restore: Restore }
  | { readonly state: "rewound"; readonly rewound: Rewound }
  | { readonly state: "undone"; readonly rewind: boolean }
  | { readonly state: "failed"; readonly message: string }

/**
 * Each thread's pill outlives the transcript that showed it: rewinding every turn swaps the
 * transcript for the empty thread's view, and the Undo has to survive that.
 */
const useStatuses = create<{
  readonly statuses: Readonly<Record<string, Status>>
  readonly set: (threadId: string, status: Status | null) => void
}>((set) => ({
  statuses: {},
  set: (threadId, status) =>
    set(({ statuses }) => {
      const { [threadId]: _, ...rest } = statuses
      return { statuses: status === null ? rest : { ...rest, [threadId]: status } }
    }),
}))

const working = (status: Status) =>
  status.state === "restoring" || status.state === "rewinding" || status.state === "forking"

const turns = (count: number) => `${count} ${count === 1 ? "turn" : "turns"}`

const statusText = (status: Status) => {
  switch (status.state) {
    case "restoring":
      return "Restoring files…"
    case "rewinding":
      return "Rewinding…"
    case "forking":
      return "Forking into a new worktree…"
    case "forked":
      return status.filesRestored
        ? "Forked into its own worktree"
        : "Forked. This point had no file snapshot, so the files are the original's latest commit"
    case "restored":
      return "Files restored"
    case "rewound":
      return status.rewound.filesRestored
        ? `Rewound ${turns(status.rewound.turnCount)} and their files`
        : `Rewound ${turns(status.rewound.turnCount)}`
    case "undone":
      return status.rewind ? "Rewind undone" : "Restore undone"
    case "failed":
      return status.message
  }
}

function StatusIcon({ status }: { readonly status: Status }): React.JSX.Element {
  return (
    <Swap id={status.state}>
      {working(status) ? (
        <GradientSpinner size={12} />
      ) : status.state === "failed" ? (
        <CircleAlert size={14} className="text-[var(--color-deleted)]" aria-hidden="true" />
      ) : (
        <Check size={14} className="text-[var(--color-added)]" aria-hidden="true" />
      )}
    </Swap>
  )
}

/**
 * Owns restoring a thread's files to a turn snapshot and rewinding its conversation. Both run at
 * once, because what they replace is kept, and a pill reports each with an Undo until the next
 * restore, a new turn, or a dismissal.
 */
export function TurnSnapshots({
  workspaceId,
  threadId,
  running,
  onRewound,
  onRewindUndone,
  inline = false,
  children,
}: {
  /** Shows the pill below the content instead of floating over the transcript's foot. */
  readonly inline?: boolean
  /** Absent when the transcript has no folder to restore, such as a remote preview. */
  readonly workspaceId: string | undefined
  readonly threadId: string
  readonly running: boolean
  /** Receives the rewound message, to edit and send again. */
  readonly onRewound?: (text: string) => void
  /** Receives the message a rewind put in the composer, once the rewind is undone. */
  readonly onRewindUndone?: (text: string) => void
  readonly children: ReactNode
}): React.JSX.Element {
  const client = useQueryClient()
  const status = useStatuses((state) => state.statuses[threadId] ?? null)
  const setStatus = (next: Status | null) => useStatuses.getState().set(threadId, next)
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.turnSnapshots(threadId) })
  const fail = (cause: Error) => setStatus({ state: "failed", message: cause.message })
  const restore = useMutation({
    mutationFn: (input: Restore) =>
      window.meldshell.restoreTurnSnapshot({ workspaceId: workspaceId!, threadId, ...input }),
    onMutate: () => setStatus({ state: "restoring" }),
    onSuccess: (_, input) => setStatus({ state: "restored", restore: input }),
    onError: fail,
    onSettled: refresh,
  })
  const rewind = useMutation({
    mutationFn: (turnId: string) =>
      window.meldshell.rewindThread({ workspaceId: workspaceId!, threadId, turnId }),
    onMutate: () => setStatus({ state: "rewinding" }),
    onSuccess: ({ snapshot, ...rewound }) => {
      replaceSnapshot(client, snapshot)
      setStatus({ state: "rewound", rewound })
      onRewound?.(rewound.text)
    },
    onError: fail,
    onSettled: refresh,
  })
  const fork = useMutation({
    mutationFn: ({ turnId, point }: { turnId: string; point: SnapshotPoint }) =>
      window.meldshell.forkThread({ workspaceId: workspaceId!, threadId, turnId, point }),
    onMutate: () => setStatus({ state: "forking" }),
    onSuccess: ({ snapshot, threadId: forkId, text, filesRestored }) => {
      replaceSnapshot(client, snapshot)
      setStatus(null)
      useStatuses.getState().set(forkId, { state: "forked", filesRestored })
      // A message forked from waits in the new thread's composer, to be rewritten and sent.
      if (text !== "") useThreadDrafts.getState().update(forkId, { text })
      useTabStore.getState().openThread(forkId)
      useViewStore.getState().focusComposer(forkId)
    },
    onError: fail,
  })
  const undo = useMutation({
    mutationFn: async (rewound: Rewound | null) => {
      if (rewound === null)
        return window.meldshell.undoSnapshotRestore({ workspaceId: workspaceId!, threadId })
      replaceSnapshot(
        client,
        (await window.meldshell.undoRewind({ workspaceId: workspaceId!, threadId })).snapshot,
      )
      onRewindUndone?.(rewound.text)
    },
    onSuccess: (_, rewound) => setStatus({ state: "undone", rewind: rewound !== null }),
    onError: fail,
    onSettled: refresh,
  })
  // A new turn changes the files again, so the restore it followed is no longer the latest state.
  useEffect(() => {
    if (running) useStatuses.getState().set(threadId, null)
  }, [running, threadId])
  // A finished undo or fork fades on its own; a restore waits for its Undo and a failure, or a
  // fork that could not bring the files, for its reader.
  useEffect(() => {
    const fades = status?.state === "undone" || (status?.state === "forked" && status.filesRestored)
    if (!fades) return
    const timer = window.setTimeout(() => useStatuses.getState().set(threadId, null), 2400)
    return () => window.clearTimeout(timer)
  }, [status, threadId])
  if (workspaceId === undefined) return <>{children}</>
  const pending = restore.isPending || rewind.isPending || undo.isPending || fork.isPending
  return (
    <SnapshotContext
      value={{
        workspaceId,
        threadId,
        busy: running || pending,
        pending,
        restored: status?.state === "restored" ? status.restore : null,
        restore: (input) => restore.mutate(input),
        rewind: (turnId) => rewind.mutate(turnId),
        fork: (turnId, point) => fork.mutate({ turnId, point }),
      }}
    >
      {children}
      <div
        className={
          inline
            ? "flex justify-center mt-[16px] empty:hidden"
            : "absolute z-[2] bottom-[52px] inset-x-[16px] flex justify-center pointer-events-none"
        }
      >
        <PopPresence show={status !== null}>
          {status !== null && (
            <div role="status" className={pillClasses}>
              <StatusIcon status={status} />
              <span
                className="min-w-0 max-w-[420px] overflow-hidden text-ellipsis whitespace-nowrap"
                title={status.state === "failed" ? status.message : undefined}
              >
                {statusText(status)}
              </span>
              {(status.state === "restored" || status.state === "rewound") && (
                <BaseButton
                  type="button"
                  disabled={pending}
                  onClick={() => undo.mutate(status.state === "rewound" ? status.rewound : null)}
                  className={pillButtonClasses}
                >
                  <Undo2 size={13} aria-hidden="true" />
                  Undo
                </BaseButton>
              )}
              {!working(status) && (
                <IconButton
                  unstyled
                  label="Dismiss"
                  onClick={() => setStatus(null)}
                  className={dismissClasses}
                >
                  <X size={13} />
                </IconButton>
              )}
            </div>
          )}
        </PopPresence>
      </div>
    </SnapshotContext>
  )
}
