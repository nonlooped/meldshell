import { createContext, useContext, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { History, Undo2, X } from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { TurnSnapshot } from "@meldshell/contracts/ipc"
import { AppDialog, Button, IconButton, MenuAction } from "../ui/controls"
import { PopPresence } from "../ui/motion"
import { queryKeys } from "../data/cache"

type SnapshotPoint = "before" | "after"

interface Restore {
  readonly turnId: string
  readonly point: SnapshotPoint
  /** The turn's first prompt, so the dialog and the result can say which turn it was. */
  readonly prompt: string
}

interface SnapshotScope {
  readonly workspaceId: string
  readonly threadId: string
  /** The thread's latest turn is still running, so its folder cannot be restored. */
  readonly running: boolean
  readonly request: (restore: Restore) => void
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

const excerpt = (text: string) => {
  const line = text.trim().split("\n")[0] ?? ""
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line
}

/** The hover action on a turn's prompt that returns the files to just before it was sent. */
export function RestoreBeforeButton({
  turnId,
  prompt,
  snapshot,
}: {
  readonly turnId: string
  readonly prompt: string
  readonly snapshot: TurnSnapshot | undefined
}): React.JSX.Element | null {
  const scope = useContext(SnapshotContext)
  if (scope === null || snapshot?.before !== true) return null
  return (
    <IconButton
      unstyled
      label="Restore files to before this message"
      disabled={scope.running}
      onClick={() => scope.request({ turnId, point: "before", prompt })}
    >
      <History size={13} />
    </IconButton>
  )
}

/** Context menu entries for a turn's snapshots. */
export function SnapshotMenuActions({
  turnId,
  prompt,
  snapshot,
}: {
  readonly turnId: string
  readonly prompt: string
  readonly snapshot: TurnSnapshot | undefined
}): React.JSX.Element | null {
  const scope = useContext(SnapshotContext)
  if (scope === null || snapshot === undefined || scope.running) return null
  return (
    <>
      {snapshot.before && (
        <MenuAction onClick={() => scope.request({ turnId, point: "before", prompt })}>
          Restore files to before this turn
        </MenuAction>
      )}
      {snapshot.after && (
        <MenuAction onClick={() => scope.request({ turnId, point: "after", prompt })}>
          Restore files to the end of this turn
        </MenuAction>
      )}
    </>
  )
}

/**
 * Owns restoring a thread's files to a turn snapshot: it confirms the restore, runs it, and then
 * offers to undo it until the next restore, a new turn, or a dismissal.
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
  const [pending, setPending] = useState<Restore | null>(null)
  const [restored, setRestored] = useState<Restore | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.turnSnapshots(threadId) })
  const restore = useMutation({
    mutationFn: (input: Restore) =>
      window.meldshell.restoreTurnSnapshot({
        workspaceId: workspaceId!,
        threadId,
        turnId: input.turnId,
        point: input.point,
      }),
    onSuccess: (_, input) => {
      setPending(null)
      setRestored(input)
    },
    onSettled: refresh,
  })
  const undo = useMutation({
    mutationFn: () => window.meldshell.undoSnapshotRestore({ workspaceId: workspaceId!, threadId }),
    onSuccess: () => setRestored(null),
    onSettled: refresh,
  })
  // A new turn changes the files again, so the restore it followed is no longer the latest state.
  const [wasRunning, setWasRunning] = useState(running)
  if (running !== wasRunning) {
    setWasRunning(running)
    if (running) setRestored(null)
  }
  const before = pending?.point === "before"
  if (workspaceId === undefined) return <>{children}</>
  return (
    <SnapshotContext
      value={{
        workspaceId,
        threadId,
        running,
        request: (input) => {
          restore.reset()
          setPending(input)
        },
      }}
    >
      {children}
      <div className="absolute z-[2] bottom-[52px] inset-x-[16px] flex justify-center pointer-events-none">
        <PopPresence show={restored !== null && !running}>
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-[10px] max-w-full [box-shadow:var(--shadow-raised)] [padding:5px_6px_5px_12px] border-[1px] border-[color:var(--line-strong)] rounded-[999px] bg-[var(--surface-menu)] text-[var(--text-secondary)] text-[12px]"
          >
            <History size={14} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {restored?.point === "after"
                ? "Files restored to the end of "
                : "Files restored to before "}
              <span className="text-[var(--text-primary)]">
                “{excerpt(restored?.prompt ?? "")}”
              </span>
            </span>
            {undo.isError && (
              <span className="text-[var(--color-deleted)]" title={undo.error.message}>
                Undo failed
              </span>
            )}
            <BaseButton
              type="button"
              disabled={undo.isPending}
              onClick={() => undo.mutate()}
              className="motion-colors inline-flex items-center gap-[5px] shrink-0 [padding:3px_9px] border-0 rounded-[999px] bg-[var(--surface-hover)] text-[var(--text-primary)] text-[12px] cursor-pointer [&:hover]:bg-[var(--surface-active)] [&:disabled]:opacity-[0.5]"
            >
              <Undo2 size={13} aria-hidden="true" />
              Undo
            </BaseButton>
            <IconButton
              unstyled
              label="Dismiss"
              onClick={() => setRestored(null)}
              className="motion-colors grid place-items-center w-[22px] h-[22px] shrink-0 border-0 rounded-[999px] bg-transparent text-[var(--text-tertiary)] cursor-pointer [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]"
            >
              <X size={13} />
            </IconButton>
          </div>
        </PopPresence>
      </div>
      <AppDialog
        alert
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !restore.isPending) setPending(null)
        }}
        title={
          before ? "Restore files to before this turn?" : "Restore files to the end of this turn?"
        }
        actions={
          <>
            <Button disabled={restore.isPending} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={restore.isPending}
              onClick={() => pending && restore.mutate(pending)}
            >
              {restore.isPending ? "Restoring…" : "Restore files"}
            </Button>
          </>
        }
      >
        <p>
          {before
            ? "The thread's folder returns to how it was when you sent "
            : "The thread's folder returns to how it was when the agent finished "}
          <span className="text-[var(--text-primary)]">“{excerpt(pending?.prompt ?? "")}”</span>.
          {before ? " This turn's changes and every later one are undone." : ""}
        </p>
        <p>
          Your current files are saved first, so you can undo this. The conversation stays as it is,
          and ignored files are left alone.
        </p>
        {restore.isError && <p role="alert">{restore.error.message}</p>}
      </AppDialog>
    </SnapshotContext>
  )
}
