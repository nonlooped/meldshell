import assert from "node:assert/strict"
import { test } from "node:test"
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"
import type { ProviderModelCatalogEntry } from "@meldshell/contracts"
import { seedCatalog, syncProviderCatalog } from "./catalog"
import { runMigrations } from "./database/migrations"
import { getSnapshot } from "./snapshots"
import { recordRuntimeEvent, submitTurn } from "./turns"

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

test("an approved Claude plan is reviewed as a plan and ends the thread's plan mode", async (t) => {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }))
  t.after(() => runtime.dispose())
  await runtime.runPromise(
    Effect.gen(function* () {
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
    }),
  )
  const sent = await runtime.runPromise(submitTurn({ threadId: "t", text: "Plan the change" }))
  assert.equal(sent.dispatch?.mode, "plan")
  const turnId = sent.dispatch!.turnId
  await runtime.runPromise(
    recordRuntimeEvent({
      threadId: "t",
      turnId,
      validated: true,
      method: "claude/exit_plan_mode",
      params: { approvalScope: "turn", plan: "1. Change it", toolName: "ExitPlanMode" },
      requestId: "claude:plan",
    }),
  )
  const reviewing = await runtime.runPromise(getSnapshot)
  assert.deepEqual(
    reviewing.approvals.map((approval) =>
      approval.kind === "plan" ? { kind: approval.kind, plan: approval.plan } : approval.kind,
    ),
    [{ kind: "plan", plan: "1. Change it" }],
  )
  await runtime.runPromise(
    recordRuntimeEvent({
      threadId: "t",
      turnId,
      validated: true,
      method: "claude/permission_mode",
      params: { permissionMode: "acceptEdits" },
    }),
  )
  const working = await runtime.runPromise(getSnapshot)
  assert.equal(working.threadSettings.find((entry) => entry.threadId === "t")?.mode, "default")
})
