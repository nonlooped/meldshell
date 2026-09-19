import { motion } from "motion/react"
import { useMotionPreference } from "../ui/motion"
import { queryKeys } from "../data/cache"
import { useState } from "react"
import { Meter } from "@base-ui-components/react/meter"
import { Toggle } from "@base-ui-components/react/toggle"
import { useQuery } from "@tanstack/react-query"
import type { Provider, ProviderStatus, UsageLimit, UsageWindow } from "@meldshell/contracts"
import { AlertCircle, Eye, EyeOff, RefreshCw } from "lucide-react"
import { ProviderIcon } from "../ui/ProviderIcon"
import { Button } from "../ui/controls"
import { remainingPercent, resetLabel, windowLabel } from "./usage-format"

function subscriptionProvider(harness: string) {
  if (harness === "cursor")
    return {
      key: "cursor",
      name: "Cursor",
      account: "Cursor account in Cursor CLI",
      accountLabel: "Cursor account",
      getStatus: () => window.meldshell.getCursorStatus(),
      refreshStatus: () => window.meldshell.refreshCursorStatus(),
      getUsage: () => window.meldshell.getCursorUsage(),
      usageHint:
        "Sign in with Cursor CLI, then refresh. If you are already signed in, Cursor's usage service may be temporarily unavailable.",
    }
  if (harness === "claude-code")
    return {
      key: "claude",
      name: "Claude",
      account: "Claude account in Claude Code",
      accountLabel: "Claude account",
      getStatus: () => window.meldshell.getClaudeStatus(),
      refreshStatus: () => window.meldshell.refreshClaudeStatus(),
      getUsage: () => window.meldshell.getClaudeUsage(),
      usageHint:
        "Check that Claude is signed in with a subscription account, then try again. Subscription usage may be unavailable for API key accounts.",
    }
  return {
    key: "codex",
    name: "Codex",
    account: "ChatGPT account in Codex",
    accountLabel: "ChatGPT account",
    getStatus: () => window.meldshell.getCodexStatus(),
    refreshStatus: () => window.meldshell.refreshCodexStatus(),
    getUsage: () => window.meldshell.getCodexUsage(),
    usageHint:
      "Check that Codex is signed in with a subscription account, then try again. Subscription usage may be unavailable for API key accounts.",
  }
}

/**
 * Settings is often on screen while a window is shared, so the address stays obscured until the
 * operator asks for it. The blur is a readability guard, not a secret: the value is display-only.
 */
function AccountEmail({
  email,
  name,
}: {
  readonly email: string
  readonly name: string
}): React.JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const label = revealed ? `Hide the ${name} account email` : `Reveal the ${name} account email`
  return (
    <Toggle
      className="flex min-w-0 items-center gap-[6px] p-0 border-0 [background:none] text-[var(--text-secondary)] [font:inherit] text-[12px] cursor-pointer [&[data-revealed]_.usage-account-email]:[filter:none] [&_svg]:shrink-0 [&_svg]:text-[var(--text-tertiary)] [&:hover]:text-[var(--text-primary)] [&:hover_svg]:text-[var(--text-primary)]"
      title={label}
      aria-label={label}
      pressed={revealed}
      {...(revealed ? { "data-revealed": "" } : {})}
      onPressedChange={setRevealed}
    >
      <span
        data-motion="filter"
        className="usage-account-email overflow-hidden [font-family:var(--font-mono)] text-[11.5px] text-ellipsis whitespace-nowrap [filter:blur(4.5px)] select-none"
      >
        {email}
      </span>
      {revealed ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
    </Toggle>
  )
}

/*
 * The remaining figure is what the page exists to show, so it leads every row in one aligned
 * column: the eye lands on the numbers first and compares them down the page, then reads the
 * allowance name, its bar, and its reset time beside each.
 */
function UsageRow({
  label,
  detail,
  remaining,
  resetsAt,
}: {
  readonly label: string
  readonly detail?: string
  readonly remaining: number
  readonly resetsAt?: number | null
}): React.JSX.Element {
  const reducedMotion = useMotionPreference()
  const low = remaining <= 10
  return (
    <Meter.Root
      className={usageRowClasses}
      value={remaining}
      aria-label={`${label} remaining`}
      {...(low ? { "data-low": "" } : {})}
    >
      <span className="flex w-[84px] flex-[0_0_84px] flex-col gap-[2px] pt-[1px] [@container(max-width:_540px)]:w-auto [@container(max-width:_540px)]:basis-[auto]">
        <span className="[font-family:var(--font-display)] text-[var(--text-primary)] text-[24px] font-semibold tabular-nums tracking-[-0.03em] leading-[1] [[data-low]_&]:text-[var(--color-modified)]">
          {remaining}
          <span className="ml-[1px] text-[14px] font-medium text-[var(--text-tertiary)] [[data-low]_&]:text-inherit">
            %
          </span>
        </span>
        <span className="text-[var(--text-tertiary)] text-[11px] leading-[1.4]">
          {low ? (remaining === 0 ? "limit reached" : "running low") : "remaining"}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[8px]">
        <span className="text-[var(--text-primary)] text-[13px] font-medium leading-[1.4]">
          {label}
        </span>
        <span className="relative block h-[5px] w-full overflow-hidden rounded-[3px] bg-[var(--surface-active)]">
          <motion.span
            className="absolute inset-y-0 left-0 rounded-[3px] bg-[var(--text-primary)] [[data-low]_&]:bg-[var(--color-modified)]"
            initial={reducedMotion ? false : { width: 0 }}
            animate={{ width: `${remaining}%` }}
            transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          />
        </span>
        <span className="text-[var(--text-secondary)] text-[12px] leading-[1.5]">
          {resetLabel(resetsAt)}
          {detail && ` · ${detail}`}
        </span>
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

function GroupHeading({ children }: { readonly children: string }): React.JSX.Element {
  return (
    <h4 className="m-0 [padding:26px_0_2px] [&:first-child]:pt-[4px] text-[var(--text-secondary)] text-[12px] font-semibold leading-[1.4] [overflow-wrap:anywhere] [.usage-row_+_&]:mt-[6px] [.usage-row_+_&]:border-t-[1px] [.usage-row_+_&]:border-t-[color:var(--line-subtle)]">
      {children}
    </h4>
  )
}

function UsageGroup({
  id,
  limit,
  showHeading,
}: {
  readonly id: string
  readonly limit: UsageLimit
  readonly showHeading: boolean
}): React.JSX.Element {
  const name = groupName(id, limit)
  const windows: ReadonlyArray<readonly [string, string, UsageWindow]> = [
    ["primary", id === "extra" ? "Monthly limit" : "Primary limit", limit.primary] as const,
    ["secondary", "Secondary limit", limit.secondary] as const,
  ].flatMap(([key, fallback, window]) => (window == null ? [] : [[key, fallback, window] as const]))
  const monthly = limit.individualLimit
  const rowCount = windows.length + (monthly ? 1 : 0)
  // A group with a single allowance is the allowance: the group name labels the row directly and
  // the window's own name moves into the description, so one number never gets two headings.
  const single = rowCount === 1 && showHeading
  const reached = limit.spendControlReached || limit.rateLimitReachedType
  // Rows, headings, and notices are direct siblings of the body so hairlines follow the sequence.
  return (
    <>
      {showHeading && !single && <GroupHeading>{name}</GroupHeading>}
      {reached && (
        <p className="flex items-center gap-[8px] [margin:12px_0_4px] text-[var(--text-secondary)] text-[12px] leading-[1.5] [&_svg]:shrink-0 [&_svg]:text-[var(--color-modified)]">
          <AlertCircle size={13} aria-hidden="true" />
          {limitNotice(limit)}
        </p>
      )}
      {rowCount === 0 ? (
        <p className="[margin:12px_0] text-[var(--text-secondary)] text-[12px] leading-[1.6]">
          No usage windows were reported for this allowance.
        </p>
      ) : (
        <>
          {windows.map(([key, fallback, window]) => {
            const windowName = window.label ?? windowLabel(window.windowDurationMins, fallback)
            return (
              <UsageRow
                key={key}
                label={single ? name : windowName}
                {...(single && windowName !== name ? { detail: windowName } : {})}
                remaining={remainingPercent(window.usedPercent)}
                resetsAt={window.resetsAt}
              />
            )
          })}
          {monthly && (
            <UsageRow
              label={single ? name : "Monthly credit limit"}
              detail={`${monthly.used} / ${monthly.limit} credits used`}
              remaining={remainingPercent(100 - monthly.remainingPercent)}
              resetsAt={monthly.resetsAt}
            />
          )}
        </>
      )}
    </>
  )
}

function UsageMessage({
  title,
  detail,
  role,
}: {
  readonly title: string
  readonly detail: string
  readonly role: "status" | "alert"
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-[10px] [padding:18px_0_20px]" role={role}>
      {role === "alert" && (
        <AlertCircle
          size={15}
          aria-hidden="true"
          className="mt-[1px] shrink-0 text-[var(--color-modified)]"
        />
      )}
      <div className="flex min-w-0 flex-col gap-[4px]">
        <span className="text-[var(--text-primary)] text-[13px] font-medium">{title}</span>
        <p className="m-0 text-[var(--text-secondary)] text-[12px] leading-[1.6]">{detail}</p>
      </div>
    </div>
  )
}

function connectionMessage(
  name: string,
  account: string,
  busy: boolean,
  unavailable: string | undefined,
  detail: string | undefined,
): { title: string; detail: string } {
  if (busy)
    return {
      title: `Connecting to ${name}…`,
      detail: "Your subscription allowances will appear here.",
    }
  if (unavailable === "unauthenticated")
    return {
      title: "Sign in to see your usage",
      detail: `Sign in with your ${account}, then refresh this page.`,
    }
  if (unavailable === "missing")
    return {
      title: `Install ${name} to see your usage`,
      detail: detail ?? `Could not connect to ${name}. Try refreshing.`,
    }
  return {
    title: `${name} is unavailable`,
    detail: detail ?? `Could not connect to ${name}. Try refreshing.`,
  }
}

export function SubscriptionUsage({
  provider,
}: {
  readonly provider: Provider
}): React.JSX.Element {
  const { name, key, account, accountLabel, getStatus, refreshStatus, getUsage, usageHint } =
    subscriptionProvider(provider.harness)
  const status = useQuery<ProviderStatus>({
    queryKey: queryKeys.providerStatus(provider.harness),
    queryFn: getStatus,
  })
  const ready = status.data?.availability === "ready"
  const usage = useQuery({
    queryKey: [`${key}-usage`],
    queryFn: getUsage,
    enabled: ready,
    refetchInterval: 60_000,
    staleTime: 0,
    retry: false,
  })
  const busy = status.isPending || status.data?.availability === "probing" || usage.isFetching
  const unavailable = status.data?.availability
  const email = status.data?.accountEmail ?? null
  const limits = usage.data?.limits ?? []
  // One plan covers the whole account when every allowance agrees, so it belongs to the header.
  const plans = new Set(
    limits
      .map(({ limit }) => limit.planType?.replaceAll("_", " "))
      .filter((plan): plan is string => Boolean(plan) && plan !== "unknown"),
  )
  const accountPlan = plans.size === 1 ? [...plans][0] : null
  const connection = connectionMessage(name, account, busy, unavailable, status.data?.detail)
  return (
    <section
      className="settings-group m-0 border-b-[1px] border-b-[color:var(--line-subtle)] [&:last-child]:border-b-0"
      aria-label={`${name} subscription usage`}
    >
      <header className="flex items-center justify-between gap-[20px] [padding:26px_0_22px] [@container(max-width:_540px)]:flex-wrap [@container(max-width:_540px)]:gap-[12px]">
        <div className="flex min-w-0 flex-[1_1_auto] items-center gap-[14px]">
          <span
            className="grid w-[36px] h-[36px] flex-[0_0_36px] place-items-center rounded-[var(--radius)] bg-[var(--surface-hover)] text-[var(--text-primary)]"
            aria-hidden="true"
          >
            <ProviderIcon provider={provider} size={20} />
          </span>
          <div className="flex min-w-0 flex-col">
            <h3 className="m-0 [font-family:var(--font-display)] text-[var(--text-primary)] text-[16px] font-semibold tracking-[-0.01em] leading-[1.3]">
              {name}
            </h3>
            <div className="flex min-w-0 items-center gap-[6px] [margin:3px_0_0] text-[var(--text-secondary)] text-[12px] leading-[1.6]">
              {accountPlan && (
                <span className="[text-transform:capitalize]">{accountPlan} plan</span>
              )}
              {accountPlan && <span aria-hidden="true">·</span>}
              {email ? (
                <AccountEmail email={email} name={name} />
              ) : (
                <span>{ready ? accountLabel : "Not connected"}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[12px]">
          {usage.data && (
            <span
              className="text-[var(--text-tertiary)] text-[11px] tabular-nums whitespace-nowrap"
              title="Usage refreshes every minute"
            >
              Updated{" "}
              {new Date(usage.data.checkedAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          <Button
            size="sm"
            icon={<RefreshCw size={13} aria-hidden="true" />}
            disabled={busy}
            onClick={() => {
              if (ready) void usage.refetch()
              else
                void refreshStatus()
                  .then(() => status.refetch())
                  .catch(() => status.refetch())
            }}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </header>

      <div className="flex flex-col pb-[10px] [&_>_.usage-row:first-child]:pt-[6px]">
        {!ready ? (
          <UsageMessage role="status" title={connection.title} detail={connection.detail} />
        ) : (
          <>
            {usage.isError && (
              <UsageMessage
                role="alert"
                title={
                  usage.data
                    ? "Could not refresh usage. Showing the last update."
                    : "Could not load subscription usage"
                }
                detail={usageHint}
              />
            )}
            {usage.isPending && (
              <UsageMessage
                role="status"
                title="Loading usage…"
                detail={`Fetching the latest usage from ${name}.`}
              />
            )}
            {usage.data && limits.length === 0 && (
              <p className="[margin:18px_0_20px] text-[var(--text-secondary)] text-[12px] leading-[1.6]">
                No subscription limits were reported for this account.
              </p>
            )}
            {limits.map(({ id, limit }) => (
              <UsageGroup
                key={id}
                id={id}
                limit={limit}
                showHeading={limits.length > 1 || groupName(id, limit) !== name}
              />
            ))}
          </>
        )}
      </div>
    </section>
  )
}

const usageRowClasses = [
  "usage-row flex items-start gap-[24px] [padding:20px_0]",
  "[.usage-row_+_&]:border-t-[1px] [.usage-row_+_&]:border-t-[color:var(--line-subtle)]",
  "[@container(max-width:_540px)]:flex-col [@container(max-width:_540px)]:gap-[12px]",
].join(" ")
