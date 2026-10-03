import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, CircleAlert, History, Undo2, X } from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { TurnSnapshot } from "@meldshell/contracts/ipc"
import { IconButton, MenuAction } from "../ui/controls"
import { GradientSpinner, PopPresence, Swap } from "../ui/motion"
import { queryKeys } from "../data/cache"

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
  /** The snapshot the folder was last restored to, while that restore can still be undone. */
  readonly restored: Restore | null
  readonly restore: (restore: Restore) => void
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

const pillClasses = [
  "pointer-events-auto flex items-center gap-[8px] max-w-full [padding:4px_4px_4px_12px]",
  "[box-shadow:var(--shadow-raised)] border-[1px] border-[color:var(--line-strong)] rounded-[999px]",
  "bg-[var(--surface-menu)] text-[var(--text-primary)] text-[12px]",
].join(" ")
const pillButtonClasses = [
  "motion-colors inline-flex items-center gap-[5px] shrink-0 h-[24px] [padding:0_10px] border-0",
  "rounded-[999px] bg-[var(--surface-hover)] text-[var(--text-primary)] text-[12px] cursor-pointer",
  "[&:hover]:bg-[var(--surface-active)] [&:disabled]:opacity-[0.5]",
].join(" ")
const dismissClasses = [
  "motion-colors grid place-items-center w-[24px] h-[24px] shrink-0 border-0 rounded-[999px]",
  "bg-transparent text-[var(--text-tertiary)] cursor-pointer",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]",
].join(" ")

type Status =
  | { readonly state: "restoring" }
  | { readonly state: "restored"; readonly restore: Restore }
  | { readonly state: "undone" }
  | { readonly state: "failed"; readonly message: string }

const statusText = (status: Status) =>
  status.state === "restoring"
    ? "Restoring files…"
    : status.state === "undone"
      ? "Restore undone"
      : status.state === "failed"
        ? status.message
        : "Files restored"

function StatusIcon({ status }: { readonly status: Status }): React.JSX.Element {
  return (
    <Swap id={status.state}>
      {status.state === "restoring" ? (
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
 * Owns restoring a thread's files to a turn snapshot. A restore runs at once, because the current
 * files are saved first, and a pill reports it with an Undo until the next restore, a new turn, or
 * a dismissal.
 */
export function TurnSnapshots({
  workspaceId,
  threadId,
  running,
  children,
}: {
  /** Absent when the transcript has no folder to restore, such as a remote preview. */
  readonly workspaceId: string | undefined
  readonly threadId: string
  readonly running: boolean
  readonly children: ReactNode
}): React.JSX.Element {
  const client = useQueryClient()
  const [status, setStatus] = useState<Status | null>(null)
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
  const undo = useMutation({
    mutationFn: () => window.meldshell.undoSnapshotRestore({ workspaceId: workspaceId!, threadId }),
    onSuccess: () => setStatus({ state: "undone" }),
    onError: fail,
    onSettled: refresh,
  })
  // A new turn changes the files again, so the restore it followed is no longer the latest state.
  const [wasRunning, setWasRunning] = useState(running)
  if (running !== wasRunning) {
    setWasRunning(running)
    if (running) setStatus(null)
  }
  // A finished undo fades on its own; a restore waits for its Undo and a failure for its reader.
  useEffect(() => {
    if (status?.state !== "undone") return
    const timer = window.setTimeout(() => setStatus(null), 2400)
    return () => window.clearTimeout(timer)
  }, [status])
  if (workspaceId === undefined) return <>{children}</>
  const pending = restore.isPending || undo.isPending
  return (
    <SnapshotContext
      value={{
        workspaceId,
        threadId,
        busy: running || pending,
        restored: status?.state === "restored" ? status.restore : null,
        restore: (input) => restore.mutate(input),
      }}
    >
      {children}
      <div className="absolute z-[2] bottom-[52px] inset-x-[16px] flex justify-center pointer-events-none">
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
              {status.state === "restored" && (
                <BaseButton
                  type="button"
                  disabled={pending}
                  onClick={() => undo.mutate()}
                  className={pillButtonClasses}
                >
                  <Undo2 size={13} aria-hidden="true" />
                  Undo
                </BaseButton>
              )}
              {status.state !== "restoring" && (
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
