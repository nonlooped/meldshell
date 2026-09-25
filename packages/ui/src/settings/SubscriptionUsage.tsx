import { motion } from "motion/react"
import { useMotionPreference } from "../ui/motion"
import { queryKeys } from "../data/cache"
import { useEffect, useState } from "react"
import { Meter } from "@base-ui-components/react/meter"
import { useQueries } from "@tanstack/react-query"
import {
  isHarness,
  type CodexUsage,
  type Harness,
  type Provider,
  type UsageLimit,
} from "@meldshell/contracts"
import { harnessApi, knownHarness } from "../data/providers"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { ProviderIcon } from "../ui/ProviderIcon"
import { Button } from "../ui/controls"
import { Notice } from "../ui/Notice"
import {
  monthlyWindowMins,
  mostConstrained,
  paceSummary,
  leftLabel,
  readUsage,
  resetLabel,
  resetTitle,
  type UsagePace,
  type UsageReading,
  windowLabel,
} from "./usage-format"

export const hasSubscriptionUsage = (provider: Provider): boolean => isHarness(provider.harness)

const SUBSCRIPTIONS: {
  readonly [Key in Harness]: {
    readonly name: string
    readonly account: string
    readonly usageHint: string
  }
} = {
  codex: {
    name: "Codex",
    account: "ChatGPT account in Codex",
    usageHint:
      "Check that Codex is signed in with a subscription account, then try again. Subscription usage may be unavailable for API key accounts.",
  },
  "claude-code": {
    name: "Claude",
    account: "Claude account in Claude Code",
    usageHint:
      "Check that Claude is signed in with a subscription account, then try again. Subscription usage may be unavailable for API key accounts.",
  },
  cursor: {
    name: "Cursor",
    account: "Cursor account in Cursor CLI",
    usageHint:
      "Sign in with Cursor CLI, then refresh. If you are already signed in, Cursor's usage service may be temporarily unavailable.",
  },
}

function subscriptionProvider(provider: string) {
  const harness = knownHarness(provider)
  return { harness, ...SUBSCRIPTIONS[harness], ...harnessApi(harness) }
}

/**
 * The page header's refresh control and the page body read the same queries, so both call this
 * hook and share one cache entry per provider.
 */
function useSubscriptionUsage(providers: ReadonlyArray<Provider>) {
  const metas = providers.map((provider) => subscriptionProvider(provider.harness))
  const statuses = useQueries({
    queries: providers.map((provider, index) => ({
      queryKey: queryKeys.providerStatus(provider.harness),
      queryFn: (metas[index] as ReturnType<typeof subscriptionProvider>).getStatus,
    })),
  })
  const usages = useQueries({
    queries: metas.map((meta, index) => ({
      queryKey: queryKeys.providerUsage(meta.harness),
      queryFn: meta.getUsage,
      enabled: statuses[index]?.data?.availability === "ready",
      refetchInterval: 60_000,
      staleTime: 0,
      retry: false,
    })),
  })
  return providers.map((provider, index) => ({
    provider,
    meta: metas[index] as ReturnType<typeof subscriptionProvider>,
    status: statuses[index] as (typeof statuses)[number],
    usage: usages[index] as (typeof usages)[number],
  }))
}

type ProviderUsage = ReturnType<typeof useSubscriptionUsage>[number]

const isReady = (entry: ProviderUsage): boolean => entry.status.data?.availability === "ready"

const isBusy = (entry: ProviderUsage): boolean =>
  entry.status.isPending || entry.status.data?.availability === "probing" || entry.usage.isFetching

/** One refresh for the page: usage refreshes itself every minute, so this is rarely needed. */
export function SubscriptionUsageRefresh({
  providers,
}: {
  readonly providers: ReadonlyArray<Provider>
}): React.JSX.Element {
  const entries = useSubscriptionUsage(providers)
  const busy = entries.some(isBusy)
  const checked = entries
    .map((entry) => entry.usage.data?.checkedAt)
    .filter((value): value is string => value != null)
    .sort()
    .at(-1)
  return (
    <div className="flex shrink-0 items-center gap-[12px]">
      {checked && (
        <span
          className="text-[var(--text-tertiary)] text-[11.5px] tabular-nums whitespace-nowrap"
          title="Usage refreshes every minute"
        >
          Updated{" "}
          {new Date(checked).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
      )}
      <Button
        size="sm"
        icon={<RefreshCw size={13} aria-hidden="true" />}
        disabled={busy}
        onClick={() => {
          for (const entry of entries) {
            if (isReady(entry)) void entry.usage.refetch()
            else
              void entry.meta
                .refreshStatus()
                .then(() => entry.status.refetch())
                .catch(() => entry.status.refetch())
          }
        }}
      >
        {busy ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  )
}

/** Relative reset times count down, so the page re-renders on its own between refetches. */
function useNow(interval = 30_000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [interval])
  return now
}

const paceTone: Record<UsagePace, string> = {
  ok: "var(--text-primary)",
  fast: "var(--color-modified)",
  low: "var(--color-modified)",
  reached: "var(--color-deleted)",
}

interface UsageRowData {
  readonly key: string
  readonly label: string
  readonly detail?: string
  readonly resetsAt: number | null | undefined
  readonly reading: UsageReading
}

/*
 * Rows share one grid so bars, figures, and reset times align down the whole page, across
 * providers. The bar fills with use over a lighter band for the share of the window that has
 * passed: fill that stays inside the band is on pace, and fill that outruns it turns amber.
 */
function UsageRow({
  row,
  now,
}: {
  readonly row: UsageRowData
  readonly now: number
}): React.JSX.Element {
  const reducedMotion = useMotionPreference()
  const { reading } = row
  const left = leftLabel(reading.used)
  const reset = resetLabel(row.resetsAt, now)
  const flagged = reading.pace !== "ok"
  return (
    <Meter.Root
      className={usageRowClasses}
      value={reading.used}
      aria-label={`${row.label} used`}
      getAriaValueText={() => `${left}% left, ${reset.toLowerCase()}`}
      style={{ "--tone": paceTone[reading.pace] } as React.CSSProperties}
    >
      <span className="flex min-w-0 flex-col">
        <span
          className="overflow-hidden text-[var(--text-primary)] text-[13px] leading-[1.5] text-ellipsis whitespace-nowrap"
          title={row.label}
        >
          {row.label}
        </span>
        {row.detail && (
          <span className="text-[var(--text-tertiary)] text-[11.5px] leading-[1.4] tabular-nums">
            {row.detail}
          </span>
        )}
      </span>
      <span
        className="relative block h-[6px] overflow-hidden rounded-[3px] bg-[var(--line)] [@container(max-width:_540px)]:col-span-2 [@container(max-width:_540px)]:row-start-2"
        title={
          reading.elapsed == null
            ? `${reading.used}% used`
            : `${reading.used}% used · ${Math.round(reading.elapsed)}% of the window elapsed`
        }
      >
        {reading.elapsed != null && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-[3px] bg-[var(--line-strong)]"
            style={{ width: `${reading.elapsed}%` }}
          />
        )}
        <motion.span
          className="absolute inset-y-0 left-0 rounded-[3px] bg-[var(--tone)]"
          initial={reducedMotion ? false : { width: 0 }}
          animate={{ width: `${reading.used}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.2, 0.7, 0.2, 1] }}
        />
      </span>
      <span
        className={`flex items-center justify-end gap-[5px] text-[13px] tabular-nums whitespace-nowrap [@container(max-width:_540px)]:col-start-2 [@container(max-width:_540px)]:row-start-1 ${flagged ? "text-[var(--tone)]" : "text-[var(--text-primary)]"}`}
      >
        {flagged && <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />}
        {left}%<span className={flagged ? "" : "text-[var(--text-tertiary)]"}>left</span>
      </span>
      <span
        className="text-right text-[var(--text-secondary)] text-[12px] tabular-nums whitespace-nowrap [@container(max-width:_540px)]:text-left [@container(max-width:_540px)]:col-span-2 [@container(max-width:_540px)]:row-start-3"
        title={resetTitle(row.resetsAt)}
      >
        {reset}
      </span>
    </Meter.Root>
  )
}

function limitNotice(limit: UsageLimit): string {
  if (limit.spendControlReached || limit.rateLimitReachedType?.includes("usage_limit"))
    return "Your account or workspace usage limit has been reached."
  if (limit.rateLimitReachedType?.includes("credits_depleted"))
    return "Your account or workspace credits are depleted."
  return "Your included usage limit has been reached."
}

const groupName = (id: string, limit: UsageLimit): string =>
  limit.limitName ?? (id === "codex" ? "Codex" : id)

interface UsageGroupData {
  readonly id: string
  readonly heading: string | null
  readonly notice: string | null
  readonly rows: ReadonlyArray<UsageRowData>
}

function usageGroups(limits: CodexUsage["limits"], now: number): ReadonlyArray<UsageGroupData> {
  return limits.map(({ id, limit }) => {
    const name = groupName(id, limit)
    // A lone group is the provider's whole allowance, so its name (often just "Plan limits") adds nothing.
    const showHeading = limits.length > 1
    const windows = [
      ["primary", id === "extra" ? "Monthly" : "Primary", limit.primary] as const,
      ["secondary", "Secondary", limit.secondary] as const,
    ].flatMap(([key, fallback, window]) =>
      window == null ? [] : [[key, fallback, window] as const],
    )
    const monthly = limit.individualLimit
    // A group with a single allowance is the allowance: the group name labels the row directly
    // rather than sitting above it as a heading for one line.
    const single = showHeading && windows.length + (monthly ? 1 : 0) === 1
    const label = (windowName: string) =>
      single ? (windowName === name ? name : `${name} · ${windowName}`) : windowName
    const rows: UsageRowData[] = windows.map(([key, fallback, window]) => ({
      key,
      label: label(window.label ?? windowLabel(window.windowDurationMins, fallback)),
      resetsAt: window.resetsAt,
      reading: readUsage(window.usedPercent, window.resetsAt, window.windowDurationMins, now),
    }))
    if (monthly)
      rows.push({
        key: "monthly",
        label: label("Monthly credits"),
        detail: `${monthly.used} / ${monthly.limit} used`,
        resetsAt: monthly.resetsAt,
        reading: readUsage(
          100 - monthly.remainingPercent,
          monthly.resetsAt,
          monthlyWindowMins(monthly.resetsAt),
          now,
        ),
      })
    return {
      id,
      heading: showHeading && !single ? name : null,
      notice: limit.spendControlReached || limit.rateLimitReachedType ? limitNotice(limit) : null,
      rows,
    }
  })
}

function PaceStatus({
  groups,
  now,
}: {
  readonly groups: ReadonlyArray<UsageGroupData>
  readonly now: number
}): React.JSX.Element | null {
  const worst = mostConstrained(groups.flatMap((group) => group.rows))
  // All-clear is the norm, so only a problem earns a line in the header.
  if (worst == null || worst.reading.pace === "ok") return null
  const { pace } = worst.reading
  return (
    <span
      className="flex min-w-0 items-center gap-[6px] text-[12px] leading-[1.5] text-[var(--tone)] [&_svg]:shrink-0"
      style={{ "--tone": paceTone[pace] } as React.CSSProperties}
    >
      <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {paceSummary(worst.label, worst.reading, now)}
      </span>
    </span>
  )
}

function ProviderSection({
  entry,
  now,
}: {
  readonly entry: ProviderUsage
  readonly now: number
}): React.JSX.Element {
  const { provider, meta, usage } = entry
  const { name, usageHint } = meta
  const ready = isReady(entry)
  const limits = usage.data?.limits ?? []
  // One plan covers the whole account when every allowance agrees, so it belongs to the header.
  const plans = new Set(
    limits
      .map(({ limit }) => limit.planType?.replaceAll("_", " ").toLowerCase())
      .filter((plan): plan is string => Boolean(plan) && plan !== "unknown"),
  )
  const accountPlan = plans.size === 1 ? [...plans][0] : null
  const groups = usageGroups(limits, now)
  return (
    <section className={cardClasses} aria-label={`${name} subscription usage`}>
      <header className="flex items-center justify-between gap-[16px] pb-[10px] [@container(max-width:_540px)]:flex-wrap [@container(max-width:_540px)]:gap-[6px]">
        <div className="flex min-w-0 items-center gap-[10px]">
          <span className="flex shrink-0 text-[var(--text-primary)]" aria-hidden="true">
            <ProviderIcon provider={provider} size={16} />
          </span>
          <h3 className="m-0 [font-family:var(--font-display)] text-[var(--text-primary)] text-[15px] font-semibold tracking-[-0.01em] leading-[1.3]">
            {name}
          </h3>
          {accountPlan && (
            <span className="text-[var(--text-secondary)] text-[12px] leading-[1.5] whitespace-nowrap">
              {accountPlan.charAt(0).toUpperCase()}
              {accountPlan.slice(1)} plan
            </span>
          )}
        </div>
        {ready && <PaceStatus groups={groups} now={now} />}
      </header>

      <div className="flex flex-col gap-[6px] pl-[26px] [@container(max-width:_540px)]:pl-0">
        {!ready ? (
          <p className={quietLineClasses}>Connecting to {name}…</p>
        ) : (
          <>
            {usage.isError && (
              <Notice
                tone="warning"
                title={
                  usage.data
                    ? "Could not refresh usage. Showing the last update."
                    : "Could not load subscription usage"
                }
                message={usageHint}
              />
            )}
            {usage.isPending && <p className={quietLineClasses}>Loading usage…</p>}
            {usage.data && limits.length === 0 && (
              <p className={quietLineClasses}>
                No subscription limits were reported for this account.
              </p>
            )}
            {groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-[4px]">
                {group.heading && (
                  <h4 className="m-0 pt-[6px] text-[var(--text-tertiary)] text-[11.5px] font-medium leading-[1.4] [overflow-wrap:anywhere]">
                    {group.heading}
                  </h4>
                )}
                {group.notice && <Notice title={group.notice} className="my-[4px]" />}
                {group.rows.length === 0 ? (
                  <p className={quietLineClasses}>
                    No usage windows were reported for this allowance.
                  </p>
                ) : (
                  group.rows.map((row) => <UsageRow key={row.key} row={row} now={now} />)
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}

function connectionMessage(
  name: string,
  account: string,
  unavailable: string | undefined,
  detail: string | undefined,
): string {
  if (unavailable === "unauthenticated") return `Sign in with your ${account}, then refresh.`
  if (unavailable === "missing") return detail ?? `${name} is not installed.`
  return detail ?? `Could not connect to ${name}. Try refreshing.`
}

/** Explains the bar's two layers once for the whole page. */
function UsageLegend(): React.JSX.Element {
  return (
    <p className="flex flex-wrap items-center gap-x-[16px] gap-y-[4px] m-0 [padding:2px_2px_0] text-[var(--text-tertiary)] text-[11.5px] leading-[1.5]">
      <span className="inline-flex items-center gap-[6px]">
        <span
          aria-hidden="true"
          className="w-[14px] h-[6px] rounded-[3px] bg-[var(--text-primary)]"
        />
        Used
      </span>
      <span className="inline-flex items-center gap-[6px]">
        <span
          aria-hidden="true"
          className="w-[14px] h-[6px] rounded-[3px] bg-[var(--line-strong)]"
        />
        Time elapsed in the window
      </span>
      <span className="inline-flex items-center gap-[6px]">
        <span
          aria-hidden="true"
          className="w-[14px] h-[6px] rounded-[3px] bg-[var(--color-modified)]"
        />
        Used faster than time elapsed
      </span>
    </p>
  )
}

/** Providers that cannot report usage collapse to one line each, below the ones that can. */
function DisconnectedProviders({
  entries,
}: {
  readonly entries: ReadonlyArray<ProviderUsage>
}): React.JSX.Element {
  return (
    <section className="[padding:10px_2px_0]" aria-label="Providers not connected">
      <h3 className="m-0 pb-[8px] text-[var(--text-tertiary)] text-[11.5px] font-medium leading-[1.4]">
        Not connected
      </h3>
      <ul className="m-0 p-0 list-none flex flex-col">
        {entries.map(({ provider, meta, status }) => (
          <li
            key={provider.id}
            className="flex min-w-0 items-baseline gap-[10px] py-[6px] text-[12px] leading-[1.5]"
          >
            <span
              className="flex shrink-0 self-center text-[var(--text-secondary)]"
              aria-hidden="true"
            >
              <ProviderIcon provider={provider} size={14} />
            </span>
            <span className="shrink-0 text-[var(--text-primary)] text-[13px]">{meta.name}</span>
            <span className="min-w-0 text-[var(--text-secondary)] [overflow-wrap:anywhere]">
              {connectionMessage(
                meta.name,
                meta.account,
                status.data?.availability,
                status.data?.detail,
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SubscriptionUsage({
  providers,
}: {
  readonly providers: ReadonlyArray<Provider>
}): React.JSX.Element {
  const entries = useSubscriptionUsage(providers)
  const now = useNow()
  // Pending and probing providers stay in place so a provider that connects does not jump.
  const disconnected = entries.filter((entry) => !isReady(entry) && !isBusy(entry))
  const connected = entries.filter((entry) => !disconnected.includes(entry))
  return (
    <div className="flex flex-col gap-[12px]">
      {connected.map((entry) => (
        <ProviderSection key={entry.provider.id} entry={entry} now={now} />
      ))}
      {connected.some(isReady) && <UsageLegend />}
      {disconnected.length > 0 && <DisconnectedProviders entries={disconnected} />}
    </div>
  )
}

const cardClasses =
  "[padding:14px_18px_12px] border-[1px] border-[color:var(--line)] rounded-[var(--radius-lg)] bg-[var(--surface-raised)]"

const quietLineClasses = "m-0 py-[6px] text-[var(--text-secondary)] text-[12px] leading-[1.6]"

const usageRowClasses = [
  "grid grid-cols-[minmax(0,_148px)_minmax(80px,_1fr)_76px_136px] items-center gap-x-[18px] py-[7px]",
  "[@container(max-width:_540px)]:grid-cols-[minmax(0,_1fr)_auto] [@container(max-width:_540px)]:gap-y-[6px]",
].join(" ")
