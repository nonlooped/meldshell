import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Thread, WorktreeSetup } from "@meldshell/contracts"
import { AppDialog, Button } from "../ui/controls"
import { replaceSnapshot } from "../data/cache"

const setupNotes: Record<WorktreeSetup, string> = {
  running: "Running the setup script…",
  succeeded: "Setup script finished",
  failed: "Setup script failed",
  interrupted: "Setup script stopped",
}

const noteColors: Record<WorktreeSetup, string> = {
  running: "text-[var(--text-tertiary)]",
  succeeded: "text-[var(--text-tertiary)]",
  failed: "text-[var(--color-deleted)]",
  interrupted: "text-[var(--color-modified)]",
}

/** Stops or reruns a thread's setup script; either returns the snapshot that shows the change. */
export function useWorktreeSetupActions(threadId: string) {
  const client = useQueryClient()
  const onSuccess = (snapshot: Awaited<ReturnType<typeof window.meldshell.stopWorktreeSetup>>) => {
    replaceSnapshot(client, snapshot)
    void client.invalidateQueries({ queryKey: ["worktree-setup-log", threadId] })
  }
  const stop = useMutation({
    mutationFn: () => window.meldshell.stopWorktreeSetup(threadId),
    onSuccess,
  })
  const rerun = useMutation({
    mutationFn: () => window.meldshell.rerunWorktreeSetup(threadId),
    onSuccess,
  })
  return { stop, rerun }
}

/** The setup script's output, followed live while it runs. */
export function SetupLogDialog({
  thread,
  open,
  onOpenChange,
}: {
  thread: Thread
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const setup = thread.worktree?.setup
  const running = setup === "running"
  const { stop, rerun } = useWorktreeSetupActions(thread.id)
  const log = useQuery({
    queryKey: ["worktree-setup-log", thread.id],
    queryFn: () => window.meldshell.getWorktreeSetupLog(thread.id),
    enabled: open,
    refetchInterval: open && running ? 1_000 : false,
    retry: false,
  })
  const outputRef = useRef<HTMLPreElement>(null)
  const text = log.data?.text
  // Follow new output unless the reader has scrolled up to read earlier lines.
  const following = useRef(true)
  useEffect(() => {
    const output = outputRef.current
    if (output !== null && text !== undefined && following.current)
      output.scrollTop = output.scrollHeight
  }, [text])
  const error = stop.error ?? rerun.error ?? log.error
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          stop.reset()
          rerun.reset()
        }
        onOpenChange(next)
      }}
      title="Setup script output"
      actions={
        <>
          {running ? (
            <Button disabled={stop.isPending} onClick={() => stop.mutate()}>
              Stop setup
            </Button>
          ) : (
            <Button
              disabled={rerun.isPending || thread.worktree?.state !== "ready"}
              onClick={() => rerun.mutate()}
            >
              Run again
            </Button>
          )}
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </>
      }
    >
      {setup !== undefined && (
        <p className={noteColors[setup]} role="status">
          {setupNotes[setup]}
          {log.data?.truncated && " · showing the end of a long log"}
        </p>
      )}
      <pre
        ref={outputRef}
        tabIndex={0}
        onScroll={(event) => {
          const output = event.currentTarget
          following.current = output.scrollHeight - output.scrollTop - output.clientHeight < 24
        }}
        className="[margin:10px_20px_0] max-h-[50vh] min-h-[120px] p-[10px] overflow-auto border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] bg-[var(--surface-hover)] text-[var(--text-primary)] [font:11.5px_/_1.6_var(--font-mono)] whitespace-pre-wrap [overflow-wrap:anywhere] [&:focus-visible]:[outline:1px_solid_var(--focus-ring)]"
      >
        {text === undefined ? (log.isFetching ? "Loading…" : "") : text || "No output yet."}
      </pre>
      {error && (
        <p role="alert" className="text-[var(--color-deleted)]!">
          {error.message}
        </p>
      )}
    </AppDialog>
  )
}

/**
 * A worktree setup script that is running or did not finish, with a way to read its output. A
 * finished setup needs no attention, so it shows nothing.
 */
export function WorktreeSetupNote({
  thread,
  className = "",
}: {
  thread: Thread
  className?: string
}): React.JSX.Element | null {
  const [showingLog, setShowingLog] = useState(false)
  const setup = thread.worktree?.setup
  if (setup === undefined || setup === "succeeded") return null
  return (
    <span className={`inline-flex min-w-0 items-center gap-[6px] ${className}`}>
      <span className={`min-w-0 ${noteColors[setup]}`} role="status">
        {setupNotes[setup]}
      </span>
      <Button size="sm" variant="ghost" onClick={() => setShowingLog(true)}>
        {setup === "running" ? "Output" : "Details"}
      </Button>
      <SetupLogDialog thread={thread} open={showingLog} onOpenChange={setShowingLog} />
    </span>
  )
}
