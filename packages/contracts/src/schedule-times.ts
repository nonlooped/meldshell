import { addDays, addMinutes, getDay, set } from "date-fns"
import type { ScheduleCadence } from "./models"

/*
 * When scheduled prompts run. Daily times are local to this computer, so a schedule set for 09:00
 * stays at 09:00 across daylight saving changes. Runs missed while MeldShell was closed are not
 * repeated: a late schedule runs once, then resumes from the time it actually ran.
 */

/** A one-time prompt may be saved up to this long after its moment and still run at once. */
const ONCE_GRACE_MS = 60_000

function nextDaily(time: string, weekdays: readonly number[], after: Date): Date {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  const allowed = weekdays.length === 0 ? null : new Set(weekdays)
  const at = (days: number) =>
    set(addDays(after, days), { hours, minutes, seconds: 0, milliseconds: 0 })
  // A week always contains an allowed day; the eighth day covers today's time having passed.
  for (let days = 0; days < 8; days++) {
    const candidate = at(days)
    if (candidate > after && (allowed === null || allowed.has(getDay(candidate)))) return candidate
  }
  return at(8)
}

/** The first run of a newly saved or resumed schedule; null when a one-time moment has passed. */
export function firstRun(cadence: ScheduleCadence, now: Date): Date | null {
  switch (cadence.kind) {
    case "once": {
      const at = new Date(cadence.at)
      return at.getTime() < now.getTime() - ONCE_GRACE_MS ? null : at
    }
    case "interval":
      return addMinutes(now, cadence.minutes)
    case "daily":
      return nextDaily(cadence.time, cadence.weekdays, now)
  }
}

/** The run after one that started at `ranAt`; null for a one-time prompt. */
export function followingRun(cadence: ScheduleCadence, ranAt: Date): Date | null {
  switch (cadence.kind) {
    case "once":
      return null
    case "interval":
      return addMinutes(ranAt, cadence.minutes)
    case "daily":
      return nextDaily(cadence.time, cadence.weekdays, ranAt)
  }
}
