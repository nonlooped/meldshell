/** Compact age such as "now", "5m", "3h", "2d", "4w", or "6mo". */
export const relativeAge = (timestamp: string, now = Date.now()): string => {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000))
  if (elapsedSeconds < 60) return "now"
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}m`
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}h`
  if (elapsedSeconds < 604_800) return `${Math.floor(elapsedSeconds / 86_400)}d`
  if (elapsedSeconds < 2_592_000) return `${Math.floor(elapsedSeconds / 604_800)}w`
  return `${Math.floor(elapsedSeconds / 2_592_000)}mo`
}
