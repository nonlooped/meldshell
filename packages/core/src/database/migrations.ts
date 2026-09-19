import * as SqlClient from "@effect/sql/SqlClient"
import { Effect } from "effect"
import { repairWorkspacePaths } from "./workspace-paths"

// Version 1 was only a marker. Version 2 applies the legacy upgrade once, including databases carrying that marker.
const legacySchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_opened_at TEXT NOT NULL
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'settled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      title_locked INTEGER NOT NULL DEFAULT 0
    )
  `
  const threadColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(threads)`
  if (!threadColumns.some((column) => column.name === "pinned")) {
    yield* sql`ALTER TABLE threads ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`
  }
  if (!threadColumns.some((column) => column.name === "title_locked")) {
    yield* sql`ALTER TABLE threads ADD COLUMN title_locked INTEGER NOT NULL DEFAULT 0`
  }
  yield* sql`
    CREATE INDEX IF NOT EXISTS threads_status_updated_idx
    ON threads(status, updated_at DESC)
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      harness TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      built_in INTEGER NOT NULL DEFAULT 0
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS provider_models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      display_name TEXT NOT NULL,
      reasoning_efforts TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      supports_fast INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      hidden INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      built_in INTEGER NOT NULL DEFAULT 0,
      UNIQUE (provider_id, slug)
    )
  `
  const modelColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(provider_models)`
  if (!modelColumns.some((column) => column.name === "metadata")) {
    yield* sql`ALTER TABLE provider_models ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'`
  }
  yield* sql`
    CREATE TABLE IF NOT EXISTS thread_settings (
      thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE CASCADE,
      reasoning_effort TEXT,
      speed TEXT NOT NULL DEFAULT 'standard' CHECK (speed IN ('standard', 'fast')),
      mode TEXT NOT NULL DEFAULT 'default',
      sandbox TEXT NOT NULL DEFAULT 'workspace-write',
      approval_policy TEXT NOT NULL DEFAULT 'on-request'
    )
  `
  const settingColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(thread_settings)`
  const columnNames = new Set(settingColumns.map((column) => column.name))
  if (!columnNames.has("mode")) {
    yield* sql`ALTER TABLE thread_settings ADD COLUMN mode TEXT NOT NULL DEFAULT 'default'`
  }
  if (!columnNames.has("sandbox")) {
    yield* sql`
      ALTER TABLE thread_settings ADD COLUMN sandbox TEXT NOT NULL DEFAULT 'workspace-write'
    `
  }
  if (!columnNames.has("approval_policy")) {
    yield* sql`
      ALTER TABLE thread_settings ADD COLUMN approval_policy TEXT NOT NULL DEFAULT 'on-request'
    `
  }
  yield* sql`
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      harness TEXT NOT NULL,
      model TEXT NOT NULL,
      reasoning_effort TEXT,
      speed TEXT NOT NULL CHECK (speed IN ('standard', 'fast')),
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'interrupted')),
      native_turn_id TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT
    )
  `
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS one_running_turn_per_thread
    ON turns(thread_id) WHERE status = 'running'
  `
  yield* sql`
    CREATE INDEX IF NOT EXISTS turns_thread_started_idx
    ON turns(thread_id, started_at DESC)
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      turn_id TEXT REFERENCES turns(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      kind TEXT NOT NULL,
      method TEXT NOT NULL,
      text TEXT,
      provider_data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(thread_id, sequence)
    )
  `
  yield* sql`
    CREATE INDEX IF NOT EXISTS events_thread_sequence_idx
    ON events(thread_id, sequence DESC)
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS queued_inputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      attachments TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `
  yield* sql`
    CREATE INDEX IF NOT EXISTS queued_inputs_thread_id_idx
    ON queued_inputs(thread_id, id)
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS provider_sessions (
      thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      harness TEXT NOT NULL,
      native_thread_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      method TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(request_id)
    )
  `
  // Index the same complete messages displayed in the transcript, not individual stream chunks.
  yield* sql`DROP TRIGGER IF EXISTS transcript_search_insert`
  yield* sql`DROP TRIGGER IF EXISTS transcript_search_delete`
  yield* sql`DROP TRIGGER IF EXISTS transcript_search_update`
  yield* sql`DROP TABLE IF EXISTS transcript_search`
  const searchTable = yield* sql`SELECT name FROM sqlite_master WHERE name = 'transcript_documents'`
  yield* sql`CREATE TABLE IF NOT EXISTS transcript_documents (
    id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL, turn_id TEXT, text TEXT NOT NULL, created_at TEXT NOT NULL
  )`
  yield* sql`CREATE INDEX IF NOT EXISTS transcript_documents_turn_idx ON transcript_documents(thread_id, turn_id)`
  yield* sql`CREATE VIRTUAL TABLE IF NOT EXISTS transcript_document_search USING fts5(text, content='transcript_documents', content_rowid='rowid', tokenize='unicode61')`
  yield* sql`CREATE TRIGGER IF NOT EXISTS transcript_documents_insert AFTER INSERT ON transcript_documents BEGIN
    INSERT INTO transcript_document_search(rowid, text) VALUES (new.rowid, new.text);
  END`
  yield* sql`CREATE TRIGGER IF NOT EXISTS transcript_documents_delete AFTER DELETE ON transcript_documents BEGIN
    INSERT INTO transcript_document_search(transcript_document_search, rowid, text) VALUES ('delete', old.rowid, old.text);
  END`
  yield* sql`CREATE TABLE IF NOT EXISTS transcript_search_dirty (
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    turn_key TEXT NOT NULL, PRIMARY KEY(thread_id, turn_key)
  )`
  yield* sql`CREATE TRIGGER IF NOT EXISTS transcript_search_dirty_insert AFTER INSERT ON events BEGIN
    INSERT OR IGNORE INTO transcript_search_dirty(thread_id, turn_key) VALUES (new.thread_id, COALESCE(new.turn_id, ''));
  END`
  if (searchTable.length === 0)
    yield* sql`INSERT OR IGNORE INTO transcript_search_dirty(thread_id, turn_key)
    SELECT thread_id, COALESCE(turn_id, '') FROM events`
})

const preserveSettings = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE thread_settings_new (
    thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id TEXT REFERENCES provider_models(id) ON DELETE SET NULL,
    reasoning_effort TEXT, speed TEXT NOT NULL DEFAULT 'standard' CHECK (speed IN ('standard', 'fast')),
    mode TEXT NOT NULL DEFAULT 'default', sandbox TEXT NOT NULL DEFAULT 'workspace-write',
    approval_policy TEXT NOT NULL DEFAULT 'on-request'
  )`
  yield* sql`INSERT INTO thread_settings_new SELECT thread_id, provider_id, model_id, reasoning_effort, speed, mode, sandbox, approval_policy FROM thread_settings`
  yield* sql`DROP TABLE thread_settings`
  yield* sql`ALTER TABLE thread_settings_new RENAME TO thread_settings`
  yield* sql`ALTER TABLE approvals ADD COLUMN request_data TEXT NOT NULL DEFAULT '{}'`
  yield* sql`ALTER TABLE turns ADD COLUMN worker_generation TEXT`
  yield* sql`ALTER TABLE provider_models ADD COLUMN efforts_override TEXT`
  yield* sql`ALTER TABLE provider_models ADD COLUMN fast_override INTEGER`
})

export const runMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`
  const applied = yield* sql<{ version: number }>`SELECT version FROM schema_migrations`
  const migrations = [
    { version: 2, apply: legacySchema },
    { version: 3, apply: preserveSettings },
    {
      version: 4,
      apply: Effect.gen(function* () {
        yield* sql`CREATE TABLE provider_sessions_new (
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        provider TEXT NOT NULL, harness TEXT NOT NULL, native_thread_id TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY(thread_id, harness), UNIQUE(harness, native_thread_id)
      )`
        yield* sql`INSERT INTO provider_sessions_new SELECT * FROM provider_sessions`
        yield* sql`DROP TABLE provider_sessions`
        yield* sql`ALTER TABLE provider_sessions_new RENAME TO provider_sessions`
      }),
    },
    {
      version: 5,
      apply: Effect.gen(function* () {
        // Provider names were frozen at insert, so renamed families kept their first spelling.
        yield* sql`ALTER TABLE provider_models ADD COLUMN name_override TEXT`
        yield* sql`
          UPDATE provider_models
          SET display_name = json_extract(metadata, '$.displayName')
          WHERE built_in = 1 AND json_extract(metadata, '$.displayName') IS NOT NULL
        `
      }),
    },
    {
      version: 6,
      apply: Effect.gen(function* () {
        yield* sql`CREATE INDEX threads_page_idx ON threads(
          CASE WHEN pinned = 1 THEN 0 WHEN status = 'active' THEN 1 ELSE 2 END,
          updated_at DESC, id DESC
        )`
        yield* sql`CREATE INDEX approvals_thread_idx ON approvals(thread_id)`
      }),
    },
    { version: 7, apply: repairWorkspacePaths },
  ]
  const pending = migrations.filter(
    (migration) => !applied.some((row) => row.version === migration.version),
  )
  const existing = yield* sql`SELECT name FROM sqlite_master WHERE name = 'threads'`
  if (pending.length > 0 && existing.length > 0) {
    const databases = yield* sql<{ name: string; file: string }>`PRAGMA database_list`
    const file = databases.find((database) => database.name === "main")?.file
    if (file) yield* sql`VACUUM INTO ${`${file}.backup-${Date.now()}`}`
  }
  for (const migration of pending) {
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* migration.apply
        yield* sql`INSERT INTO schema_migrations(version, applied_at) VALUES (${migration.version}, ${new Date().toISOString()})`
      }),
    )
  }
})
