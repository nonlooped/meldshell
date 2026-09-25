import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { SaveScheduleInput, ScheduledPrompt } from "@meldshell/contracts"
import { queryKeys } from "../data/cache"

const noSchedules: readonly ScheduledPrompt[] = []

/**
 * Every scheduled prompt, or one thread's when `threadId` is given. Both read one shared listing,
 * so the inbox, a thread, and Settings never ask the host separately.
 */
export function useSchedules(threadId?: string) {
  return useQuery({
    queryKey: queryKeys.schedules,
    queryFn: () => window.meldshell.listSchedules({}),
    select: (schedules: readonly ScheduledPrompt[]) =>
      threadId === undefined
        ? schedules
        : schedules.filter((schedule) => schedule.threadId === threadId),
  })
}

/** Threads with a schedule still to run, for marking them in lists. */
export function useScheduledThreadIds(): ReadonlySet<string> {
  const schedules = useSchedules().data ?? noSchedules
  return new Set(
    schedules
      .filter((schedule) => schedule.nextRunAt !== null)
      .map((schedule) => schedule.threadId),
  )
}

export function useScheduleActions() {
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.schedules })
  const save = useMutation({
    mutationFn: (input: SaveScheduleInput) => window.meldshell.saveSchedule(input),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (scheduleId: string) => window.meldshell.deleteSchedule(scheduleId),
    onSuccess: refresh,
  })
  return { save, remove }
}

/** The current time, updated each minute so relative times stay true. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
