import type { AppSettings } from "@meldshell/contracts"
import { Monitor, Moon, Sun } from "lucide-react"
import type { ReactNode } from "react"

type Theme = NonNullable<AppSettings["theme"]>

export const THEMES: ReadonlyArray<{ value: Theme; label: string; icon: ReactNode }> = [
  { value: "dark", label: "Dark", icon: <Moon size={13} strokeWidth={1.75} /> },
  { value: "light", label: "Light", icon: <Sun size={13} strokeWidth={1.75} /> },
  { value: "system", label: "System", icon: <Monitor size={13} strokeWidth={1.75} /> },
]

const PALETTES = {
  dark: { base: "#18181a", side: "#232326", line: "#38383d", accent: "#9eabf5" },
  light: { base: "#ecebe8", side: "#e0dfdb", line: "#c6c5c0", accent: "#4555c4" },
} as const

/** A miniature MeldShell window in a theme's own colours: inbox, transcript, and composer. */
function MiniWindow({ variant }: { variant: keyof typeof PALETTES }) {
  const color = PALETTES[variant]
  return (
    <span
      className="grid h-full grid-cols-[28%_1fr] gap-[6px] p-[7px]"
      style={{ background: color.base }}
    >
      <span
        className="grid content-start gap-[4px] p-[5px] rounded-[4px]"
        style={{ background: color.side }}
      >
        <span className="h-[5px] rounded-[2px]" style={{ background: color.accent }} />
        <span className="h-[4px] w-[80%] rounded-[2px]" style={{ background: color.line }} />
        <span className="h-[4px] w-[60%] rounded-[2px]" style={{ background: color.line }} />
      </span>
      <span className="grid content-end gap-[5px]">
        <span className="h-[4px] w-[70%] rounded-[2px]" style={{ background: color.line }} />
        <span className="h-[4px] w-[45%] rounded-[2px]" style={{ background: color.line }} />
        <span className="h-[16px] rounded-[4px] border-[1px]" style={{ borderColor: color.line }} />
      </span>
    </span>
  )
}

export function ThemePreview({ theme }: { theme: Theme }) {
  if (theme !== "system") return <MiniWindow variant={theme} />
  return (
    <span className="relative block h-full">
      <MiniWindow variant="dark" />
      <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
        <MiniWindow variant="light" />
      </span>
    </span>
  )
}

export const TEXT_SIZES = [
  { value: "small", label: "Small", size: 13 },
  { value: "medium", label: "Medium", size: 17 },
  { value: "large", label: "Large", size: 21 },
] as const
