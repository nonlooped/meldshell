import { DatabaseSync } from "node:sqlite"
import { betterAuth, type BetterAuthOptions } from "better-auth"
import { getMigrations } from "better-auth/db/migration"
import { apiKey } from "@better-auth/api-key"
import { bearer, deviceAuthorization } from "better-auth/plugins"

export interface AccountConfig {
  readonly baseURL: string
  readonly siteURL: string
  readonly secret: string
  readonly production: boolean
  readonly trustProxy?: boolean
  readonly google?: { clientId: string; clientSecret: string }
  readonly sendEmail?: (to: string, subject: string, text: string) => Promise<void>
}

export async function createAccounts(database: DatabaseSync, config: AccountConfig) {
  for (const origin of [config.baseURL, config.siteURL])
    if (new URL(origin).origin !== origin)
      throw new Error("Configure service URLs as origins without paths or trailing slashes.")
  if (
    !config.production &&
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(config.baseURL).hostname)
  )
    throw new Error("Use NODE_ENV=production for a public account service.")
  if (config.secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must have at least 32 characters.")
  if (
    config.production &&
    (!config.baseURL.startsWith("https://") || !config.siteURL.startsWith("https://"))
  )
    throw new Error("Production account and website URLs must use HTTPS.")
  if (config.production && !config.sendEmail)
    throw new Error("Configure SMTP for email verification and password recovery.")
  const sendEmail =
    config.sendEmail ??
    (async () => {
      throw new Error("Email delivery is not configured.")
    })
  const options = {
    appName: "MeldShell",
    baseURL: config.baseURL,
    secret: config.secret,
    database,
    trustedOrigins: [config.siteURL, config.baseURL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: config.production,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) =>
        sendEmail(user.email, "Reset your MeldShell password", `Reset your password: ${url}`),
    },
    emailVerification: {
      sendOnSignUp: config.production,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) =>
        sendEmail(user.email, "Verify your MeldShell email", `Verify your email address: ${url}`),
    },
    socialProviders: config.google ? { google: config.google } : {},
    account: { accountLinking: { enabled: false } },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    advanced: {
      useSecureCookies: config.production,
      ipAddress: { ipAddressHeaders: ["x-meldshell-client-ip"] },
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
        verificationUri: `${config.siteURL}/device`,
        validateClient: (clientId) => clientId === "meldshell-host",
      }),
    ],
  } satisfies BetterAuthOptions
  const migrations = await getMigrations(options)
  await migrations.runMigrations()
  return betterAuth(options)
}
export type Accounts = Awaited<ReturnType<typeof createAccounts>>
