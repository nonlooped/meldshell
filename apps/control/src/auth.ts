import { betterAuth, type BetterAuthOptions } from "better-auth"
import { apiKey } from "@better-auth/api-key"
import { bearer, deviceAuthorization } from "better-auth/plugins"

export interface Env {
  readonly DB: D1Database
  readonly ACCOUNTS: DurableObjectNamespace<import("./account").Account>
  readonly DEVICES: DurableObjectNamespace<import("./relay").DeviceRelay>
  /** Public origin of the site, which also serves the API under /api. */
  readonly BETTER_AUTH_URL: string
  readonly BETTER_AUTH_SECRET: string
  readonly GOOGLE_CLIENT_ID?: string
  readonly GOOGLE_CLIENT_SECRET?: string
  readonly DISCORD_CLIENT_ID?: string
  readonly DISCORD_CLIENT_SECRET?: string
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

/** OAuth providers with both credentials configured; the sign-in page offers only these. */
export function providers(env: Env) {
  const pair = (id?: string, secret?: string) => {
    if (!!id !== !!secret) throw new Error("Configure both OAuth credentials for each provider.")
    return id && secret ? { clientId: id, clientSecret: secret } : undefined
  }
  const google = pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
  const discord = pair(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET)
  return { ...(google ? { google } : {}), ...(discord ? { discord } : {}) }
}

export function authOptions(env: Env) {
  const origin = env.BETTER_AUTH_URL
  const url = new URL(origin)
  if (url.origin !== origin)
    throw new Error("Set BETTER_AUTH_URL to an origin without a path or trailing slash.")
  const local = LOCAL_HOSTS.includes(url.hostname)
  if (!local && url.protocol !== "https:") throw new Error("BETTER_AUTH_URL must use HTTPS.")
  if ((env.BETTER_AUTH_SECRET ?? "").length < 32)
    throw new Error("BETTER_AUTH_SECRET must have at least 32 characters.")
  return {
    appName: "MeldShell",
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [origin],
    socialProviders: providers(env),
    // Providers link to one account only when they report the same verified email.
    account: { accountLinking: { enabled: true, allowDifferentEmails: false } },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    advanced: {
      useSecureCookies: !local,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [
      bearer(),
      apiKey({
        configId: "device",
        maximumNameLength: 100,
        enableSessionForAPIKeys: false,
        rateLimit: { enabled: false },
        startingCharactersConfig: { shouldStore: false, charactersLength: 0 },
      }),
      deviceAuthorization({
        verificationUri: `${origin}/device`,
        validateClient: (clientId) => clientId === "meldshell-host",
      }),
    ],
  } satisfies BetterAuthOptions
}

/**
 * Builds Better Auth for one request. Workers cannot share an instance across requests: its lazy
 * initialization would await I/O owned by the request that started it and never settle.
 */
export const accounts = (env: Env): Accounts => betterAuth(authOptions(env))
export type Accounts = ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>>
