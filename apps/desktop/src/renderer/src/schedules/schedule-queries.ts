import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { SaveScheduleInput } from "@meldshell/contracts"
import { queryKeys } from "../data/cache"

/** Every scheduled prompt, or one thread's when `threadId` is given. */
export function useSchedules(threadId?: string) {
  return useQuery({
    queryKey: [...queryKeys.schedules, threadId ?? "all"],
    queryFn: () => window.meldshell.listSchedules(threadId === undefined ? {} : { threadId }),
  })
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
