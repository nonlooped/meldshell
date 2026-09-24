import type { ITheme } from "@xterm/xterm"

/*
 * xterm draws with concrete colours, so the terminal theme is read from the renderer's tokens and
 * read again whenever the theme, text size, or app scale changes.
 */

let probe: HTMLSpanElement | undefined
let canvas: CanvasRenderingContext2D | null | undefined

/** Resolves any CSS colour — tokens, `color-mix()`, named colours — to an `rgba()` xterm parses. */
function resolveColor(value: string): string {
  probe ??= Object.assign(document.createElement("span"), { hidden: true })
  if (!probe.isConnected) document.body.append(probe)
  probe.style.color = ""
  probe.style.color = value
  const computed = getComputedStyle(probe).color
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (!canvas) return computed
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = computed
  canvas.fillRect(0, 0, 1, 1)
  const [red, green, blue, alpha] = canvas.getImageData(0, 0, 1, 1).data
  return `rgba(${red}, ${green}, ${blue}, ${((alpha ?? 255) / 255).toFixed(3)})`
}

const token = (name: string) => resolveColor(`var(${name})`)

export function terminalTheme(): ITheme {
  return {
    background: "rgba(0, 0, 0, 0)",
    foreground: token("--text-primary"),
    cursor: token("--accent"),
    cursorAccent: token("--accent-foreground"),
    selectionBackground: resolveColor("color-mix(in srgb, var(--accent) 30%, transparent)"),
    selectionInactiveBackground: resolveColor(
      "color-mix(in srgb, var(--text-tertiary) 22%, transparent)",
    ),
    scrollbarSliderBackground: token("--scrollbar-thumb"),
    scrollbarSliderHoverBackground: token("--scrollbar-thumb-hover"),
    scrollbarSliderActiveBackground: token("--scrollbar-thumb-active"),
    black: token("--terminal-black"),
    red: token("--terminal-red"),
    green: token("--terminal-green"),
    yellow: token("--terminal-yellow"),
    blue: token("--terminal-blue"),
    magenta: token("--terminal-magenta"),
    cyan: token("--terminal-cyan"),
    white: token("--terminal-white"),
    brightBlack: token("--terminal-bright-black"),
    brightRed: token("--terminal-bright-red"),
    brightGreen: token("--terminal-bright-green"),
    brightYellow: token("--terminal-bright-yellow"),
    brightBlue: token("--terminal-bright-blue"),
    brightMagenta: token("--terminal-bright-magenta"),
    brightCyan: token("--terminal-bright-cyan"),
    brightWhite: token("--terminal-bright-white"),
  }
}

export const terminalFontFamily = (): string =>
  getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace"

const textSizes: Readonly<Record<string, number>> = { small: 11.5, medium: 12.5, large: 14 }

/**
 * Terminal panes undo the app scale's CSS zoom, which xterm's pointer maths does not expect, and
 * scale their font instead so they still grow and shrink with the rest of the window.
 */
function appScale(): number {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--app-scale"),
  )
  return Number.isFinite(value) && value > 0 ? value : 1
}

export function terminalFontSize(): number {
  const base = textSizes[document.documentElement.dataset.textSize ?? "medium"] ?? 12.5
  return Math.round(base * appScale() * 2) / 2
}

/** Calls `onChange` whenever a terminal's colours or metrics may have changed. */
export function watchAppearance(onChange: () => void): () => void {
  let frame = 0
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(onChange)
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-text-size", "style"],
  })
  const contrast = window.matchMedia("(prefers-contrast: more)")
  contrast.addEventListener("change", onChange)
  return () => {
    observer.disconnect()
    contrast.removeEventListener("change", onChange)
    cancelAnimationFrame(frame)
  }
}
