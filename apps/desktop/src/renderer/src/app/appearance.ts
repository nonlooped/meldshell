import { useEffect } from "react"
import type { AppSettings } from "@meldshell/contracts"

export function useAppAppearance(settings: AppSettings) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)")
    const applyTheme = (): void => {
      document.documentElement.dataset.theme =
        settings.theme === "light" || (settings.theme === "system" && media.matches)
          ? "light"
          : "dark"
    }
    applyTheme()
    media.addEventListener("change", applyTheme)
    return () => media.removeEventListener("change", applyTheme)
  }, [settings.theme])
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
