import type { ScheduleCadence } from "@meldshell/contracts"

/*
 * When scheduled prompts run. Daily times are local to this computer, so a schedule set for 09:00
 * stays at 09:00 across daylight saving changes. Runs missed while MeldShell was closed are not
 * repeated: a late schedule runs once, then resumes from the time it actually ran.
 */

const MINUTE = 60_000

/** A one-time prompt may be saved up to this long after its moment and still run at once. */
const ONCE_GRACE = MINUTE

function nextDaily(time: string, weekdays: readonly number[], after: Date): Date {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  const allowed = weekdays.length === 0 ? null : new Set(weekdays)
  const candidate = new Date(after)
  candidate.setHours(hours, minutes, 0, 0)
  // A week always contains an allowed day; the eighth step covers today's time having passed.
  for (let step = 0; step < 8; step++) {
    if (candidate > after && (allowed === null || allowed.has(candidate.getDay()))) return candidate
    candidate.setDate(candidate.getDate() + 1)
    candidate.setHours(hours, minutes, 0, 0)
  }
  return candidate
}

/** The first run of a newly saved or resumed schedule; null when a one-time moment has passed. */
export function firstRun(cadence: ScheduleCadence, now: Date): Date | null {
  switch (cadence.kind) {
    case "once": {
      const at = new Date(cadence.at)
      return at.getTime() < now.getTime() - ONCE_GRACE ? null : at
    }
    case "interval":
      return new Date(now.getTime() + cadence.minutes * MINUTE)
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
      return new Date(ranAt.getTime() + cadence.minutes * MINUTE)
    case "daily":
      return nextDaily(cadence.time, cadence.weekdays, ranAt)
  }
}
