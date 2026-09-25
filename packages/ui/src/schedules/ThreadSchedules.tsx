import { useState } from "react"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { AlarmClock, ChevronDown, CircleAlert } from "lucide-react"
import { CollapsiblePanel } from "../ui/motion"
import { describeMoment } from "./schedule-format"
import { ScheduleList, scheduleFinished, scheduleStatus } from "./ScheduleList"
import { useMinuteClock, useSchedules } from "./schedule-queries"

/**
 * The thread's scheduled prompts, folded into one line above its composer that opens into the full
 * list. One-time prompts that were sent leave the thread; Settings still lists them. Shows nothing
 * while the thread has none.
 */
export function ThreadSchedules({ threadId }: { threadId: string }): React.JSX.Element | null {
  const now = useMinuteClock()
  const [open, setOpen] = useState(false)
  const schedules = (useSchedules(threadId).data ?? []).filter(
    (schedule) => !scheduleFinished(schedule) || schedule.lastError !== null,
  )
  if (schedules.length === 0) return null
  const failing = schedules.some((schedule) => schedule.lastError !== null)
  const next = schedules.find((schedule) => schedule.nextRunAt !== null)
  const only = schedules.length === 1 ? schedules[0] : undefined
  const summary =
    only !== undefined
      ? scheduleStatus(only, now)
      : next?.nextRunAt != null
        ? `next ${describeMoment(new Date(next.nextRunAt), now)}`
        : "all paused"
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label="Scheduled prompts" />}
      className="w-full max-w-[860px] [margin:0_auto_6px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-hover)]"
    >
      <Collapsible.Trigger className="motion-colors flex w-full min-w-0 items-center gap-[8px] h-[30px] [padding:0_10px] border-0 bg-transparent text-left text-[var(--text-secondary)] text-[12px] cursor-default rounded-[var(--radius-lg)] [&:hover]:text-[var(--text-primary)] [&_.chevron]:motion-transform [&[data-panel-open]_.chevron]:[transform:rotate(180deg)]">
        {failing ? (
          <CircleAlert
            size={13}
            strokeWidth={1.75}
            className="flex-none text-[var(--color-deleted)]"
          />
        ) : (
          <AlarmClock size={13} strokeWidth={1.75} className="flex-none text-[var(--accent)]" />
        )}
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {only !== undefined ? (
            <span className="text-[var(--text-primary)]">{only.prompt}</span>
          ) : (
            <span className="text-[var(--text-primary)]">{schedules.length} scheduled prompts</span>
          )}
          <span className="text-[var(--text-tertiary)]"> · {summary}</span>
        </span>
        <ChevronDown
          size={13}
          className="chevron flex-none text-[var(--text-tertiary)]"
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <CollapsiblePanel className="border-t-[1px] border-t-[color:var(--line-subtle)] [padding:0_4px_0_2px]">
        <ScheduleList schedules={schedules} compact />
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}
