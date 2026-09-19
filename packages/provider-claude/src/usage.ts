import type { SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk"
import type { CodexUsage, UsageLimit, UsageWindow } from "@meldshell/contracts"

type Window = { utilization: number | null; resets_at: string | null }

const usageWindow = (value: Window | null | undefined, minutes?: number): UsageWindow | null => {
  if (value?.utilization == null || !Number.isFinite(value.utilization)) return null
  const reset = value.resets_at ? Date.parse(value.resets_at) / 1000 : NaN
  return {
    usedPercent: Math.max(0, Math.min(100, value.utilization)),
    windowDurationMins: minutes ?? null,
    resetsAt: Number.isFinite(reset) ? reset : null,
  }
}

export const claudeUsage = (response: SDKControlGetUsageResponse): CodexUsage => {
  const rates = response.rate_limits_available ? response.rate_limits : null
  const limits: Array<{ id: string; limit: UsageLimit }> = []
  const primary = usageWindow(rates?.five_hour, 300)
  const secondary = usageWindow(rates?.seven_day, 10080)
  if (primary || secondary)
    limits.push({
      id: "claude",
      limit: { limitName: "Plan limits", planType: response.subscription_type, primary, secondary },
    })
  const add = (id: string, name: string, value: Window | null | undefined): void => {
    const window = usageWindow(value, 10080)
    if (window) limits.push({ id, limit: { limitName: name, primary: window } })
  }
  add("opus", "Opus", rates?.seven_day_opus)
  add("sonnet", "Sonnet", rates?.seven_day_sonnet)
  add("oauth-apps", "Connected apps", rates?.seven_day_oauth_apps)
  rates?.model_scoped?.forEach((value, index) => add(`model-${index}`, value.display_name, value))
  const extra = rates?.extra_usage
  const extraWindow = extra?.is_enabled
    ? usageWindow({ utilization: extra.utilization, resets_at: null })
    : null
  if (extraWindow)
    limits.push({ id: "extra", limit: { limitName: "Usage credits", primary: extraWindow } })
  return { checkedAt: new Date().toISOString(), limits, resetCredits: null }
}
