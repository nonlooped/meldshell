import * as SqlClient from "@effect/sql/SqlClient"
import {
  type AppSettings,
  type SetAppSettingsInput,
  CURRENT_TITLE_MODEL,
  AppOpacity,
} from "@meldshell/contracts"
import { Effect, Schema } from "effect"

import { getSnapshot } from "./snapshots"

const TITLE_MODEL_SETTING = "title_model_id"

export const readAppSettings = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ readonly value: string }>`
    SELECT value FROM settings WHERE key = ${TITLE_MODEL_SETTING}
  `
  const preferences = yield* sql<{
    readonly key: string
    readonly value: string
  }>`SELECT key, value FROM settings WHERE key != ${TITLE_MODEL_SETTING}`
  const values = new Map(preferences.map((row) => [row.key, row.value]))
  const opacity = Number(values.get("opacity"))
  return {
    opacity: Schema.is(AppOpacity)(opacity) ? opacity : undefined,
    titleModelId: rows[0]?.value ?? CURRENT_TITLE_MODEL,
    showSettled: values.get("showSettled") !== "false",
    theme:
      values.get("theme") === "light"
        ? "light"
        : values.get("theme") === "system"
          ? "system"
          : "dark",
    transcriptSize:
      values.get("transcriptSize") === "large"
        ? "large"
        : values.get("transcriptSize") === "small"
          ? "small"
          : "medium",
    reduceMotion: values.get("reduceMotion") === "true",
    sounds: values.get("sounds") !== "false",
  } satisfies AppSettings
})

export const setAppSettings = (input: SetAppSettingsInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const key of [
      "opacity",
      "showSettled",
      "theme",
      "transcriptSize",
      "reduceMotion",
      "sounds",
    ] as const) {
      if (input[key] !== undefined) {
        yield* sql`INSERT INTO settings (key, value) VALUES (${key}, ${String(input[key])})
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      }
    }
    const titleModelId = input.titleModelId?.trim()
    if (titleModelId !== undefined && titleModelId !== "") {
      yield* sql`
        INSERT INTO settings (key, value)
        VALUES (${TITLE_MODEL_SETTING}, ${titleModelId})
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
    }
    return yield* getSnapshot
  })
