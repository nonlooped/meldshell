import { useEffect } from "react"
import { create } from "zustand"
import type { AppSettings } from "@meldshell/contracts"
import {
  DEFAULT_COLOR_THEME,
  resolveColorTheme,
  themeStylesheet,
  type ColorTheme,
  type ThemeMode,
} from "./color-themes"

/** A theme being edited, shown across the whole app in the mode being edited until it closes. */
export const useThemeDraft = create<{
  readonly draft: { readonly theme: ColorTheme; readonly mode: ThemeMode } | null
}>(() => ({ draft: null }))

const STYLE_ID = "meldshell-color-theme"

/** Puts a theme's tokens in place, or removes them for the default look the stylesheet draws. */
function applyColorTheme(theme: ColorTheme | null): void {
  const root = document.documentElement
  let style = document.getElementById(STYLE_ID)
  if (theme === null) {
    style?.remove()
    delete root.dataset.colorTheme
    return
  }
  const css = themeStylesheet(theme)
  if (style === null) {
    style = Object.assign(document.createElement("style"), { id: STYLE_ID })
    document.head.append(style)
  }
  if (style.textContent !== css) style.textContent = css
  // The attribute changes with the palette, so terminals that watch it redraw in the new colours.
  root.dataset.colorTheme = `${theme.id}:${hash(css)}`
}

function hash(text: string): string {
  let value = 0
  for (let index = 0; index < text.length; index++)
    value = (Math.imul(value, 31) + text.charCodeAt(index)) | 0
  return (value >>> 0).toString(36)
}

export function useAppAppearance(settings: AppSettings) {
  const draft = useThemeDraft((state) => state.draft)
  const draftMode = draft?.mode
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)")
    const applyTheme = (): void => {
      document.documentElement.dataset.theme =
        draftMode ??
        (settings.theme === "light" || (settings.theme === "system" && media.matches)
          ? "light"
          : "dark")
    }
    applyTheme()
    media.addEventListener("change", applyTheme)
    return () => media.removeEventListener("change", applyTheme)
  }, [settings.theme, draftMode])
  const colorTheme = draft?.theme ?? resolveColorTheme(settings)
  useEffect(() => {
    applyColorTheme(colorTheme.id === DEFAULT_COLOR_THEME ? null : colorTheme)
  }, [colorTheme])
  useEffect(() => {
    document.documentElement.dataset.textSize = settings.transcriptSize ?? "medium"
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion ?? false)
  }, [settings.transcriptSize, settings.reduceMotion])

  useEffect(() => {
    if (settings.opacity === undefined) {
      document.documentElement.style.removeProperty("--app-opacity")
    } else {
      document.documentElement.style.setProperty("--app-opacity", String(settings.opacity / 100))
    }
  }, [settings.opacity])
}
