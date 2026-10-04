import type { AppSettings, ThemePalette } from "@meldshell/contracts"
import { Monitor, Moon, Sun } from "lucide-react"
import type { ReactNode } from "react"
import { toHex, parseHex, type ColorTheme } from "../app/color-themes"

type Theme = NonNullable<AppSettings["theme"]>

export const THEMES: ReadonlyArray<{ value: Theme; label: string; icon: ReactNode }> = [
  { value: "dark", label: "Dark", icon: <Moon size={13} strokeWidth={1.75} /> },
  { value: "light", label: "Light", icon: <Sun size={13} strokeWidth={1.75} /> },
  { value: "system", label: "System", icon: <Monitor size={13} strokeWidth={1.75} /> },
]

/** `amount` of the way from the palette's background to its text. */
function toward(palette: ThemePalette, amount: number): string {
  const from = parseHex(palette.background) ?? [0, 0, 0]
  const to = parseHex(palette.foreground) ?? [255, 255, 255]
  return toHex([
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ])
}

/** A miniature MeldShell window in a palette's own colours: inbox, transcript, and composer. */
export function MiniWindow({
  palette,
  detailed = false,
}: {
  readonly palette: ThemePalette
  /** Adds a changed-lines card in the status colours, for larger previews. */
  readonly detailed?: boolean
}) {
  const side = toward(palette, 0.05)
  const line = toward(palette, 0.16)
  const strong = toward(palette, 0.32)
  return (
    <span
      className="grid h-full grid-cols-[28%_1fr] gap-[6px] p-[7px]"
      style={{ background: palette.background }}
    >
      <span
        className="grid content-start gap-[4px] p-[5px] rounded-[4px]"
        style={{ background: side }}
      >
        <span className="h-[5px] rounded-[2px]" style={{ background: palette.accent }} />
        <span className="h-[4px] w-[80%] rounded-[2px]" style={{ background: line }} />
        <span className="h-[4px] w-[60%] rounded-[2px]" style={{ background: line }} />
        {detailed && (
          <>
            <span className="h-[4px] w-[70%] rounded-[2px]" style={{ background: line }} />
            <span className="h-[4px] w-[50%] rounded-[2px]" style={{ background: line }} />
          </>
        )}
      </span>
      <span className="grid content-end gap-[5px]">
        <span className="h-[4px] w-[70%] rounded-[2px]" style={{ background: strong }} />
        <span className="h-[4px] w-[45%] rounded-[2px]" style={{ background: line }} />
        {detailed && (
          <span
            className="grid gap-[3px] p-[5px] rounded-[4px] border-[1px]"
            style={{ borderColor: line, background: side }}
          >
            <span className="h-[3px] w-[60%] rounded-[2px]" style={{ background: palette.added }} />
            <span
              className="h-[3px] w-[40%] rounded-[2px]"
              style={{ background: palette.deleted }}
            />
            <span
              className="h-[3px] w-[52%] rounded-[2px]"
              style={{ background: palette.modified }}
            />
          </span>
        )}
        <span
          className="flex h-[16px] items-center justify-end rounded-[4px] border-[1px] pr-[3px]"
          style={{ borderColor: line }}
        >
          <span className="h-[8px] w-[8px] rounded-[3px]" style={{ background: palette.accent }} />
        </span>
      </span>
    </span>
  )
}

/** A theme in a mode, or split diagonally between its dark and light palettes for System. */
export function ThemePreview({ theme, colors }: { theme: Theme; colors: ColorTheme }) {
  if (theme !== "system") return <MiniWindow palette={colors[theme]} />
  return <SplitPreview colors={colors} />
}

/** Both of a theme's palettes at once: dark above the diagonal, light below. */
export function SplitPreview({ colors }: { colors: ColorTheme }) {
  return (
    <span className="relative block h-full">
      <MiniWindow palette={colors.dark} />
      <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
        <MiniWindow palette={colors.light} />
      </span>
    </span>
  )
}

export const TEXT_SIZES = [
  { value: "small", label: "Small", size: 13 },
  { value: "medium", label: "Medium", size: 17 },
  { value: "large", label: "Large", size: 21 },
] as const
