const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function remainingPercent(usedPercent: number): number {
  return Math.round(Math.min(100, Math.max(0, 100 - usedPercent)) * 10) / 10
}

/**
 * Whole percentages, rounded down so the page never promises more than remains; a sliver above
 * zero reads "<1" rather than a misleading 0.
 */
export function leftLabel(used: number): string {
  const left = remainingPercent(used)
  return left > 0 && left < 1 ? "<1" : String(Math.floor(left))
}

/** Short window names read as column labels, so "limit" is left implied. */
export function windowLabel(minutes: number | null | undefined, fallback: string): string {
  if (minutes == null || minutes <= 0) return fallback
  if (minutes === 10_080) return "Weekly"
  if (minutes % 1_440 === 0) return `${minutes / 1_440}-day`
  if (minutes % 60 === 0) return `${minutes / 60}-hour`
  return `${minutes}-minute`
}

/** Compact span such as "2h 14m" or "1d 4h", truncated toward zero. */
export function durationLabel(ms: number): string {
  if (ms < MINUTE) return "<1m"
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / MINUTE)
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

const resetDate = (seconds: number | null | undefined): Date | null => {
  if (seconds == null) return null
  const date = new Date(seconds * 1_000)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Near resets read as a countdown, which is what the operator plans around; later ones name the
 * day, since counting days and hours is harder than reading "Thu 9:00 AM".
 */
export function resetLabel(seconds: number | null | undefined, now = Date.now()): string {
  const date = resetDate(seconds)
  if (date == null) return "Reset time unknown"
  const until = date.getTime() - now
  if (until <= 0) return "Reset due"
  if (until < DAY) return `Resets in ${durationLabel(until)}`
  if (until < 6 * DAY)
    return `Resets ${date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`
  return `Resets ${date.toLocaleString(undefined, { month: "short", day: "numeric" })}`
}

export function resetTitle(seconds: number | null | undefined): string | undefined {
  return resetDate(seconds)?.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Monthly allowances report no duration; they span the calendar month ending at the reset. */
export function monthlyWindowMins(resetsAt: number): number {
  const end = new Date(resetsAt * 1_000)
  const start = new Date(end)
  start.setMonth(start.getMonth() - 1)
  return (end.getTime() - start.getTime()) / MINUTE
}

export type UsagePace = "ok" | "fast" | "low" | "reached"

export interface UsageReading {
  /** Share of the allowance used, 0–100. */
  readonly used: number
  /** Share of the window elapsed, 0–100, when the window's span is known. */
  readonly elapsed: number | null
  readonly pace: UsagePace
  /** When the allowance runs out at the window's average rate so far, if before the reset. */
  readonly runsOutAt: number | null
}

/** Usage must lead elapsed time by this many points before the pace counts as fast. */
const FAST_MARGIN = 15
const LOW_REMAINING = 10

export function readUsage(
  usedPercent: number,
  resetsAt: number | null | undefined,
  windowMins: number | null | undefined,
  now = Date.now(),
): UsageReading {
  const used = Math.round((100 - remainingPercent(usedPercent)) * 10) / 10
  const reset = resetsAt == null ? null : resetsAt * 1_000
  const span = windowMins == null || windowMins <= 0 ? null : windowMins * MINUTE
  const start = reset == null || span == null ? null : reset - span
  const elapsed =
    reset == null || start == null || now >= reset
      ? null
      : Math.min(100, Math.max(0, ((now - start) / (span as number)) * 100))
  let runsOutAt: number | null = null
  if (start != null && reset != null && used > 0 && used < 100 && now > start) {
    const projected = now + ((100 - used) / used) * (now - start)
    if (projected < reset) runsOutAt = projected
  }
  const pace: UsagePace =
    used >= 100
      ? "reached"
      : 100 - used <= LOW_REMAINING
        ? "low"
        : elapsed != null && used - elapsed >= FAST_MARGIN
          ? "fast"
          : "ok"
  return { used, elapsed, pace, runsOutAt }
}

const severity: Record<UsagePace, number> = { ok: 0, fast: 1, low: 2, reached: 3 }

/** The allowance that most constrains work: the worst pace, then the least remaining. */
export function mostConstrained<T extends { readonly reading: UsageReading }>(
  rows: ReadonlyArray<T>,
): T | undefined {
  return rows.reduce<T | undefined>((worst, row) => {
    if (worst == null) return row
    const delta = severity[row.reading.pace] - severity[worst.reading.pace]
    if (delta !== 0) return delta > 0 ? row : worst
    return row.reading.used > worst.reading.used ? row : worst
  }, undefined)
}

export function paceSummary(label: string, reading: UsageReading, now = Date.now()): string {
  if (reading.pace === "reached") return `${label} limit reached`
  if (reading.pace === "low") return `${label}: ${leftLabel(reading.used)}% left`
  if (reading.pace === "fast")
    return reading.runsOutAt == null
      ? `${label} running fast`
      : `${label} runs out in ~${durationLabel(reading.runsOutAt - now)}`
  return "On track"
}
