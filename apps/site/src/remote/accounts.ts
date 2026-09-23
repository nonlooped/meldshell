/** The site serves the account API and relay under /api on its own origin. */
export const accountURL = window.location.origin

/** Thrown when the account service cannot be reached, so pages can retry instead of failing. */
export class ServiceUnavailable extends Error {}

export async function accountRequest(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  let response: Response
  try {
    response = await fetch(`${accountURL}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new ServiceUnavailable(
      import.meta.env.DEV
        ? "Can’t reach the account worker. Keep npm run dev:all running, then try again."
        : "Can’t reach MeldShell accounts. Check your connection and try again.",
    )
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new ServiceUnavailable(
      "Accounts aren’t available at this address. This website needs a configured MeldShell account service.",
    )
  const data = await response.json()
  if (!response.ok)
    throw new Error(data.message ?? data.error ?? "Something went wrong. Try again.")
  return data
}

export type Session = { user: { id: string; email: string; name: string } }

/** Returns the signed-in session, or null without redirecting. */
export async function currentSession(): Promise<Session | null> {
  const session = await accountRequest("/api/auth/get-session")
  return session?.user ? session : null
}

export async function requireSession(): Promise<Session> {
  const session = await currentSession()
  if (!session) {
    sessionStorage.setItem(
      "meldshell:after-sign-in",
      window.location.pathname + window.location.search,
    )
    window.location.assign("/sign-in")
    throw new Error("Sign in to continue")
  }
  return session
}

export async function signOut(returnTo?: string) {
  await accountRequest("/api/auth/sign-out", {})
  if (returnTo) sessionStorage.setItem("meldshell:after-sign-in", returnTo)
  window.location.assign("/sign-in")
}

export const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause).replace(/^Error: /, "")

export type Device = { id: string; name: string; online: boolean; lastSeen: number | null }
export const listDevices = () => accountRequest("/api/remote/v1/devices") as Promise<Device[]>

/** "just now", "5 minutes ago", "yesterday", or a date for anything older than a week. */
export function relativeTime(time: number, now = Date.now()) {
  const seconds = Math.round((time - now) / 1000)
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  const abs = Math.abs(seconds)
  if (abs < 45) return "just now"
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute")
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour")
  if (abs < 604_800) return format.format(Math.round(seconds / 86_400), "day")
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
