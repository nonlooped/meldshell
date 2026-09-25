import * as SqlClient from "@effect/sql/SqlClient"
import { Effect } from "effect"

/** Runs an effect in one SQLite transaction. Kept free of other imports, so any module may use it. */
export const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(effect))
