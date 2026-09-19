import * as SqlClient from "@effect/sql/SqlClient"
import { stat } from "node:fs/promises"
import { basename } from "node:path"
import { Effect } from "effect"

// Older versions applied win32.normalize even to POSIX folder selections.
export const repairWorkspacePaths = Effect.gen(function* () {
  if (process.platform === "win32") return
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{
    id: string
    path: string
    name: string
  }>`SELECT id, path, name FROM workspaces`
  for (const row of rows) {
    if (!row.path.startsWith("\\") || row.path.startsWith("\\\\")) continue
    const path = row.path.replaceAll("\\", "/")
    if (rows.some((other) => other.path === path)) continue
    const exists = yield* Effect.promise(() =>
      stat(path).then(
        (info) => info.isDirectory(),
        () => false,
      ),
    )
    if (!exists) continue
    const name = row.name === row.path ? basename(path) : row.name
    yield* sql`UPDATE workspaces SET path = ${path}, name = ${name} WHERE id = ${row.id}`
  }
})
