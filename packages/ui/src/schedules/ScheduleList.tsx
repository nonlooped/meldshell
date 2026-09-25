import { useState } from "react"
import type { ScheduledPrompt } from "@meldshell/contracts"
import { AlarmClock, CircleAlert, CirclePause, CirclePlay, Pencil, Trash2 } from "lucide-react"
import { IconButton } from "../ui/controls"
import { describeCadence, describeMoment } from "./schedule-format"
import { useMinuteClock, useScheduleActions } from "./schedule-queries"
import { ScheduleDialog } from "./ScheduleDialog"

/** A one-time prompt that has already been sent. */
export const scheduleFinished = (schedule: ScheduledPrompt): boolean =>
  schedule.cadence.kind === "once" && schedule.lastRunAt !== null

export function scheduleStatus(schedule: ScheduledPrompt, now: Date): string {
  if (schedule.nextRunAt !== null)
    return `next ${describeMoment(new Date(schedule.nextRunAt), now)}`
  if (scheduleFinished(schedule) && schedule.lastRunAt !== null)
    return `sent ${describeMoment(new Date(schedule.lastRunAt), now)}`
  return "paused"
}

function ScheduleRow({
  schedule,
  compact,
  onEdit,
}: {
  schedule: ScheduledPrompt
  compact: boolean
  onEdit: () => void
}): React.JSX.Element {
  const now = useMinuteClock()
  const { save, remove } = useScheduleActions()
  const finished = scheduleFinished(schedule)
  const paused = !schedule.enabled && !finished
  const toggle = () =>
    save.mutate({
      id: schedule.id,
      threadId: schedule.threadId,
      prompt: schedule.prompt,
      cadence: schedule.cadence,
      enabled: paused,
    })
  const actionError = save.error?.message ?? remove.error?.message ?? null
  const dim = paused || finished
  return (
    <li
      className={`group/schedule flex min-w-0 items-start gap-[10px] ${
        compact ? "[padding:7px_4px_7px_8px]" : "[padding:11px_4px_11px_0]"
      } border-b-[1px] border-b-[color:var(--line-subtle)] last:border-b-0`}
      data-paused={paused ? "" : undefined}
    >
      <span
        className={`mt-[2px] flex-none ${
          schedule.lastError !== null
            ? "text-[var(--color-deleted)]"
            : dim
              ? "text-[var(--text-tertiary)]"
              : "text-[var(--accent)]"
        }`}
        aria-hidden="true"
      >
        {schedule.lastError !== null ? (
          <CircleAlert size={14} strokeWidth={1.75} />
        ) : paused ? (
          <CirclePause size={14} strokeWidth={1.75} />
        ) : (
          <AlarmClock size={14} strokeWidth={1.75} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span
          className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] ${
            dim ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"
          }`}
          title={schedule.prompt}
        >
          {schedule.prompt}
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)] text-[11.5px]">
          {describeCadence(schedule.cadence)}
          <span aria-hidden="true"> · </span>
          <span className={paused ? "text-[var(--color-modified)]" : ""}>
            {scheduleStatus(schedule, now)}
          </span>
        </span>
        {schedule.lastError !== null && (
          <span className="text-[var(--color-deleted)] text-[11.5px] [overflow-wrap:anywhere]">
            The last run could not be sent: {schedule.lastError}
          </span>
        )}
        {actionError !== null && (
          <span role="alert" className="text-[var(--color-deleted)] text-[11.5px]">
            {actionError}
          </span>
        )}
      </div>
      <span
        className={`flex flex-none items-center gap-[2px] ${
          compact
            ? "opacity-[0] motion-colors group-hover/schedule:opacity-[1] group-focus-within/schedule:opacity-[1] [@media(hover:_none)]:opacity-[1]"
            : ""
        }`}
      >
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
  compact = false,
}: {
  schedules: readonly ScheduledPrompt[]
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
