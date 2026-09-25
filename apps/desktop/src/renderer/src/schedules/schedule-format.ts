import type { ScheduleCadence } from "@meldshell/contracts"
import { differenceInCalendarDays, format } from "date-fns"

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
})

/** `09:30` as this computer shows times of day. */
function timeOfDay(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  return timeFormat.format(new Date(2000, 0, 1, hours, minutes))
}

function everyMinutes(minutes: number): string {
  if (minutes % 60 !== 0) return `Every ${minutes} minutes`
  const hours = minutes / 60
  if (hours === 1) return "Every hour"
  if (hours % 24 === 0) return hours === 24 ? "Every 24 hours" : `Every ${hours / 24} days`
  return `Every ${hours} hours`
}

function days(weekdays: readonly number[]): string {
  const set = new Set(weekdays)
  if (set.size === 0 || set.size === 7) return "Every day"
  if (set.size === 5 && [1, 2, 3, 4, 5].every((day) => set.has(day))) return "Weekdays"
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends"
  return [...set]
    .sort((left, right) => left - right)
    .map((day) => WEEKDAYS[day])
    .join(", ")
}

/** How often a schedule runs, as in `Weekdays at 9:30 AM` or `Every 2 hours`. */
export function describeCadence(cadence: ScheduleCadence): string {
  switch (cadence.kind) {
    case "once":
      return `Once, ${describeMoment(new Date(cadence.at), new Date())}`
    case "interval":
      return everyMinutes(cadence.minutes)
    case "daily":
      return `${days(cadence.weekdays)} at ${timeOfDay(cadence.time)}`
  }
}

/** A moment relative to `now`: `in 5 minutes`, `today at 2:00 PM`, `tomorrow at 9:30 AM`. */
export function describeMoment(moment: Date, now: Date): string {
  const ahead = moment.getTime() - now.getTime()
  if (ahead >= 0 && ahead < 60_000) return "in less than a minute"
  if (ahead > 0 && ahead < 60 * 60_000) {
    const minutes = Math.round(ahead / 60_000)
    return `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`
  }
  const dayDifference = differenceInCalendarDays(moment, now)
  const time = timeFormat.format(moment)
  if (dayDifference === 0) return `today at ${time}`
  if (dayDifference === 1) return `tomorrow at ${time}`
  if (dayDifference === -1) return `yesterday at ${time}`
  return `${dayFormat.format(moment)} at ${time}`
}

/** A `datetime-local` value for a moment in local time. */
export const localInputValue = (date: Date): string => format(date, "yyyy-MM-dd'T'HH:mm")
