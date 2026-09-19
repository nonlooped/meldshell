export function remainingPercent(usedPercent: number): number {
  return Math.round(Math.min(100, Math.max(0, 100 - usedPercent)) * 10) / 10
}

export function windowLabel(minutes: number | null | undefined, fallback: string): string {
  if (minutes == null || minutes <= 0) return fallback
  if (minutes === 10_080) return "Weekly limit"
  if (minutes % 1_440 === 0) return `${minutes / 1_440}-day limit`
  if (minutes % 60 === 0) return `${minutes / 60}-hour limit`
  return `${minutes}-minute limit`
}

export function resetLabel(seconds: number | null | undefined, now = Date.now()): string {
  if (seconds == null) return "Reset time unavailable"
  const date = new Date(seconds * 1_000)
  if (Number.isNaN(date.getTime())) return "Reset time unavailable"
  if (date.getTime() <= now) return "Reset due. Refresh to check."
  return `Resets ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`
}
