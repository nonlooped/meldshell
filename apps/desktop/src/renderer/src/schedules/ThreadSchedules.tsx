import { ScheduleList } from "./ScheduleList"
import { useSchedules } from "./schedule-queries"

/** The thread's scheduled prompts, above its composer; nothing while it has none. */
export function ThreadSchedules({ threadId }: { threadId: string }): React.JSX.Element | null {
  const schedules = useSchedules(threadId).data ?? []
  if (schedules.length === 0) return null
  return (
    <section
      aria-label="Scheduled prompts"
      className="w-full max-w-[860px] [margin:0_auto_8px] [padding:2px_10px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)]"
    >
      <ScheduleList schedules={schedules} compact />
    </section>
  )
}
