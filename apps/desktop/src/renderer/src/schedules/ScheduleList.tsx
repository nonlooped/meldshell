import { useState } from "react"
import type { ScheduledPrompt } from "@meldshell/contracts"
import { AlarmClock, CirclePause, CirclePlay, Pencil, Trash2 } from "lucide-react"
import { IconButton } from "../ui/controls"
import { describeCadence, describeMoment } from "./schedule-format"
import { useMinuteClock, useScheduleActions } from "./schedule-queries"
import { ScheduleDialog } from "./ScheduleDialog"

function scheduleStatus(schedule: ScheduledPrompt, now: Date): string {
  if (schedule.nextRunAt !== null)
    return `Next ${describeMoment(new Date(schedule.nextRunAt), now)}`
  if (!schedule.enabled && schedule.cadence.kind === "once" && schedule.lastRunAt !== null)
    return `Ran ${describeMoment(new Date(schedule.lastRunAt), now)}`
  return "Paused"
}

function ScheduleRow({
  schedule,
  threadTitle,
  compact,
  onEdit,
}: {
  schedule: ScheduledPrompt
  threadTitle?: string | undefined
  compact: boolean
  onEdit: () => void
}): React.JSX.Element {
  const now = useMinuteClock()
  const { save, remove } = useScheduleActions()
  const finished = schedule.cadence.kind === "once" && schedule.lastRunAt !== null
  const paused = !schedule.enabled
  const toggle = () =>
    save.mutate({
      id: schedule.id,
      threadId: schedule.threadId,
      prompt: schedule.prompt,
      cadence: schedule.cadence,
      enabled: paused,
    })
  const error = save.error?.message ?? remove.error?.message ?? schedule.lastError
  return (
    <li
      className={`flex min-w-0 items-start gap-[10px] ${compact ? "[padding:6px_4px]" : "[padding:12px_0]"} border-b-[1px] border-b-[color:var(--line-subtle)] last:border-b-0`}
    >
      <AlarmClock
        size={14}
        strokeWidth={1.75}
        className={`mt-[2px] flex-none ${paused ? "text-[var(--text-tertiary)]" : "text-[var(--accent)]"}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span
          className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] ${paused ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}
          title={schedule.prompt}
        >
          {schedule.prompt}
        </span>
        <span className="text-[var(--text-tertiary)] text-[11.5px]">
          {threadTitle !== undefined && <>{threadTitle} · </>}
          {describeCadence(schedule.cadence)} · {scheduleStatus(schedule, now)}
        </span>
        {error !== null && (
          <span role="status" className="text-[var(--color-deleted)] text-[11.5px]">
            {schedule.lastError === error ? `Last run could not send: ${error}` : error}
          </span>
        )}
      </div>
      <span className="flex flex-none items-center gap-[2px]">
        {!finished && (
          <IconButton
            label={paused ? "Resume schedule" : "Pause schedule"}
            disabled={save.isPending}
            onClick={toggle}
          >
            {paused ? <CirclePlay size={14} /> : <CirclePause size={14} />}
          </IconButton>
        )}
        <IconButton label="Edit schedule" onClick={onEdit}>
          <Pencil size={13} />
        </IconButton>
        <IconButton
          label="Delete schedule"
          disabled={remove.isPending}
          onClick={() => remove.mutate(schedule.id)}
        >
          <Trash2 size={13} />
        </IconButton>
      </span>
    </li>
  )
}

/** Scheduled prompts with actions to pause, resume, edit, and delete them. */
export function ScheduleList({
  schedules,
  threadTitles,
  compact = false,
}: {
  schedules: readonly ScheduledPrompt[]
  /** Given when the list mixes threads, so each row names its own. */
  threadTitles?: ReadonlyMap<string, string>
  compact?: boolean
}): React.JSX.Element {
  const [editing, setEditing] = useState<ScheduledPrompt | null>(null)
  return (
    <>
      <ul className="m-0 p-0 list-none">
        {schedules.map((schedule) => (
          <ScheduleRow
            key={schedule.id}
            schedule={schedule}
            threadTitle={
              threadTitles?.get(schedule.threadId) ?? (threadTitles ? "Thread" : undefined)
            }
            compact={compact}
            onEdit={() => setEditing(schedule)}
          />
        ))}
      </ul>
      {editing !== null && (
        <ScheduleDialog
          threadId={editing.threadId}
          schedule={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
