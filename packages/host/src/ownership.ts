import { mkdir, realpath } from "node:fs/promises"
import { dirname, join, basename } from "node:path"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { SqlClient } from "@effect/sql/SqlClient"
import { Effect, ManagedRuntime } from "effect"

/** An OS-released SQLite exclusive lock, held by the sole database writer.
 * Never delete this file: all contenders must lock the same inode. */
export async function acquireOwnership(databasePath: string) {
  await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 })
  const directory = await realpath(dirname(databasePath))
  const lock = ManagedRuntime.make(
    SqliteClient.layer({ filename: join(directory, `${basename(databasePath)}.ownership.sqlite`) }),
  )
  try {
    await lock.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient
        yield* sql.unsafe("PRAGMA busy_timeout = 0")
        yield* sql.unsafe("BEGIN EXCLUSIVE")
      }),
    )
    return () => lock.dispose()
  } catch (cause) {
    await lock.dispose()
    throw new Error("Another MeldShell host owns this data directory.", { cause })
  }
}
