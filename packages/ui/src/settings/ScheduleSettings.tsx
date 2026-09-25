import type { AppSnapshot, ScheduledPrompt } from "@meldshell/contracts"
import { AlarmClock, ArrowUpRight } from "lucide-react"
import { useTabStore } from "../app/tab-store"
import { useViewStore } from "../app/view-store"
import { Button } from "../ui/controls"
import { ScheduleList } from "../schedules/ScheduleList"
import { useSchedules } from "../schedules/schedule-queries"

/** Every scheduled prompt, grouped by thread; the thread with the soonest run comes first. */
export function ScheduleSettings({ snapshot }: { snapshot: AppSnapshot }): React.JSX.Element {
  const query = useSchedules()
  const closeSettings = useViewStore((state) => state.closeSettings)
  const openThread = useTabStore((state) => state.openThread)
  const schedules = query.data ?? []
  const titles = new Map(snapshot.threads.map((thread) => [thread.id, thread.title]))
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
      <div className="flex flex-col items-center gap-[10px] [padding:40px_0] text-center">
        <AlarmClock size={20} strokeWidth={1.5} className="text-[var(--text-tertiary)]" />
        <p className="m-0 max-w-[360px] text-[var(--text-secondary)] text-[12.5px] leading-[1.6]">
          No prompts are scheduled. Write a prompt in a thread, then choose the alarm clock beside
          the attachment button to send it later or on repeat.
        </p>
      </div>
    )
  // The listing comes soonest first, so each thread's first appearance orders the groups.
  const groups = new Map<string, ScheduledPrompt[]>()
  for (const schedule of schedules)
    groups.set(schedule.threadId, [...(groups.get(schedule.threadId) ?? []), schedule])
  return (
    <div className="flex flex-col gap-[22px]">
      {[...groups].map(([threadId, threadSchedules]) => (
        <section key={threadId} aria-label={titles.get(threadId) ?? "Thread"}>
          <div className="flex min-w-0 items-center justify-between gap-[12px] [padding:0_0_4px] border-b-[1px] border-b-[color:var(--line-subtle)]">
            <h3 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-secondary)] text-[12px] font-medium">
              {titles.get(threadId) ?? "Thread"}
            </h3>
            {titles.has(threadId) && (
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowUpRight size={13} />}
                onClick={() => {
                  closeSettings()
                  openThread(threadId)
                }}
              >
                Open thread
              </Button>
            )}
          </div>
          <ScheduleList schedules={threadSchedules} />
        </section>
      ))}
    </div>
  )
}
