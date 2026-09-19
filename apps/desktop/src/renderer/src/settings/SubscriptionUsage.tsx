import { queryKeys } from "../data/cache"
import { useState } from "react"
import { Meter } from "@base-ui-components/react/meter"
import { Toggle } from "@base-ui-components/react/toggle"
import { useQuery } from "@tanstack/react-query"
import type { Provider, ProviderStatus, UsageLimit } from "@meldshell/contracts"
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
      className="usage-account"
      title={label}
      aria-label={label}
      pressed={revealed}
      {...(revealed ? { "data-revealed": "" } : {})}
      onPressedChange={setRevealed}
    >
      <span className="usage-account-email">{email}</span>
      {revealed ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
    </Toggle>
  )
}

/*
 * Allowances are read at a glance and compared against each other, so each one is a dial: the arc
 * carries the shape of the number, and the caption underneath carries its name and reset time.
 */
const DIAL_RADIUS = 40
const DIAL_LENGTH = 2 * Math.PI * DIAL_RADIUS

function UsageDial({
  label,
  remaining,
  resetsAt,
}: {
  readonly label: string
  readonly remaining: number
  readonly resetsAt?: number | null
}): React.JSX.Element {
  const low = remaining <= 10
  return (
    <Meter.Root className="usage-dial" value={remaining} aria-label={`${label} remaining`}>
      <div className="usage-dial-figure" {...(low ? { "data-low": "" } : {})}>
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle className="usage-dial-track" cx="48" cy="48" r={DIAL_RADIUS} />
          <circle
            className="usage-dial-arc"
            cx="48"
            cy="48"
            r={DIAL_RADIUS}
            strokeDasharray={DIAL_LENGTH}
            strokeDashoffset={(DIAL_LENGTH * (100 - remaining)) / 100}
          />
        </svg>
        <span className="usage-dial-value">
          {remaining}
          <span>%</span>
        </span>
      </div>
      <h4>{label}</h4>
      <p className="usage-dial-caption">
        {low && (
          <span className="usage-limit-warning">
            {remaining === 0 ? "Limit reached" : "Running low"}
          </span>
        )}
        <span>{resetLabel(resetsAt)}</span>
      </p>
    </Meter.Root>
  )
}

function creditBalance(credits: NonNullable<UsageLimit["credits"]>): string {
  if (credits.unlimited) return "Unlimited"
  if (credits.balance != null) return `${credits.balance} credits`
  return credits.hasCredits ? "Available" : "No credits remaining"
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

function Facts({
  entries,
}: {
  readonly entries: ReadonlyArray<readonly [string, string]>
}): React.JSX.Element | null {
  if (entries.length === 0) return null
  return (
    <dl className="usage-facts">
      {entries.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function UsageGroup({
  id,
  limit,
  showHeading,
  showPlan,
}: {
  readonly id: string
  readonly limit: UsageLimit
  readonly showHeading: boolean
  readonly showPlan: boolean
}): React.JSX.Element {
  const windows = [
    {
      key: "primary",
      label: id === "extra" ? "Monthly limit" : "Primary limit",
      window: limit.primary,
    },
    { key: "secondary", label: "Secondary limit", window: limit.secondary },
  ]
  const monthly = limit.individualLimit
  const credits = limit.credits
  const hasWindows = windows.some(({ window }) => window != null) || monthly != null
  const name = groupName(id, limit)
  const plan = limit.planType?.replaceAll("_", " ")
  return (
    <section className="usage-group" aria-label={name}>
      {showHeading && (
        <div className="usage-group-heading">
          <h4>{name}</h4>
          {showPlan && plan && plan !== "unknown" && <span className="usage-plan">{plan}</span>}
        </div>
      )}
      {(limit.spendControlReached || limit.rateLimitReachedType) && (
        <p className="usage-notice">
          <AlertCircle size={13} aria-hidden="true" />
          {limitNotice(limit)}
        </p>
      )}
      {hasWindows ? (
        <div className="usage-dials">
          {windows.map(({ key, label, window }) =>
            window == null ? null : (
              <UsageDial
                key={key}
                label={window.label ?? windowLabel(window.windowDurationMins, label)}
                remaining={remainingPercent(window.usedPercent)}
                resetsAt={window.resetsAt}
              />
            ),
          )}
          {monthly && (
            <UsageDial
              label="Monthly credit limit"
              remaining={remainingPercent(100 - monthly.remainingPercent)}
              resetsAt={monthly.resetsAt}
            />
          )}
        </div>
      ) : (
        <p className="usage-description">No usage windows were reported for this allowance.</p>
      )}
      <Facts
        entries={[
          ...(credits ? ([["Credit balance", creditBalance(credits)]] as const) : []),
          ...(monthly
            ? ([["Monthly credits used", `${monthly.used} / ${monthly.limit}`]] as const)
            : []),
        ]}
      />
    </section>
  )
}

function UsageConnectionState({
  name,
  account,
  busy,
  unavailable,
  detail,
}: {
  name: string
  account: string
  busy: boolean
  unavailable: string | undefined
  detail: string | undefined
}): React.JSX.Element {
  return (
    <div className="usage-state" role="status">
      <h4>
        {busy
          ? `Connecting to ${name}…`
          : unavailable === "unauthenticated"
            ? "Sign in to see your usage"
            : unavailable === "missing"
              ? `Install ${name} to see your usage`
              : `${name} is unavailable`}
      </h4>
      <p>
        {busy
          ? "Your subscription allowances will appear here."
          : unavailable === "unauthenticated"
            ? `Sign in with your ${account}, then refresh this page.`
            : (detail ?? `Could not connect to ${name}. Try refreshing.`)}
      </p>
    </div>
  )
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
  return (
    <section className="subscription-usage" aria-label={`${name} subscription usage`}>
      <header className="usage-provider-header">
        <span className="usage-provider-logo">
          <ProviderIcon provider={provider} size={20} />
        </span>
        <div className="usage-provider-identity">
          <div className="usage-provider-name">
            <h3>{name}</h3>
            {accountPlan && <span className="usage-plan">{accountPlan}</span>}
          </div>
          {email ? (
            <AccountEmail email={email} name={name} />
          ) : (
            <p className="usage-account-fallback">{ready ? accountLabel : "Not connected"}</p>
          )}
        </div>
        {usage.data && (
          <span className="usage-updated" title="Usage refreshes every minute">
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
      </header>

      <div className="usage-body">
        {!ready ? (
          <UsageConnectionState
            name={name}
            account={account}
            busy={busy}
            unavailable={unavailable}
            detail={status.data?.detail}
          />
        ) : (
          <>
            {usage.isError && (
              <div className="usage-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <div>
                  <strong>
                    {usage.data
                      ? "Could not refresh usage. Showing the last update."
                      : "Could not load subscription usage"}
                  </strong>
                  <p>{usageHint}</p>
                </div>
              </div>
            )}
            {usage.isPending && (
              <div className="usage-state" role="status">
                <h4>Loading usage…</h4>
                <p>Fetching the latest usage from {name}.</p>
              </div>
            )}
            {usage.data && (
              <>
                {limits.length === 0 && (
                  <p className="usage-description">
                    No subscription limits were reported for this account.
                  </p>
                )}
                {limits.map(({ id, limit }) => (
                  <UsageGroup
                    key={id}
                    id={id}
                    limit={limit}
                    showHeading={limits.length > 1 || groupName(id, limit) !== name}
                    showPlan={accountPlan === null}
                  />
                ))}
                <Facts
                  entries={
                    usage.data.resetCredits === null
                      ? []
                      : [["Usage resets available", String(usage.data.resetCredits)]]
                  }
                />
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
