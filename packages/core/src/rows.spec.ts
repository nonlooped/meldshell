import assert from "node:assert/strict"
import { it } from "@effect/vitest"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect, Either } from "effect"
import { readRows, WorkspaceFromRow, ModelFromRow, ApprovalFromRow } from "./database/rows"
import { TestDatabase } from "./test/database"
import { runMigrations } from "./database/migrations"
import { seedCatalog } from "./catalog"

it.effect("row decoding rejects missing columns with a field path", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const result = yield* readRows(
      WorkspaceFromRow,
      sql`SELECT 'w' AS id, '/w' AS path, 'Workspace' AS name, 'now' AS created_at`,
    ).pipe(Effect.either)
    assert.ok(Either.isLeft(result))
    assert.equal(result.left._tag, "ParseError")
    assert.match(result.left.message, /last_opened_at/)
  }).pipe(Effect.provide(TestDatabase)),
)

it.effect("invalid model metadata fails decoding instead of acquiring a trusted type", () =>
  Effect.gen(function* () {
    yield* runMigrations
    yield* seedCatalog
    const sql = yield* SqlClient.SqlClient
    const result = yield* readRows(
      ModelFromRow,
      sql`SELECT 'm' AS id, 'p' AS provider_id, 'model' AS slug,
      'Model' AS display_name, '[]' AS reasoning_efforts, '{"serviceTiers":[{"id":42}]}' AS metadata,
      0 AS supports_fast, 1 AS enabled, 0 AS hidden, 0 AS sort_order, 0 AS built_in`,
    ).pipe(Effect.either)
    assert.ok(Either.isLeft(result))
    assert.equal(result.left._tag, "ParseError")
    assert.match(result.left.message, /metadata/)
    assert.match(result.left.message, /serviceTiers/)
  }).pipe(Effect.provide(TestDatabase)),
)

it.effect("stored approval options are checked before being returned to the UI", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const result = yield* readRows(
      ApprovalFromRow,
      sql`SELECT 'a' AS id, 't' AS thread_id, 'r' AS turn_id,
      'request' AS request_id, 'cursor/acp/session/request_permission' AS method, 'Approve' AS title,
      '' AS detail, 'now' AS created_at, '{"options":[{"optionId":3,"kind":"allow_once","name":"Allow"}]}' AS request_data`,
    ).pipe(Effect.either)
    assert.ok(Either.isLeft(result))
    assert.equal(result.left._tag, "ParseError")
    assert.match(result.left.message, /optionId/)
  }).pipe(Effect.provide(TestDatabase)),
)
