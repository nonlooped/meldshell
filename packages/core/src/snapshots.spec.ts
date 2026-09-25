import assert from "node:assert/strict"
import { it } from "@effect/vitest"
import { TestDatabase } from "./test/database"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect } from "effect"
import { runMigrations } from "./database/migrations"
import { getSnapshot, listThreads } from "./snapshots"

it.effect("thread pages list pinned, then active, then archived threads without gaps", () =>
  Effect.gen(function* () {
    // id, status, pinned, updated_at: two share an update time, so the id breaks the tie.
    const threads = [
      ["archived-new", "settled", 0, "2026-09-05"],
      ["active-old", "active", 0, "2026-09-01"],
      ["pinned", "active", 1, "2026-09-02"],
      ["active-tie-a", "active", 0, "2026-09-03"],
      ["active-tie-b", "active", 0, "2026-09-03"],
      ["archived-old", "settled", 0, "2026-09-02"],
      ["active-new", "active", 0, "2026-09-04"],
    ] as const
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* runMigrations
      yield* sql`INSERT INTO workspaces VALUES ('w', '/w', 'w', '2026-09-01', '2026-09-01')`
      for (const [id, status, pinned, updatedAt] of threads)
        yield* sql`INSERT INTO threads (id, workspace_id, title, status, pinned, created_at, updated_at)
          VALUES (${id}, 'w', ${id}, ${status}, ${pinned}, '2026-09-01', ${updatedAt})`
    })
    const expected = [
      "pinned",
      "active-new",
      "active-tie-b",
      "active-tie-a",
      "active-old",
      "archived-new",
      "archived-old",
    ]
    const paged: string[] = []
    let cursor: string | undefined
    do {
      const page = yield* listThreads({ limit: 2, ...(cursor === undefined ? {} : { cursor }) })
      paged.push(...page.threads.map((thread) => thread.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor !== undefined)
    assert.deepEqual(paged, expected)
    const snapshot = yield* getSnapshot
    assert.deepEqual(
      snapshot.threads.map((thread) => thread.id),
      expected,
    )
  }).pipe(Effect.provide(TestDatabase)),
)
