import type { AppSettings, CustomTheme, ThemePalette } from "@meldshell/contracts"

export type ThemeMode = "dark" | "light"

/** A colour theme: a name and a palette for each mode. Built-in themes share the custom shape. */
export interface ColorTheme {
  readonly id: string
  readonly name: string
  readonly dark: ThemePalette
  readonly light: ThemePalette
}

export const DEFAULT_COLOR_THEME = "meldshell"

/**
 * The themes MeldShell ships. The first is the original look, which the stylesheet draws itself;
 * the others replace its colour tokens with ones derived from their palettes.
 */
export const BUILT_IN_THEMES: ReadonlyArray<ColorTheme> = [
  {
    id: DEFAULT_COLOR_THEME,
    name: "MeldShell",
    dark: {
      background: "#161617",
      foreground: "#f2f2f3",
      accent: "#9eabf5",
      added: "#83c994",
      modified: "#e5bc75",
      deleted: "#ed9393",
      renamed: "#b8a1ed",
      info: "#88b9ed",
    },
    light: {
      background: "#e2e1dd",
      foreground: "#26262a",
      accent: "#4454ba",
      added: "#246b39",
      modified: "#845610",
      deleted: "#a83a42",
      renamed: "#7650af",
      info: "#24619f",
    },
  },
  {
    id: "graphite",
    name: "Graphite",
    dark: {
      background: "#141414",
      foreground: "#ededed",
      accent: "#dcdcdc",
      added: "#8fc79b",
      modified: "#dcbd80",
      deleted: "#e69a9a",
      renamed: "#b9aee0",
      info: "#9bbbe0",
    },
    light: {
      background: "#e4e4e4",
      foreground: "#1c1c1c",
      accent: "#222222",
      added: "#2c6a3c",
      modified: "#7d5813",
      deleted: "#a13b3f",
      renamed: "#6a52a3",
      info: "#2a5f94",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    dark: {
      background: "#060608",
      foreground: "#f5f5f8",
      accent: "#6fa6ff",
      added: "#6fd38f",
      modified: "#f0c46a",
      deleted: "#ff8a8f",
      renamed: "#bb9cff",
      info: "#69c0ff",
    },
    light: {
      background: "#f1f1f3",
      foreground: "#101014",
      accent: "#1d5bd6",
      added: "#16703a",
      modified: "#8a5a00",
      deleted: "#b42330",
      renamed: "#6a3fc0",
      info: "#0f62a8",
    },
  },
  {
    id: "arctic",
    name: "Arctic",
    dark: {
      background: "#1b2029",
      foreground: "#e6ebf2",
      accent: "#8cc4d6",
      added: "#a3c995",
      modified: "#e8cb8b",
      deleted: "#e0959b",
      renamed: "#bfa5d6",
      info: "#86a9d6",
    },
    light: {
      background: "#e2e7ee",
      foreground: "#1f2733",
      accent: "#2f6d8c",
      added: "#3a6b2e",
      modified: "#7d5d16",
      deleted: "#a33a44",
      renamed: "#74499a",
      info: "#2e5c96",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    dark: {
      background: "#0e1620",
      foreground: "#e5eef7",
      accent: "#57c7d6",
      added: "#7ccf9c",
      modified: "#e2bf78",
      deleted: "#ef8e98",
      renamed: "#b3a2f0",
      info: "#7db4f0",
    },
    light: {
      background: "#dce5ec",
      foreground: "#172431",
      accent: "#0f6a82",
      added: "#1e6c43",
      modified: "#7e570e",
      deleted: "#a3343e",
      renamed: "#6849ae",
      info: "#1e5ea3",
    },
  },
  {
    id: "forest",
    name: "Forest",
    dark: {
      background: "#111814",
      foreground: "#e7efe9",
      accent: "#7fd19f",
      added: "#93d3a1",
      modified: "#dcc07a",
      deleted: "#eb998e",
      renamed: "#b5a5e5",
      info: "#86bfd8",
    },
    light: {
      background: "#dee6dd",
      foreground: "#1e2a21",
      accent: "#2a7547",
      added: "#28693a",
      modified: "#7a5911",
      deleted: "#a13b39",
      renamed: "#6a4ea4",
      info: "#226588",
    },
  },
  {
    id: "ember",
    name: "Ember",
    dark: {
      background: "#1a1511",
      foreground: "#f4ece3",
      accent: "#f2a36a",
      added: "#a6ca8b",
      modified: "#e9c372",
      deleted: "#f08f80",
      renamed: "#d4a6df",
      info: "#90bfdf",
    },
    light: {
      background: "#ebe2d6",
      foreground: "#2d231b",
      accent: "#ab4f17",
      added: "#3b6925",
      modified: "#80570b",
      deleted: "#a4382a",
      renamed: "#824798",
      info: "#2a5f87",
    },
  },
  {
    id: "rose",
    name: "Rose",
    dark: {
      background: "#1b1418",
      foreground: "#f6eaf0",
      accent: "#f39bbe",
      added: "#9fd0a5",
      modified: "#e9c27c",
      deleted: "#f49595",
      renamed: "#c5a7f0",
      info: "#94bde9",
    },
    light: {
      background: "#eee1e6",
      foreground: "#2e1e26",
      accent: "#b0346a",
      added: "#2e6a3b",
      modified: "#83580f",
      deleted: "#a6313a",
      renamed: "#7847aa",
      info: "#295e9a",
    },
  },
  {
    id: "dusk",
    name: "Dusk",
    dark: {
      background: "#15121e",
      foreground: "#ede9f7",
      accent: "#b79df8",
      added: "#8fd1a6",
      modified: "#e8c483",
      deleted: "#f2949f",
      renamed: "#e0a2e6",
      info: "#8fb6f2",
    },
    light: {
      background: "#e3dfed",
      foreground: "#221c32",
      accent: "#6541c4",
      added: "#25683f",
      modified: "#7e5810",
      deleted: "#a5333f",
      renamed: "#8d3a96",
      info: "#2a5aa6",
    },
  },
]

/** The theme the settings choose; a removed custom theme falls back to the original look. */
export function resolveColorTheme(
  settings: Pick<AppSettings, "colorTheme" | "customThemes">,
): ColorTheme {
  const id = settings.colorTheme ?? DEFAULT_COLOR_THEME
  return (
    BUILT_IN_THEMES.find((theme) => theme.id === id) ??
    settings.customThemes?.find((theme) => theme.id === id) ??
    (BUILT_IN_THEMES[0] as ColorTheme)
  )
}

/** A new id for a custom theme, distinct from every built-in and saved one. */
export function newThemeId(existing: ReadonlyArray<CustomTheme>): string {
  for (;;) {
    const id = `custom-${Math.random().toString(36).slice(2, 10)}`
    if (!existing.some((theme) => theme.id === id)) return id
  }
}

/** A name for a copy of `name` that no other theme uses yet, such as "Ocean 2". */
export function copyName(name: string, taken: ReadonlyArray<string>): string {
  const base = name.replace(/\s+\d+$/, "").slice(0, 44)
  for (let index = 2; ; index++) {
    const candidate = `${base} ${index}`
    if (!taken.includes(candidate)) return candidate
  }
}

/* Colour arithmetic. Themes are stored as `#rrggbb`, so mixing happens in plain sRGB. */

type Rgb = readonly [number, number, number]

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

export function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (match === null) return null
  const digits =
    match[1]!.length === 3
      ? [...match[1]!].map((digit) => digit + digit).join("")
      : (match[1] as string)
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ]
}

const rgb = (hex: string): Rgb => parseHex(hex) ?? BLACK

/** `amount` of the way from `from` to `to`. */
const mix = (from: Rgb, to: Rgb, amount: number): Rgb => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
]

export const toHex = (color: Rgb): string =>
  `#${color.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`

const rgba = (color: Rgb, alpha: number | string): string =>
  `rgba(${color.map((part) => Math.round(part)).join(", ")}, ${alpha})`

/** WCAG relative luminance. */
function luminance(color: Rgb): number {
  const [red, green, blue] = color.map((part) => {
    const channel = part / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** WCAG contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(rgb(first)), luminance(rgb(second))].sort((a, b) => b - a) as [
    number,
    number,
  ]
  return (light + 0.05) / (dark + 0.05)
}

/** Whether a palette suits dark mode, judged by its background. */
export const isDarkPalette = (palette: ThemePalette): boolean =>
  luminance(rgb(palette.background)) < 0.18

/** Text on the accent: a deep shade of the accent on a light one, white on a dark one. */
function accentForeground(accent: Rgb): Rgb {
  const deep = mix(accent, BLACK, 0.9)
  return contrastRatio(toHex(deep), toHex(accent)) >= contrastRatio("#ffffff", toHex(accent))
    ? deep
    : WHITE
}

/** The secondary, tertiary, and disabled text strengths, as a share of the way to the foreground. */
const TEXT_LEVELS: Readonly<Record<ThemeMode, readonly [number, number, number]>> = {
  dark: [0.69, 0.56, 0.24],
  light: [0.79, 0.7, 0.4],
}

/**
 * Every colour token the stylesheet defines for a mode, derived from a palette. The proportions
 * follow the original MeldShell tokens, so a theme reads like the default with new colours.
 */
export function themeTokens(palette: ThemePalette, mode: ThemeMode): Record<string, string> {
  const background = rgb(palette.background)
  const foreground = rgb(palette.foreground)
  const accent = rgb(palette.accent)
  const dark = mode === "dark"
  const toward = (amount: number): string => toHex(mix(background, foreground, amount))
  const [secondary, tertiary, disabled] = TEXT_LEVELS[mode]
  const status = {
    red: rgb(palette.deleted),
    green: rgb(palette.added),
    yellow: rgb(palette.modified),
    blue: rgb(palette.info),
    magenta: rgb(palette.renamed),
    cyan: mix(rgb(palette.info), rgb(palette.added), 0.5),
  }
  // Bright ANSI colours step toward the text in dark mode and toward the page in light mode.
  const bright = (color: Rgb): string =>
    toHex(dark ? mix(color, foreground, 0.25) : mix(color, background, 0.15))
  const opacity = `var(--app-opacity-preview, var(--app-opacity, ${dark ? 0.88 : 0.94}))`
  return {
    "--scrim": rgba(background, opacity),
    "--surface-raised": dark
      ? rgba(mix(background, WHITE, 0.04), 0.774)
      : rgba(mix(background, WHITE, 0.34), 0.95),
    "--surface-overlay": dark
      ? rgba(mix(background, WHITE, 0.017), 0.81)
      : rgba(mix(background, WHITE, 0.2), 0.98),
    "--surface-menu": dark
      ? rgba(mix(background, WHITE, 0.055), 0.96)
      : rgba(mix(background, WHITE, 0.41), 0.97),
    "--surface-hover": rgba(foreground, dark ? 0.0405 : 0.05),
    "--surface-active": rgba(foreground, dark ? 0.0675 : 0.085),
    "--surface-selected": rgba(foreground, dark ? 0.0558 : 0.07),
    "--line-subtle": rgba(foreground, dark ? 0.055 : 0.08),
    "--line": rgba(foreground, dark ? 0.09 : 0.13),
    "--line-strong": rgba(foreground, dark ? 0.17 : 0.25),
    "--text-primary": toHex(foreground),
    "--text-secondary": toward(secondary),
    "--text-tertiary": toward(tertiary),
    "--text-disabled": toward(disabled),
    "--accent": toHex(accent),
    "--accent-hover": toHex(dark ? mix(accent, WHITE, 0.2) : mix(accent, BLACK, 0.14)),
    "--accent-foreground": toHex(accentForeground(accent)),
    "--focus-ring": rgba(accent, dark ? 0.72 : 0.65),
    "--color-added": palette.added,
    "--color-modified": palette.modified,
    "--color-deleted": palette.deleted,
    "--color-renamed": palette.renamed,
    "--color-info": palette.info,
    "--terminal-black": toward(dark ? 0.1 : 0.9),
    "--terminal-cyan": toHex(status.cyan),
    "--terminal-white": dark ? "var(--text-secondary)" : toward(0.62),
    "--terminal-bright-black": toward(dark ? 0.43 : 0.61),
    "--terminal-bright-red": bright(status.red),
    "--terminal-bright-green": bright(status.green),
    "--terminal-bright-yellow": bright(status.yellow),
    "--terminal-bright-blue": bright(status.blue),
    "--terminal-bright-magenta": bright(status.magenta),
    "--terminal-bright-cyan": bright(status.cyan),
    "--terminal-bright-white": dark ? "var(--text-primary)" : toward(0.5),
    ...(dark
      ? {}
      : {
          "--shadow-popup": `0 8px 28px ${rgba(foreground, 0.16)}, 0 0 0 1px ${rgba(foreground, 0.08)}`,
          "--shadow-raised": `0 4px 16px ${rgba(foreground, 0.1)}`,
        }),
  }
}

const declarations = (tokens: Record<string, string>): string =>
  Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ")

/**
 * The stylesheet that puts a theme's palettes in place of the default tokens. It joins the base
 * layer after the main stylesheet, so its rules replace the defaults with equal or higher
 * specificity, and it repeats the default's platform and accessibility adjustments.
 */
export function themeStylesheet(theme: ColorTheme): string {
  const rules: Array<string> = []
  for (const mode of ["dark", "light"] as const) {
    const palette = theme[mode]
    const root = `:root[data-color-theme][data-theme="${mode}"]`
    const background = rgb(palette.background)
    const foreground = rgb(palette.foreground)
    const dark = mode === "dark"
    rules.push(`${root} { ${declarations(themeTokens(palette, mode))} }`)
    rules.push(`:root[data-platform="linux"]${root.slice(5)} { --scrim: ${palette.background}; }`)
    rules.push(
      `@media (prefers-reduced-transparency: reduce) { ${root} { ${declarations({
        "--scrim": toHex(dark ? mix(background, BLACK, 0.36) : background),
        "--surface-raised": toHex(mix(background, WHITE, dark ? 0.03 : 0.34)),
        "--surface-overlay": toHex(mix(background, WHITE, dark ? 0.016 : 0.2)),
      })} } }`,
    )
    rules.push(
      `@media (prefers-contrast: more) { ${root} { ${declarations({
        "--line-subtle": rgba(foreground, dark ? 0.16 : 0.2),
        "--line": rgba(foreground, dark ? 0.3 : 0.36),
        "--line-strong": rgba(foreground, dark ? 0.52 : 0.6),
        "--text-secondary": toHex(mix(background, foreground, 0.85)),
        "--text-tertiary": toHex(mix(background, foreground, 0.72)),
      })} } }`,
    )
  }
  return `@layer base { ${rules.join("\n")} }`
}
