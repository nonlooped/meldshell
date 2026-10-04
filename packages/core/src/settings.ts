import * as SqlClient from "effect/sql/SqlClient"
import {
  AppOpacity,
  DictationModel,
  FollowUpDelivery,
  CURRENT_TITLE_MODEL,
  CustomThemes,
  Loadouts,
  Theme,
  TranscriptSize,
  type AppSettings,
  type SetAppSettingsInput,
} from "@meldshell/contracts"
import { Effect, Option, Schema } from "effect"
import { getSnapshot } from "./snapshots"

const TITLE_MODEL_SETTING = "title_model_id"
const KEYBINDINGS_SETTING = "keybindings"
const LOADOUTS_SETTING = "loadouts"
const CUSTOM_THEMES_SETTING = "custom_themes"
const SHUTTING_DOWN_SETTING = "shutting_down"

/** Preferences stored as strings, one row each, in the order `setAppSettings` accepts them. */
const PREFERENCES = [
  "alwaysFullPermissions",
  "followUpMode",
  "opacity",
  "showSettled",
  "theme",
  "colorTheme",
  "transcriptSize",
  "reduceMotion",
  "sounds",
  "dictationModel",
  "editor",
  "onboarded",
] as const

const Keybindings = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String))
const StoredLoadouts = Schema.fromJsonString(Loadouts)
const StoredCustomThemes = Schema.fromJsonString(CustomThemes)
// Settings store literal strings; reject malformed booleans before applying defaults.
const StoredBoolean = Schema.Literals(["true", "false"]).transform([true, false])
const Opacity = Schema.NumberFromString.pipe(Schema.decodeTo(AppOpacity))

/** A stored value that is missing or no longer decodes reads as undefined, so its default applies. */
const stored = <A, I extends string>(
  schema: Schema.Codec<A, I>,
  value: string | undefined,
): A | undefined =>
  value === undefined ? undefined : Option.getOrUndefined(Schema.decodeUnknownOption(schema)(value))

const upsert = (key: string, value: string) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )

export const readAppSettings = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ readonly key: string; readonly value: string }>`
    SELECT key, value FROM settings
  `
  const values = new Map(rows.map((row) => [row.key, row.value]))
  return {
    alwaysFullPermissions: stored(StoredBoolean, values.get("alwaysFullPermissions")) ?? false,
    followUpMode: stored(FollowUpDelivery, values.get("followUpMode")) ?? "queue",
    opacity: stored(Opacity, values.get("opacity")),
    titleModelId: values.get(TITLE_MODEL_SETTING) ?? CURRENT_TITLE_MODEL,
    showSettled: stored(StoredBoolean, values.get("showSettled")) ?? true,
    theme: stored(Theme, values.get("theme")) ?? "dark",
    colorTheme: values.get("colorTheme") ?? "meldshell",
    customThemes: stored(StoredCustomThemes, values.get(CUSTOM_THEMES_SETTING)) ?? [],
    transcriptSize: stored(TranscriptSize, values.get("transcriptSize")) ?? "medium",
    reduceMotion: stored(StoredBoolean, values.get("reduceMotion")) ?? false,
    sounds: stored(StoredBoolean, values.get("sounds")) ?? true,
    dictationModel: stored(DictationModel, values.get("dictationModel")) ?? "fast",
    editor: values.get("editor"),
    onboarded: stored(StoredBoolean, values.get("onboarded")) ?? false,
    keybindings: stored(Keybindings, values.get(KEYBINDINGS_SETTING)),
    loadouts: stored(StoredLoadouts, values.get(LOADOUTS_SETTING)) ?? [],
  } satisfies AppSettings
})

export const setAppSettings = (input: SetAppSettingsInput) =>
  Effect.gen(function* () {
    for (const key of PREFERENCES) {
      const value = input[key]
      if (value !== undefined) yield* upsert(key, String(value))
    }
    if (input.keybindings !== undefined)
      yield* upsert(KEYBINDINGS_SETTING, JSON.stringify(input.keybindings))
    if (input.loadouts !== undefined)
      yield* upsert(LOADOUTS_SETTING, JSON.stringify(input.loadouts))
    if (input.customThemes !== undefined)
      yield* upsert(CUSTOM_THEMES_SETTING, JSON.stringify(input.customThemes))
    const titleModelId = input.titleModelId?.trim()
    if (titleModelId) yield* upsert(TITLE_MODEL_SETTING, titleModelId)
    return yield* getSnapshot
  })

/** Whether MeldShell has begun shutting down, after which no new turn starts. */
export const isShuttingDown = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`SELECT 1 FROM settings WHERE key = ${SHUTTING_DOWN_SETTING} AND value = 'true'`.pipe(
    Effect.map((rows) => rows.length > 0),
  ),
)

export const markShuttingDown = upsert(SHUTTING_DOWN_SETTING, "true")

export const clearShuttingDown = Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`DELETE FROM settings WHERE key = ${SHUTTING_DOWN_SETTING}`,
)
