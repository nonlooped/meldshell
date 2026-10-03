import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test as base } from "e2e"
import { defineEngine } from "e2e/engine"
import { unstable_startWorker } from "wrangler"

const origin = "http://localhost:4321"
// The first request boots local auth, D1, and Durable Objects; Windows CI can exceed 10 seconds.
const REQUEST_TIMEOUT_MS = 30_000

export class Control {
  private worker: Awaited<ReturnType<typeof unstable_startWorker>> | undefined
  private directory = ""
  private url = ""
  readonly token = randomUUID()

  async start() {
    this.directory = await mkdtemp(join(tmpdir(), "meldshell-control-e2e-"))
    const cli = resolve("node_modules/wrangler/bin/wrangler.js")
    const run = (...args: string[]) =>
      execFileSync(
        process.execPath,
        [cli, "d1", ...args, "--local", "--persist-to", this.directory],
        { cwd: resolve("apps/control"), stdio: "pipe" },
      )
    run("migrations", "apply", "meldshell")
    const seed = join(this.directory, "seed.sql")
    const now = new Date().toISOString()
    const expires = new Date(Date.now() + 86_400_000).toISOString()
    await writeFile(
      seed,
      `INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('e2e-user','E2E','e2e@example.invalid',1,'${now}','${now}');\nINSERT INTO "session" (id,expiresAt,token,createdAt,updatedAt,userId) VALUES ('e2e-session','${expires}','${this.token}','${now}','${now}','e2e-user');`,
    )
    run("execute", "meldshell", "--file", seed)
    const vars = {
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: "offline-e2e-secret-".repeat(4),
      GOOGLE_CLIENT_ID: "offline-google-client",
      GOOGLE_CLIENT_SECRET: "offline-google-secret",
      DISCORD_CLIENT_ID: "offline-discord-client",
      DISCORD_CLIENT_SECRET: "offline-discord-secret",
    }
    this.worker = await unstable_startWorker({
      config: resolve("apps/control/wrangler.jsonc"),
      bindings: Object.fromEntries(
        Object.entries(vars).map(([name, value]) => [name, { type: "plain_text" as const, value }]),
      ),
      dev: { persist: this.directory, server: { port: 0 }, inspector: false, logLevel: "none" },
    })
    this.url = (await this.worker.url).origin
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
    try {
      await this.worker?.dispose()
    } finally {
      await rm(this.directory, { recursive: true, force: true })
    }
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
