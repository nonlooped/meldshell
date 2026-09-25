import assert from "node:assert/strict"
import { it } from "@effect/vitest"
import { TestDatabase } from "./test/database"
import * as SqlClient from "@effect/sql/SqlClient"
import { Effect } from "effect"
import { runMigrations } from "./database/migrations"
import { readAppSettings, setAppSettings } from "./settings"

const defaults = {
  opacity: undefined,
  titleModelId: "current",
  showSettled: true,
  theme: "dark",
  transcriptSize: "medium",
  reduceMotion: false,
  sounds: true,
  editor: undefined,
  keybindings: undefined,
}

it.effect(
  "settings preserve defaults, round-trip preferences, and leave omitted values alone",
  () =>
    Effect.gen(function* () {
      yield* runMigrations
      assert.deepEqual(yield* readAppSettings, defaults)
      const preferences = {
        opacity: 75,
        titleModelId: "custom-model",
        showSettled: false,
        theme: "system" as const,
        transcriptSize: "large" as const,
        reduceMotion: true,
        sounds: false,
        editor: "code",
        keybindings: { send: "Ctrl+Enter" },
      }
      const snapshot = yield* setAppSettings({ ...preferences, titleModelId: "  custom-model  " })
      assert.deepEqual(snapshot.settings, preferences)
      yield* setAppSettings({ theme: "light", titleModelId: "  " })
      assert.deepEqual(yield* readAppSettings, { ...preferences, theme: "light" })
    }).pipe(Effect.provide(TestDatabase)),
)

it.effect("invalid stored preferences fall back to defaults", () =>
  Effect.gen(function* () {
    yield* Effect.gen(function* () {
      yield* runMigrations
      const sql = yield* SqlClient.SqlClient
      for (const key of [
        "opacity",
        "showSettled",
        "theme",
        "transcriptSize",
        "reduceMotion",
        "sounds",
        "keybindings",
      ])
        yield* sql`INSERT INTO settings (key, value) VALUES (${key}, 'invalid')`
    })
    assert.deepEqual(yield* readAppSettings, defaults)
  }).pipe(Effect.provide(TestDatabase)),
)
