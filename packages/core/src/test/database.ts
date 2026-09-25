import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"

/** Each test provides this layer independently, so state and connections never leak between tests. */
export const TestDatabase = SqliteClient.layer({ filename: ":memory:" })
