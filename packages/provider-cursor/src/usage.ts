import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { CodexUsage, UsageLimit, UsageWindow } from "@meldshell/contracts"
import { Either, Schema } from "effect"

const optional = <A, I, R>(schema: Schema.Schema<A, I, R>) => Schema.optional(Schema.NullOr(schema))
const percent = Schema.Number.pipe(Schema.finite(), Schema.nonNegative())
const UsageSummary = Schema.Struct({
  billingCycleEnd: optional(Schema.String),
  membershipType: optional(Schema.String),
  individualUsage: Schema.Struct({
    plan: optional(
      Schema.Struct({
        enabled: Schema.Boolean,
        autoPercentUsed: optional(percent),
        apiPercentUsed: optional(percent),
      }),
    ),
  }),
})
const Auth = Schema.Struct({ accessToken: Schema.String })
const Claims = Schema.Struct({
  sub: Schema.String,
  exp: Schema.Number.pipe(Schema.finite()),
})
const signInMessage = "Sign in again with Cursor CLI, then refresh subscription usage."

function parseCursorUsage(response: unknown): CodexUsage {
  const decoded = Schema.decodeUnknownEither(UsageSummary)(response)
  if (Either.isLeft(decoded)) throw new Error("Cursor returned an invalid usage response.")
  const summary = decoded.right
  const plan = summary.individualUsage.plan
  const reset = summary.billingCycleEnd ? Date.parse(summary.billingCycleEnd) / 1000 : NaN
  const window = (usedPercent: number | null | undefined, label: string): UsageWindow | null =>
    usedPercent == null
      ? null
      : { usedPercent, label, resetsAt: Number.isFinite(reset) ? reset : null }
  const limits: Array<{ id: string; limit: UsageLimit }> = []
  if (plan?.enabled) {
    // The summary also reports a combined total, but it duplicates the two pools it is made of.
    const primary = window(plan.autoPercentUsed, "Auto pool")
    const secondary = window(plan.apiPercentUsed, "API pool")
    if (primary || secondary)
      limits.push({
        id: "cursor",
        limit: { limitName: "Plan limits", planType: summary.membershipType, primary, secondary },
      })
  }
  return { checkedAt: new Date().toISOString(), limits, resetCredits: null }
}

function authPath(): string {
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Cursor", "auth.json")
  if (process.platform === "darwin") return join(homedir(), ".cursor", "auth.json")
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "cursor", "auth.json")
}

async function sessionCookie(path: string, signal: AbortSignal): Promise<string> {
  try {
    const auth = Schema.decodeUnknownSync(Auth)(
      JSON.parse(await readFile(path, { encoding: "utf8", signal })),
    )
    const parts = auth.accessToken.split(".")
    if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)))
      throw new Error("Invalid token")
    const claims = Schema.decodeUnknownSync(Claims)(
      JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")),
    )
    const userId = claims.sub.split("|").at(-1)
    if (!userId || !/^[A-Za-z0-9._-]+$/.test(userId) || claims.exp * 1000 <= Date.now() + 60_000)
      throw new Error("Invalid or expired token")
    return `WorkosCursorSessionToken=${userId}%3A%3A${auth.accessToken}`
  } catch {
    // Never propagate parse errors that can contain credentials or auth-file contents.
    throw new Error(signInMessage)
  }
}

export async function readCursorUsage(
  signal?: AbortSignal,
  options: { authFile?: string; fetch?: typeof fetch } = {},
): Promise<CodexUsage> {
  // A stored login may belong to a different account than an environment override.
  if (process.env.CURSOR_API_KEY || process.env.CURSOR_AUTH_TOKEN)
    throw new Error("Cursor subscription usage requires the stored Cursor CLI login.")
  const timeout = AbortSignal.timeout(15_000)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  try {
    requestSignal.throwIfAborted()
    const cookie = await sessionCookie(options.authFile ?? authPath(), requestSignal)
    let response: Response
    try {
      response = await (options.fetch ?? fetch)("https://cursor.com/api/usage-summary", {
        headers: { Accept: "application/json", Cookie: cookie },
        redirect: "error",
        signal: requestSignal,
      })
    } catch {
      throw new Error("Could not reach Cursor's usage service. Try again shortly.")
    }
    if (response.status === 401 || response.status === 403) throw new Error(signInMessage)
    if (!response.ok) throw new Error("Cursor's usage service is unavailable. Try again shortly.")
    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new Error("Cursor returned an invalid usage response.")
    }
    requestSignal.throwIfAborted()
    return parseCursorUsage(data)
  } catch (cause) {
    if (signal?.aborted) throw new Error("Cursor usage request cancelled.")
    if (timeout.aborted) throw new Error("Cursor usage took too long to load. Try again.")
    throw cause
  }
}
