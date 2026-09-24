import type { AppSnapshot } from "@meldshell/contracts"
import { ScheduleList } from "../schedules/ScheduleList"
import { useSchedules } from "../schedules/schedule-queries"

/** Every scheduled prompt across threads, soonest first. */
export function ScheduleSettings({ snapshot }: { snapshot: AppSnapshot }): React.JSX.Element {
  const query = useSchedules()
  const schedules = query.data ?? []
  const threadTitles = new Map(snapshot.threads.map((thread) => [thread.id, thread.title]))
  if (query.isPending)
    return <p className="text-[var(--text-tertiary)] text-[12.5px]">Loading schedules…</p>
  if (query.isError)
    return (
      <p role="alert" className="text-[var(--color-deleted)] text-[12.5px]">
        {query.error.message}
      </p>
    )
  if (schedules.length === 0)
    return (
      <p className="settings-empty [padding:28px_0] text-[var(--text-tertiary)] text-[12.5px] text-center">
        No prompts are scheduled. Use the alarm clock in a thread's composer to schedule one.
      </p>
    )
  return (
    <section className="max-w-[720px] border-t-[1px] border-t-[color:var(--line-subtle)]">
      <ScheduleList schedules={schedules} threadTitles={threadTitles} />
    </section>
  )
}
