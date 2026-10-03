import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { test as base } from "e2e"
import { defineEngine } from "e2e/engine"
import { createTestHarness, type TestHarness } from "wrangler"

const origin = "http://localhost:4321"
// The first request boots local auth, D1, and Durable Objects; Windows CI can exceed 10 seconds.
const REQUEST_TIMEOUT_MS = 30_000

export class Control {
  private harness: TestHarness | undefined
  private url = ""
  readonly token = randomUUID()

  async start() {
    const vars = {
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: "offline-e2e-secret-".repeat(4),
      GOOGLE_CLIENT_ID: "offline-google-client",
      GOOGLE_CLIENT_SECRET: "offline-google-secret",
      DISCORD_CLIENT_ID: "offline-discord-client",
      DISCORD_CLIENT_SECRET: "offline-discord-secret",
    }
    const harness = createTestHarness({
      workers: [{ configPath: resolve("apps/control/wrangler.jsonc"), vars, secrets: vars }],
    })
    this.harness = harness
    try {
      this.url = (await harness.listen()).url.origin
      const worker = harness.getWorker()
      await worker.applyD1Migrations("DB")
      const { DB } = await worker.getEnv()
      const now = new Date().toISOString()
      const expires = new Date(Date.now() + 86_400_000).toISOString()
      await DB.batch([
        DB.prepare(
          'INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
        ).bind("e2e-user", "E2E", "e2e@example.invalid", 1, now, now),
        DB.prepare(
          'INSERT INTO "session" (id,expiresAt,token,createdAt,updatedAt,userId) VALUES (?,?,?,?,?,?)',
        ).bind("e2e-session", expires, this.token, now, now, "e2e-user"),
      ])
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async request(
    path: string,
    options: { method?: string; body?: unknown; authenticated?: boolean; origin?: string } = {},
  ) {
    const response = await fetch(`${this.url}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Origin: options.origin ?? origin,
        ...(options.authenticated === false ? {} : { Authorization: `Bearer ${this.token}` }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return { status: response.status, body: (await response.json()) as unknown }
  }

  async stop() {
    const harness = this.harness
    this.harness = undefined
    this.url = ""
    await harness?.close()
  }
}

export function controlEngine() {
  let control = new Control()
  return defineEngine({
    name: "meldshell-control",
    version: "1.0.0",
    spiVersion: 1,
    platform: "control",
    workers: 1,
    async startAttempt() {
      control = new Control()
      await control.start()
    },
    endAttempt: () => control.stop(),
    fixtures: {
      control: (context) =>
        context.fixture("control", control, {
          request: {
            kind: "resource",
            label: (path, options) => `${options?.method ?? "GET"} ${path}`,
            // request() owns the fetch/body deadline; the test retains its overall timeout.
            timeout: false,
          },
        }),
    },
  })
}
export const test = base.extend<{ control: Control }>()
