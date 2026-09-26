import assert from "node:assert/strict"
import { it } from "@effect/vitest"
import { TestDatabase } from "./test/database"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect } from "effect"
import type { ProviderModelCatalogEntry } from "@meldshell/contracts"
import { seedCatalog, syncProviderCatalog } from "./catalog"
import { runMigrations } from "./database/migrations"
import { getSnapshot } from "./snapshots"
import { beginShutdown, recordRuntimeEvent, submitTurn } from "./turns"
import { initializeDatabase } from "./database/persistence"
import { isShuttingDown, setAppSettings } from "./settings"

const model: ProviderModelCatalogEntry = {
  catalogId: "sonnet",
  slug: "sonnet",
  displayName: "Sonnet",
  description: "",
  reasoningEfforts: [],
  defaultReasoningEffort: null,
  serviceTiers: [],
  defaultServiceTier: null,
  additionalSpeedTiers: [],
  fastServiceTier: null,
  inputModalities: [],
  supportsPersonality: false,
  isDefault: true,
  hidden: false,
  upgrade: null,
  modelSpecialty: null,
  multiAgentVersion: null,
}

it.effect("an approved Claude plan is reviewed as a plan and ends the thread's plan mode", () =>
  Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* runMigrations
      yield* seedCatalog
      const catalog = yield* syncProviderCatalog({ providerKey: "anthropic", models: [model] })
      const sonnet = catalog.models.find((entry) => entry.slug === "sonnet")!
      yield* sql`INSERT INTO workspaces VALUES ('w', '/w', 'w', '2026-09-01', '2026-09-01')`
      yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at, title_locked)
        VALUES ('t', 'w', 'Thread', 'active', '2026-09-01', '2026-09-01', 1)`
      yield* sql`INSERT INTO thread_settings (thread_id, provider_id, model_id, mode)
        VALUES ('t', ${sonnet.providerId}, ${sonnet.id}, 'plan')`
    })
    const sent = yield* submitTurn({ threadId: "t", text: "Plan the change" })
    assert.equal(sent.dispatch?.mode, "plan")
    const turnId = sent.dispatch!.turnId
    yield* recordRuntimeEvent({
      threadId: "t",
      turnId,
      validated: true,
      method: "claude/exit_plan_mode",
      params: { approvalScope: "turn", plan: "1. Change it", toolName: "ExitPlanMode" },
      requestId: "claude:plan",
    })
    const reviewing = yield* getSnapshot
    assert.deepEqual(
      reviewing.approvals.map((approval) =>
        approval.kind === "plan" ? { kind: approval.kind, plan: approval.plan } : approval.kind,
      ),
      [{ kind: "plan", plan: "1. Change it" }],
    )
    yield* recordRuntimeEvent({
      threadId: "t",
      turnId,
      validated: true,
      method: "claude/permission_mode",
      params: { permissionMode: "acceptEdits" },
    })
    const working = yield* getSnapshot
    assert.equal(working.threadSettings.find((entry) => entry.threadId === "t")?.mode, "default")
  }).pipe(Effect.provide(TestDatabase)),
)

it.effect(
  "shutdown blocks submissions and queue promotion, and restart recovers without losing queued work",
  () =>
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        yield* initializeDatabase
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO workspaces VALUES ('w', '/w', 'w', '2026-09-01', '2026-09-01')`
        for (const id of ["completed", "interrupted"]) {
          yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at)
          VALUES (${id}, 'w', ${id}, 'active', '2026-09-01', '2026-09-01')`
          yield* sql`INSERT INTO turns (id, thread_id, provider, harness, model, speed, status, started_at)
          VALUES (${id}, ${id}, 'anthropic', 'claude-code', 'sonnet', 'standard', 'running', '2026-09-01')`
        }
        yield* sql`INSERT INTO queued_inputs (thread_id, text, created_at)
        VALUES ('completed', 'Queued work', '2026-09-01')`
      })
      assert.equal((yield* beginShutdown).length, 2)
      const rejected = yield* submitTurn({ threadId: "completed", text: "New work" }).pipe(
        Effect.flip,
      )
      assert.match(rejected.message, /MeldShell is shutting down/)
      const result = yield* recordRuntimeEvent({
        threadId: "completed",
        turnId: "completed",
        validated: true,
        method: "turn/completed",
        params: { turn: { status: "completed" } },
      })
      assert.equal(result.nextDispatch, null)
      yield* initializeDatabase
      assert.equal(yield* isShuttingDown, false)
      const snapshot = yield* getSnapshot
      const completed = snapshot.threads.find((thread) => thread.id === "completed")!
      assert.equal(completed.queuedCount, 1)
      assert.equal(completed.turnCount, 1)
      assert.equal(completed.activity, "completed")
      assert.equal(
        snapshot.threads.find((thread) => thread.id === "interrupted")?.activity,
        "interrupted",
      )
      const errors = yield* Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`SELECT id FROM events WHERE kind = 'error'`,
      )
      assert.equal(errors.length, 0)
    }).pipe(Effect.provide(TestDatabase)),
)

for (const providerKey of ["openai", "anthropic", "cursor"] as const) {
  it.effect(
    `${providerKey} applies full permissions to new and queued turns and restores thread choices`,
    () =>
      Effect.gen(function* () {
        yield* runMigrations
        yield* seedCatalog
        const catalog = yield* syncProviderCatalog({ providerKey, models: [model] })
        const selected = catalog.models.find((entry) => entry.slug === model.slug)!
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO workspaces VALUES ('w', '/w', 'w', '2026-09-01', '2026-09-01')`
        yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at, title_locked)
        VALUES ('t', 'w', 'Thread', 'active', '2026-09-01', '2026-09-01', 1)`
        yield* sql`INSERT INTO thread_settings (thread_id, provider_id, model_id, sandbox, approval_policy)
        VALUES ('t', ${selected.providerId}, ${selected.id}, 'read-only', 'on-request')`
        yield* setAppSettings({ alwaysFullPermissions: true })
        const first = (yield* submitTurn({ threadId: "t", text: "Work" })).dispatch!
        assert.equal(first.sandbox, "danger-full-access")
        assert.equal(first.approvalPolicy, "never")
        assert.equal((yield* submitTurn({ threadId: "t", text: "Queued" })).disposition, "queued")
        const next = (yield* recordRuntimeEvent({
          threadId: "t",
          turnId: first.turnId,
          validated: true,
          method: "turn/completed",
          params: { turn: { status: "completed" } },
        })).nextDispatch!
        assert.equal(next.sandbox, "danger-full-access")
        assert.equal(next.approvalPolicy, "never")
        yield* submitTurn({ threadId: "t", text: "Restore" })
        yield* setAppSettings({ alwaysFullPermissions: false })
        const restored = (yield* recordRuntimeEvent({
          threadId: "t",
          turnId: next.turnId,
          validated: true,
          method: "turn/completed",
          params: { turn: { status: "completed" } },
        })).nextDispatch!
        assert.equal(restored.sandbox, "read-only")
        assert.equal(restored.approvalPolicy, "on-request")
      }).pipe(Effect.provide(TestDatabase)),
  )
}
