import assert from "node:assert/strict"
import test from "node:test"
import { Schema } from "effect"
import { AppSettings, CustomTheme } from "@meldshell/contracts"
import {
  BUILT_IN_THEMES,
  DEFAULT_COLOR_THEME,
  contrastRatio,
  copyName,
  isDarkPalette,
  resolveColorTheme,
  themeStylesheet,
  themeTokens,
} from "../packages/ui/src/app/color-themes.ts"

test("MeldShell ships nine themes with valid, distinct palettes for both modes", () => {
  assert.equal(BUILT_IN_THEMES.length, 9)
  assert.equal(BUILT_IN_THEMES[0]?.id, DEFAULT_COLOR_THEME)
  assert.equal(new Set(BUILT_IN_THEMES.map((theme) => theme.id)).size, 9)
  assert.equal(new Set(BUILT_IN_THEMES.map((theme) => theme.name)).size, 9)
  for (const theme of BUILT_IN_THEMES) {
    // Built-in themes satisfy the same schema as the ones users save.
    Schema.decodeUnknownSync(CustomTheme)(theme)
    assert.ok(isDarkPalette(theme.dark), `${theme.name} dark`)
    assert.ok(!isDarkPalette(theme.light), `${theme.name} light`)
  }
})

test("every built-in palette keeps its text, accent, and status colours readable", () => {
  for (const theme of BUILT_IN_THEMES) {
    for (const mode of ["dark", "light"] as const) {
      const palette = theme[mode]
      const tokens = themeTokens(palette, mode)
      const where = `${theme.name} ${mode}`
      const on = (color: string | undefined) => contrastRatio(color ?? "", palette.background)
      assert.ok(on(tokens["--text-primary"]) >= 7, `${where} text`)
      assert.ok(on(tokens["--text-secondary"]) >= 4.5, `${where} secondary text`)
      assert.ok(on(tokens["--text-tertiary"]) >= 3.5, `${where} tertiary text`)
      assert.ok(on(palette.accent) >= 3, `${where} accent`)
      const button = contrastRatio(tokens["--accent-foreground"] ?? "", palette.accent)
      assert.ok(button >= 4.5, `${where} button text ${button.toFixed(2)}`)
      for (const status of ["added", "modified", "deleted", "renamed", "info"] as const) {
        assert.ok(on(palette[status]) >= 4.5, `${where} ${status} ${on(palette[status])}`)
      }
    }
  }
})

test("a missing or deleted theme falls back to the original look", () => {
  const custom = { ...BUILT_IN_THEMES[3]!, id: "custom-abc", name: "Mine" }
  assert.equal(resolveColorTheme({}).id, DEFAULT_COLOR_THEME)
  assert.equal(resolveColorTheme({ colorTheme: "ocean" }).name, "Ocean")
  assert.equal(resolveColorTheme({ colorTheme: "custom-abc", customThemes: [custom] }).name, "Mine")
  assert.equal(
    resolveColorTheme({ colorTheme: "custom-gone", customThemes: [custom] }).id,
    "meldshell",
  )
})

test("a theme's stylesheet covers both modes, Linux, and accessibility preferences", () => {
  const css = themeStylesheet(BUILT_IN_THEMES[4]!)
  assert.match(css, /^@layer base \{/)
  for (const mode of ["dark", "light"]) {
    assert.ok(css.includes(`:root[data-color-theme][data-theme="${mode}"] {`), mode)
    assert.ok(css.includes(`:root[data-platform="linux"][data-color-theme][data-theme="${mode}"]`))
  }
  assert.ok(css.includes("prefers-reduced-transparency"))
  assert.ok(css.includes("prefers-contrast: more"))
  assert.ok(!css.includes("NaN"))
})

test("copies get the next free number", () => {
  assert.equal(copyName("Ocean", ["Ocean"]), "Ocean 2")
  assert.equal(copyName("Ocean 2", ["Ocean", "Ocean 2"]), "Ocean 3")
})

test("settings reject malformed custom themes", () => {
  const decode = Schema.decodeUnknownSync(AppSettings)
  const theme = { ...BUILT_IN_THEMES[1]!, id: "custom-1" }
  assert.doesNotThrow(() => decode({ titleModelId: "current", customThemes: [theme] }))
  const bad = { ...theme, dark: { ...theme.dark, accent: "red" } }
  assert.throws(() => decode({ titleModelId: "current", customThemes: [bad] }))
})
