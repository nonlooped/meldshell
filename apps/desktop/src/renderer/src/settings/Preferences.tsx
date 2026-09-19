import type { AppSettings, SetAppSettingsInput } from "@meldshell/contracts"
import { useEffect, useState } from "react"
import { Slider } from "@base-ui-components/react/slider"
import { SelectField, Switch } from "../ui/controls"
import { SettingRow } from "./SettingRow"

function OpacitySlider({
  value,
  onCommit,
  disabled,
}: {
  readonly value: number
  readonly onCommit: (opacity: number) => void
  readonly disabled: boolean
}): React.JSX.Element {
  const [opacity, setOpacity] = useState(value)
  useEffect(() => {
    if (!disabled) {
      setOpacity(value)
      document.documentElement.style.removeProperty("--app-opacity-preview")
    }
  }, [value, disabled])
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--app-opacity-preview")
    },
    [],
  )
  return (
    <Slider.Root
      className="flex items-center gap-[12px] w-full [&[data-disabled]]:opacity-[0.5] [&[data-disabled]_.opacity-slider-control]:cursor-default [&_output]:min-w-[4ch] [&_output]:text-right [&_output]:tabular-nums [&_output]:text-[var(--text-secondary)]"
      min={20}
      max={100}
      step={1}
      value={opacity}
      disabled={disabled}
      onValueChange={(next) => {
        setOpacity(next)
        document.documentElement.style.setProperty("--app-opacity-preview", String(next / 100))
      }}
      onValueCommitted={(next) => {
        if (!disabled && next !== value) onCommit(next)
      }}
    >
      <Slider.Control className="opacity-slider-control flex items-center h-[26px] flex-1 min-w-0 [touch-action:none] select-none cursor-pointer">
        <Slider.Track className="relative w-full h-[4px] rounded-[2px] bg-[var(--line-strong)]">
          <Slider.Indicator className="h-full rounded-[inherit] bg-[var(--accent)]" />
          <Slider.Thumb
            id="app-opacity"
            className="w-[14px] h-[14px] border-[2px] border-[color:var(--accent)] rounded-[50%] bg-[var(--accent)] [&:has(:focus-visible)]:[outline:2px_solid_var(--accent)] [&:has(:focus-visible)]:[outline-offset:3px]"
            aria-label="App opacity"
            getAriaValueText={(_formatted, next) => `${next}%`}
          />
        </Slider.Track>
      </Slider.Control>
      <Slider.Value>{(_formatted, values) => `${values[0]}%`}</Slider.Value>
    </Slider.Root>
  )
}

export function Preferences({
  section,
  settings,
  onChange,
  pending,
}: {
  readonly section: "general" | "appearance"
  readonly settings: AppSettings
  readonly onChange: (input: SetAppSettingsInput) => void
  readonly pending: boolean
}): React.JSX.Element {
  const forceOpaque = window.meldshell.platform === "linux"
  const opacity =
    settings.opacity ??
    (settings.theme === "light" ||
    (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches)
      ? 94
      : 88)
  return (
    <section
      className="settings-group m-0 border-t-[1px] border-t-[color:var(--line-subtle)] border-b-[1px] border-b-[color:var(--line-subtle)] [&_+_.settings-group]:border-t-0"
      aria-label={section === "general" ? "General preferences" : "Appearance preferences"}
    >
      {section === "general" ? (
        <>
          <SettingRow
            label="Send messages with"
            description="Shift+Enter always adds a new line."
            controlId="send-shortcut"
          >
            <SelectField<NonNullable<AppSettings["sendShortcut"]>>
              id="send-shortcut"
              label="Send messages with"
              value={settings.sendShortcut ?? "ctrl-enter"}
              disabled={pending}
              options={[
                { value: "ctrl-enter", label: "Ctrl+Enter" },
                { value: "enter", label: "Enter" },
              ]}
              onValueChange={(sendShortcut) => onChange({ sendShortcut })}
            />
          </SettingRow>
          <SettingRow
            label="Show archived threads"
            description="Keep archived threads visible in the inbox. Search always includes them."
          >
            <Switch
              label="Show archived threads"
              checked={settings.showSettled ?? true}
              disabled={pending}
              onCheckedChange={(showSettled) => onChange({ showSettled })}
            />
          </SettingRow>
        </>
      ) : (
        <>
          <SettingRow
            label="Theme"
            description="Choose a light or dark appearance, or follow Windows."
            controlId="theme"
          >
            <SelectField<NonNullable<AppSettings["theme"]>>
              id="theme"
              label="Theme"
              value={settings.theme ?? "dark"}
              disabled={pending}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
                { value: "system", label: "System" },
              ]}
              onValueChange={(theme) => onChange({ theme })}
            />
          </SettingRow>
          <SettingRow
            label="App opacity"
            description={
              forceOpaque
                ? "The app is always fully opaque on Linux."
                : "Adjust how much of the desktop shows through the background. Windows reduced transparency takes priority."
            }
            controlId="app-opacity"
          >
            <OpacitySlider
              value={forceOpaque ? 100 : opacity}
              disabled={pending || forceOpaque}
              onCommit={(opacity) => onChange({ opacity })}
            />
          </SettingRow>
          <SettingRow
            label="Transcript text size"
            description="Adjust message and reply text for comfortable reading."
            controlId="transcript-size"
          >
            <SelectField<NonNullable<AppSettings["transcriptSize"]>>
              id="transcript-size"
              label="Transcript text size"
              value={settings.transcriptSize ?? "medium"}
              disabled={pending}
              options={[
                { value: "small", label: "Small" },
                { value: "medium", label: "Medium" },
                { value: "large", label: "Large" },
              ]}
              onValueChange={(transcriptSize) => onChange({ transcriptSize })}
            />
          </SettingRow>
          <SettingRow
            label="Reduce motion"
            description="Turn off interface animations. The Windows reduced-motion preference is also respected."
          >
            <Switch
              label="Reduce motion"
              checked={settings.reduceMotion ?? false}
              disabled={pending}
              onCheckedChange={(reduceMotion) => onChange({ reduceMotion })}
            />
          </SettingRow>
        </>
      )}
    </section>
  )
}
