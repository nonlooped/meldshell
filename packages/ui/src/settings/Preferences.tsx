import type { AppSettings, SetAppSettingsInput } from "@meldshell/contracts"
import { useEffect, useState } from "react"
import { Slider } from "@base-ui-components/react/slider"
import { Radio } from "@base-ui-components/react/radio"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import { CornerDownRight, ListPlus, ShieldAlert } from "lucide-react"
import type { ReactNode } from "react"
import { Button, Switch } from "../ui/controls"
import { cx, segmentClasses, segmentGroupClasses } from "../ui/styles"
import { TEXT_SIZES, THEMES, ThemePreview } from "../ui/ThemePreview"
import { useViewStore } from "../app/view-store"
import { Environment } from "./Environment"
import { SettingRow } from "./SettingRow"

type FollowUpMode = NonNullable<AppSettings["followUpMode"]>
type TextSize = NonNullable<AppSettings["transcriptSize"]>

interface SegmentOption<Value extends string> {
  readonly value: Value
  readonly label: string
  readonly content: ReactNode
}

/** Only the chosen behavior is explained, so the row stays short until it matters. */
const FOLLOW_UPS: Readonly<
  Record<FollowUpMode, { readonly label: string; readonly detail: string }>
> = {
  queue: {
    label: "Queue",
    detail: "A message sent mid-turn waits, then starts its own turn when the agent finishes.",
  },
  steer: {
    label: "Steer",
    detail:
      "A message sent mid-turn redirects the agent now: Codex takes it into the same turn, Claude Code and Cursor stop and continue.",
  },
}

const FOLLOW_UP_OPTIONS: ReadonlyArray<SegmentOption<FollowUpMode>> = [
  {
    value: "queue",
    label: FOLLOW_UPS.queue.label,
    content: (
      <>
        <ListPlus size={13} strokeWidth={1.75} aria-hidden="true" />
        {FOLLOW_UPS.queue.label}
      </>
    ),
  },
  {
    value: "steer",
    label: FOLLOW_UPS.steer.label,
    content: (
      <>
        <CornerDownRight size={13} strokeWidth={1.75} aria-hidden="true" />
        {FOLLOW_UPS.steer.label}
      </>
    ),
  },
]

/** Each size previews itself, so the choice reads at a glance. */
const TEXT_SIZE_OPTIONS: ReadonlyArray<SegmentOption<TextSize>> = TEXT_SIZES.map((option) => ({
  value: option.value,
  label: `${option.label} text`,
  content: (
    <span
      aria-hidden="true"
      className="[font-family:var(--font-display)] font-semibold leading-none"
      style={{ fontSize: Math.round(option.size * 0.72) }}
    >
      Aa
    </span>
  ),
}))

/** A short row of exclusive choices that are all visible at once, unlike a select. */
function Segments<Value extends string>({
  label,
  value,
  options,
  disabled,
  onValueChange,
}: {
  readonly label: string
  readonly value: Value
  readonly options: ReadonlyArray<SegmentOption<Value>>
  readonly disabled: boolean
  readonly onValueChange: (value: Value) => void
}): React.JSX.Element {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      disabled={disabled}
      onValueChange={(next) => {
        const chosen = options.find((option) => option.value === next[0])
        if (chosen !== undefined) onValueChange(chosen.value)
      }}
      className={cx(segmentGroupClasses, "w-full")}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className={cx(segmentClasses, "flex-1 h-[28px]!")}
        >
          {option.content}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

const themeTileClasses = [
  "motion-colors relative grid gap-[8px] p-[6px] pb-[8px] border-[1px] border-[color:var(--line)]",
  "rounded-[var(--radius-lg)] bg-transparent text-[var(--text-secondary)] cursor-default",
  "[&:hover]:[border-color:var(--line-strong)] [&:hover]:text-[var(--text-primary)]",
  "[&[data-checked]]:[border-color:var(--accent)] [&[data-checked]]:text-[var(--text-primary)]",
  "[&[data-checked]]:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
  "[&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]",
  "[&[data-disabled]]:opacity-[0.6]",
].join(" ")

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
            className="w-[14px] h-[14px] border-[2px] border-[color:var(--accent)] rounded-[50%] bg-[var(--accent)] [&:has(:focus-visible)]:[outline:1.5px_solid_var(--focus-ring)] [&:has(:focus-visible)]:[outline-offset:3px]"
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
  const followUpMode = settings.followUpMode ?? "queue"
  const fullPermissions = settings.alwaysFullPermissions ?? false
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
          <Environment />
          <SettingRow
            label="Always full permissions"
            description={
              fullPermissions ? (
                <span className="inline-flex items-start gap-[6px] text-[var(--color-modified)]">
                  <ShieldAlert
                    size={13}
                    strokeWidth={1.9}
                    aria-hidden="true"
                    className="flex-none mt-[3px]"
                  />
                  Every agent runs every tool without asking, and the composer hides its permission
                  controls.
                </span>
              ) : (
                "Skip every permission prompt for all agents, starting with the next turn."
              )
            }
          >
            <Switch
              label="Always full permissions"
              checked={fullPermissions}
              disabled={pending}
              onCheckedChange={(alwaysFullPermissions) => onChange({ alwaysFullPermissions })}
            />
          </SettingRow>
          <SettingRow
            label="Follow-ups while the agent works"
            description={`${FOLLOW_UPS[followUpMode].detail} Ctrl or Cmd with Enter does the other.`}
          >
            <Segments<FollowUpMode>
              label="Follow-ups while the agent works"
              value={followUpMode}
              disabled={pending}
              options={FOLLOW_UP_OPTIONS}
              onValueChange={(next) => onChange({ followUpMode: next })}
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
          <SettingRow
            label="Setup guide"
            description="Check your agents, pick a project, and revisit the basics."
          >
            <Button onClick={() => useViewStore.getState().openOnboarding()}>
              Run setup again
            </Button>
          </SettingRow>
        </>
      ) : (
        <>
          <SettingRow label="Theme" description="Choose a look, or follow your system." stacked>
            <RadioGroup
              aria-label="Theme"
              value={settings.theme ?? "dark"}
              disabled={pending}
              onValueChange={(value) => {
                const theme = THEMES.find((option) => option.value === value)?.value
                if (theme !== undefined) onChange({ theme })
              }}
              className="grid grid-cols-3 gap-[10px]"
            >
              {THEMES.map((option) => (
                <Radio.Root key={option.value} value={option.value} className={themeTileClasses}>
                  <span className="block h-[64px] overflow-hidden rounded-[6px] border-[1px] border-[color:var(--line-subtle)]">
                    <ThemePreview theme={option.value} />
                  </span>
                  <span className="flex items-center justify-center gap-[6px] text-[12px] font-medium">
                    {option.icon}
                    {option.label}
                  </span>
                </Radio.Root>
              ))}
            </RadioGroup>
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
          >
            <Segments<TextSize>
              label="Transcript text size"
              value={settings.transcriptSize ?? "medium"}
              disabled={pending}
              options={TEXT_SIZE_OPTIONS}
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
          <SettingRow
            label="Sounds"
            description="Play a soft chime when a thread you aren't watching finishes or needs your attention."
          >
            <Switch
              label="Sounds"
              checked={settings.sounds ?? true}
              disabled={pending}
              onCheckedChange={(sounds) => onChange({ sounds })}
            />
          </SettingRow>
        </>
      )}
    </section>
  )
}
