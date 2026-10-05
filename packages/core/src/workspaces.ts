import * as SqlClient from "effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import { basename } from "node:path"
import { CoreProtocolError } from "@meldshell/contracts"
import { Effect } from "effect"
import { homeWorkspacePath, normalizeWorkspacePath } from "./database/workspace-paths"
import { getSnapshot } from "./snapshots"

export const addWorkspace = (path: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const timestamp = new Date().toISOString()
    const normalizedPath = normalizeWorkspacePath(path)
    const id = randomUUID()

    yield* sql`
      INSERT INTO workspaces (id, path, name, created_at, last_opened_at)
      VALUES (${id}, ${normalizedPath}, ${basename(normalizedPath)}, ${timestamp}, ${timestamp})
      ON CONFLICT(path) DO UPDATE SET last_opened_at = excluded.last_opened_at
    `

    return yield* getSnapshot
  })

export const renameWorkspace = (workspaceId: string, name: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > 100)
      return yield* Effect.fail(
        new CoreProtocolError({ message: "Use a workspace name between 1 and 100 characters." }),
      )
    yield* sql`UPDATE workspaces SET name = ${trimmed} WHERE id = ${workspaceId}`
    return yield* getSnapshot
  })

export const removeWorkspace = (workspaceId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(
      Effect.gen(function* () {
        const home = yield* sql`SELECT id FROM workspaces
        WHERE id = ${workspaceId} AND path = ${homeWorkspacePath}`
        if (home.length > 0)
          return yield* Effect.fail(
            new CoreProtocolError({ message: "The home workspace can't be removed." }),
          )
        const running = yield* sql`SELECT r.id FROM turns r JOIN threads t ON t.id = r.thread_id
        WHERE t.workspace_id = ${workspaceId} AND r.status = 'running' LIMIT 1`
        if (running.length > 0)
          return yield* Effect.fail(
            new CoreProtocolError({
              message: "Stop running threads before removing this workspace.",
            }),
          )
        yield* sql`DELETE FROM workspaces WHERE id = ${workspaceId}`
      }),
    )
    return yield* getSnapshot
  })
