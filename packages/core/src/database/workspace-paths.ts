import * as SqlClient from "effect/sql/SqlClient"
import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, normalize, parse, sep } from "node:path"
import { randomUUID } from "node:crypto"
import { Effect } from "effect"

export const normalizeWorkspacePath = (path: string): string => {
  const normalized = normalize(path)
  return normalized === parse(normalized).root
    ? normalized
    : normalized.endsWith(sep)
      ? normalized.slice(0, -1)
      : normalized
}

/** The home workspace's folder. Threads there need no project, so terminals start at `~`. */
export const homeWorkspacePath = normalizeWorkspacePath(homedir())

/**
 * Adds the home workspace when it is missing. It starts as the least recently opened, so an
 * existing install keeps starting new threads in the project it last used.
 */
export const ensureHomeWorkspace = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const timestamp = new Date().toISOString()
  yield* sql`
    INSERT INTO workspaces (id, path, name, created_at, last_opened_at)
    VALUES (${randomUUID()}, ${homeWorkspacePath}, 'Home', ${timestamp}, '1970-01-01T00:00:00.000Z')
    ON CONFLICT(path) DO NOTHING
  `
})

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
