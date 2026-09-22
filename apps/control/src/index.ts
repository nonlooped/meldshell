import { mkdirSync, chmodSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import nodemailer from "nodemailer"
import { createControlServer } from "./server"

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name} before starting the account service.`)
  return value
}
const databasePath = resolve(process.env.MELDSHELL_ACCOUNT_DATABASE ?? "./data/accounts.sqlite")
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
const database = new DatabaseSync(databasePath)
chmodSync(databasePath, 0o600)
database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL")
const smtp = process.env.SMTP_URL
const mailer = smtp ? nodemailer.createTransport(smtp) : null
const sender = mailer ? required("SMTP_FROM") : ""
const googleId = process.env.GOOGLE_CLIENT_ID
const googleSecret = process.env.GOOGLE_CLIENT_SECRET
if (!!googleId !== !!googleSecret) throw new Error("Configure both Google OAuth credentials.")
const control = await createControlServer(database, {
  baseURL: required("BETTER_AUTH_URL"),
  siteURL: required("MELDSHELL_SITE_URL"),
  secret: required("BETTER_AUTH_SECRET"),
  production: process.env.NODE_ENV === "production",
  trustProxy: process.env.MELDSHELL_TRUST_PROXY === "1",
  ...(googleId && googleSecret
    ? { google: { clientId: googleId, clientSecret: googleSecret } }
    : {}),
  ...(mailer
    ? {
        sendEmail: async (to: string, subject: string, text: string) => {
          await mailer.sendMail({ from: sender, to, subject, text })
        },
      }
    : {}),
})
control.server.listen(
  Number(process.env.PORT ?? 3001),
  process.env.BIND_ADDRESS ?? "127.0.0.1",
  () => {
    console.info("MeldShell account and relay service is listening.")
  },
)
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void control.close().finally(() => database.close())
  })
