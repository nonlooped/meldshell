import { useEffect, useState } from "react"
import { Radio } from "@base-ui-components/react/radio"
import { RadioGroup } from "@base-ui-components/react/radio-group"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import { Copy, Ellipsis, Moon, Pencil, Plus, Sun, Trash2, TriangleAlert } from "lucide-react"
import {
  MAX_CUSTOM_THEMES,
  type AppSettings,
  type CustomTheme,
  type SetAppSettingsInput,
  type ThemePalette,
} from "@meldshell/contracts"
import { useThemeDraft } from "../app/appearance"
import {
  BUILT_IN_THEMES,
  contrastRatio,
  copyName,
  newThemeId,
  parseHex,
  resolveColorTheme,
  toHex,
  type ColorTheme,
  type ThemeMode,
} from "../app/color-themes"
import { AppDialog, Button, DropdownMenu, IconButton, MenuAction, TextField } from "../ui/controls"
import { cx, segmentClasses, segmentGroupClasses } from "../ui/styles"
import { MiniWindow, SplitPreview } from "../ui/ThemePreview"
import { SettingsGroup } from "./SettingsGroup"
import { settingRowPadding } from "./SettingRow"

/** A preview tile; the selected one takes the accent's ring. Shared with the mode tiles. */
export const themeTileClasses = [
  "motion-colors relative grid gap-[8px] p-[6px] pb-[8px] border-[1px] border-[color:var(--line)]",
  "rounded-[var(--radius-lg)] bg-transparent text-[var(--text-secondary)] cursor-default",
  "[&:hover]:[border-color:var(--line-strong)] [&:hover]:text-[var(--text-primary)]",
  "[&[data-checked]]:[border-color:var(--accent)] [&[data-checked]]:text-[var(--text-primary)]",
  "[&[data-checked]]:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
  "[&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]",
  "[&[data-disabled]]:opacity-[0.6]",
].join(" ")

const currentMode = (): ThemeMode =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark"

type Editing = { readonly theme: CustomTheme; readonly isNew: boolean }

/** The built-in themes and the user's own, each previewed in both modes, with a way to make more. */
export function ColorThemeSettings({
  settings,
  onChange,
  pending,
}: {
  readonly settings: AppSettings
  readonly onChange: (input: SetAppSettingsInput) => void
  readonly pending: boolean
}): React.JSX.Element {
  const custom = settings.customThemes ?? []
  const selected = resolveColorTheme(settings)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [removing, setRemoving] = useState<CustomTheme | null>(null)
  const full = custom.length >= MAX_CUSTOM_THEMES
  const names = [...BUILT_IN_THEMES, ...custom].map((theme) => theme.name)

  const startFrom = (theme: ColorTheme): void =>
    setEditing({
      isNew: true,
      theme: {
        id: newThemeId(custom),
        name: copyName(theme.name, names),
        dark: theme.dark,
        light: theme.light,
      },
    })

  const save = (theme: CustomTheme, isNew: boolean): void => {
    if (isNew) onChange({ customThemes: [...custom, theme], colorTheme: theme.id })
    else
      onChange({
        customThemes: custom.map((existing) => (existing.id === theme.id ? theme : existing)),
      })
  }

  const remove = (theme: CustomTheme): void => {
    onChange({
      customThemes: custom.filter((existing) => existing.id !== theme.id),
      ...(selected.id === theme.id ? { colorTheme: BUILT_IN_THEMES[0]?.id } : {}),
    })
  }

  return (
    <SettingsGroup
      title="Color theme"
      description="Every theme has a dark and a light version, used by the mode above. Make your own from any of them."
      action={
        <Button
          size="sm"
          icon={<Plus size={13} strokeWidth={2} />}
          disabled={pending || full}
          title={full ? `You can keep up to ${MAX_CUSTOM_THEMES} themes.` : undefined}
          onClick={() => startFrom(selected)}
        >
          New theme
        </Button>
      }
    >
      <div className={settingRowPadding}>
        <RadioGroup
          aria-label="Color theme"
          value={selected.id}
          disabled={pending}
          onValueChange={(value) => {
            if (typeof value === "string") onChange({ colorTheme: value })
          }}
          className="grid grid-cols-3 gap-[10px] [@container(max-width:_460px)]:grid-cols-2"
        >
          {BUILT_IN_THEMES.map((theme) => (
            <ThemeTile key={theme.id} theme={theme}>
              <MenuAction
                icon={<Copy size={13} />}
                disabled={pending || full}
                onClick={() => startFrom(theme)}
              >
                Duplicate and edit
              </MenuAction>
            </ThemeTile>
          ))}
          {custom.map((theme) => (
            <ThemeTile key={theme.id} theme={theme} custom>
              <MenuAction
                icon={<Pencil size={13} />}
                disabled={pending}
                onClick={() => setEditing({ theme, isNew: false })}
              >
                Edit
              </MenuAction>
              <MenuAction
                icon={<Copy size={13} />}
                disabled={pending || full}
                onClick={() => startFrom(theme)}
              >
                Duplicate
              </MenuAction>
              <MenuAction
                icon={<Trash2 size={13} />}
                disabled={pending}
                onClick={() => setRemoving(theme)}
              >
                Delete
              </MenuAction>
            </ThemeTile>
          ))}
        </RadioGroup>
      </div>
      {editing !== null && (
        <ThemeEditor
          key={editing.theme.id}
          initial={editing.theme}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(theme) => {
            save(theme, editing.isNew)
            setEditing(null)
          }}
        />
      )}
      {removing !== null && (
        <AppDialog
          alert
          open
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
          title={`Delete ${removing.name}?`}
          actions={
            <>
              <Button onClick={() => setRemoving(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  remove(removing)
                  setRemoving(null)
                }}
              >
                Delete theme
              </Button>
            </>
          }
        >
          <p>
            {selected.id === removing.id
              ? "MeldShell goes back to its original colors. This can't be undone."
              : "This can't be undone."}
          </p>
        </AppDialog>
      )}
    </SettingsGroup>
  )
}

function ThemeTile({
  theme,
  custom = false,
  children,
}: {
  readonly theme: ColorTheme
  readonly custom?: boolean
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="group/theme relative min-w-0">
      <Radio.Root
        value={theme.id}
        aria-label={theme.name}
        className={cx(themeTileClasses, "w-full")}
      >
        <span className="block h-[64px] overflow-hidden rounded-[6px] border-[1px] border-[color:var(--line-subtle)]">
          <SplitPreview colors={theme} />
        </span>
        <span className="flex min-w-0 items-center justify-center gap-[6px] text-[12px] font-medium">
          <span
            aria-hidden="true"
            className="h-[8px] w-[8px] flex-none rounded-full"
            style={{
              background: `linear-gradient(135deg, ${theme.dark.accent} 50%, ${theme.light.accent} 50%)`,
            }}
          />
          <span className="truncate">{theme.name}</span>
          {custom && (
            <span className="flex-none text-[var(--text-tertiary)] font-normal">· Yours</span>
          )}
        </span>
      </Radio.Root>
      <DropdownMenu
        align="end"
        trigger={
          <IconButton
            label={`${theme.name} actions`}
            className="absolute! top-[10px] right-[10px] w-[24px]! h-[24px]! flex-[0_0_24px]! bg-[var(--surface-menu)]! [box-shadow:var(--shadow-raised)] opacity-0 group-hover/theme:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100 [@media(hover:_none)]:opacity-100"
          >
            <Ellipsis size={14} />
          </IconButton>
        }
      >
        {children}
      </DropdownMenu>
    </div>
  )
}

const BASE_COLORS: ReadonlyArray<{
  readonly key: keyof ThemePalette
  readonly label: string
  readonly hint: string
}> = [
  { key: "background", label: "Background", hint: "The window behind everything" },
  { key: "foreground", label: "Text", hint: "Secondary text and lines are blended from it" },
  { key: "accent", label: "Accent", hint: "Selection, focus, and primary buttons" },
]

const STATUS_COLORS: ReadonlyArray<{
  readonly key: keyof ThemePalette
  readonly label: string
}> = [
  { key: "added", label: "Added" },
  { key: "deleted", label: "Removed" },
  { key: "modified", label: "Changed" },
  { key: "renamed", label: "Renamed" },
  { key: "info", label: "Info" },
]

/**
 * Edits a theme's two palettes with the whole app showing the result live, in the mode being
 * edited, until the dialog closes.
 */
function ThemeEditor({
  initial,
  isNew,
  onClose,
  onSave,
}: {
  readonly initial: CustomTheme
  readonly isNew: boolean
  readonly onClose: () => void
  readonly onSave: (theme: CustomTheme) => void
}): React.JSX.Element {
  const [theme, setTheme] = useState(initial)
  const [mode, setMode] = useState<ThemeMode>(currentMode)
  useEffect(() => {
    useThemeDraft.setState({ draft: { theme, mode } })
  }, [theme, mode])
  useEffect(() => () => useThemeDraft.setState({ draft: null }), [])

  const palette = theme[mode]
  const setColor = (key: keyof ThemePalette, value: string): void =>
    setTheme((current) => ({ ...current, [mode]: { ...current[mode], [key]: value } }))
  const name = theme.name.trim()
  const textContrast = contrastRatio(palette.foreground, palette.background)
  const accentContrast = contrastRatio(palette.accent, palette.background)

  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={isNew ? "New theme" : `Edit ${initial.name}`}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={name === ""}
            onClick={() => onSave({ ...theme, name })}
          >
            {isNew ? "Create theme" : "Save theme"}
          </Button>
        </>
      }
    >
      <div className="theme-editor grid grid-cols-[minmax(0,_1fr)_260px] gap-[22px] [padding:16px_20px_0] [@media(max-width:_760px)]:grid-cols-1">
        <div className="grid content-start gap-[16px] min-w-0">
          <TextField
            label="Name"
            value={theme.name}
            maxLength={48}
            onValueChange={(value) => setTheme((current) => ({ ...current, name: value }))}
          />
          <div className="grid gap-[8px]">
            <div className="flex items-center justify-between gap-[12px]">
              <span className="text-[var(--text-secondary)] text-[12px] font-medium">Editing</span>
              <ToggleGroup
                aria-label="Palette to edit"
                value={[mode]}
                onValueChange={(next) => {
                  if (next[0] === "dark" || next[0] === "light") setMode(next[0])
                }}
                className={segmentGroupClasses}
              >
                <Toggle value="dark" aria-label="Dark palette" className={segmentClasses}>
                  <Moon size={12} strokeWidth={1.75} aria-hidden="true" />
                  Dark
                </Toggle>
                <Toggle value="light" aria-label="Light palette" className={segmentClasses}>
                  <Sun size={12} strokeWidth={1.75} aria-hidden="true" />
                  Light
                </Toggle>
              </ToggleGroup>
            </div>
            <div className="grid border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-card)] [&>*+*]:border-t-[1px] [&>*+*]:border-t-[color:var(--line-subtle)]">
              {BASE_COLORS.map((color) => (
                <ColorRow
                  key={`${mode}-${color.key}`}
                  label={color.label}
                  hint={color.hint}
                  value={palette[color.key]}
                  onChange={(value) => setColor(color.key, value)}
                />
              ))}
            </div>
            <span className="mt-[6px] text-[var(--text-secondary)] text-[12px] font-medium">
              Status
            </span>
            <div className="grid grid-cols-5 gap-[8px] [@media(max-width:_520px)]:grid-cols-3">
              {STATUS_COLORS.map((color) => (
                <StatusSwatch
                  key={`${mode}-${color.key}`}
                  label={color.label}
                  value={palette[color.key]}
                  onChange={(value) => setColor(color.key, value)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="grid content-start gap-[10px]">
          <span className="text-[var(--text-secondary)] text-[12px] font-medium">Preview</span>
          <span className="block h-[150px] overflow-hidden rounded-[var(--radius)] border-[1px] border-[color:var(--line)]">
            <MiniWindow palette={palette} detailed />
          </span>
          <span className="grid grid-cols-2 gap-[8px]">
            <PreviewSwitch
              label="Dark"
              palette={theme.dark}
              active={mode === "dark"}
              onSelect={() => setMode("dark")}
            />
            <PreviewSwitch
              label="Light"
              palette={theme.light}
              active={mode === "light"}
              onSelect={() => setMode("light")}
            />
          </span>
          <Contrast label="Text" ratio={textContrast} minimum={7} />
          <Contrast label="Accent" ratio={accentContrast} minimum={3} />
        </div>
      </div>
    </AppDialog>
  )
}

/** The other palette at a glance; choosing it edits that one. */
function PreviewSwitch({
  label,
  palette,
  active,
  onSelect,
}: {
  readonly label: string
  readonly palette: ThemePalette
  readonly active: boolean
  readonly onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={`Edit the ${label.toLowerCase()} palette`}
      aria-pressed={active}
      onClick={onSelect}
      className={cx(
        "motion-colors grid gap-[5px] p-[4px] pb-[5px] border-[1px] rounded-[var(--radius)] bg-transparent cursor-default text-[11px]",
        active
          ? "[border-color:var(--accent)] text-[var(--text-primary)]"
          : "[border-color:var(--line)] text-[var(--text-tertiary)] hover:[border-color:var(--line-strong)]",
      )}
    >
      <span className="block h-[44px] overflow-hidden rounded-[4px]">
        <MiniWindow palette={palette} />
      </span>
      {label}
    </button>
  )
}

/** How readable a colour is on the background, with a warning below the comfortable minimum. */
function Contrast({
  label,
  ratio,
  minimum,
}: {
  readonly label: string
  readonly ratio: number
  readonly minimum: number
}): React.JSX.Element {
  const low = ratio < minimum
  return (
    <span
      className={cx(
        "flex items-center justify-between gap-[8px] text-[12px]",
        low ? "text-[var(--color-modified)]" : "text-[var(--text-tertiary)]",
      )}
    >
      <span className="inline-flex items-center gap-[5px]">
        {low && <TriangleAlert size={12} strokeWidth={1.9} aria-hidden="true" />}
        {label} contrast{low ? " is low" : ""}
      </span>
      <span className="tabular-nums">{ratio.toFixed(1)}:1</span>
    </span>
  )
}

/** A colour well that opens the system picker, beside its hex code. */
function ColorRow({
  label,
  hint,
  value,
  onChange,
}: {
  readonly label: string
  readonly hint: string
  readonly value: string
  readonly onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-[12px] [padding:9px_12px]">
      <ColorWell label={label} value={value} onChange={onChange} />
      <span className="grid min-w-0 flex-1 gap-[1px]">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="truncate text-[11px] text-[var(--text-tertiary)]">{hint}</span>
      </span>
      <HexField label={label} value={value} onChange={onChange} />
    </div>
  )
}

function StatusSwatch({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <span className="grid justify-items-center gap-[5px] text-[11px] text-[var(--text-secondary)]">
      <ColorWell label={label} value={value} onChange={onChange} />
      {label}
    </span>
  )
}

function ColorWell({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <label
      className="motion-colors relative block h-[28px] w-[28px] flex-none overflow-hidden rounded-[8px] border-[1px] border-[color:var(--line-strong)] [box-shadow:inset_0_0_0_1px_var(--edge-highlight)] hover:[border-color:var(--text-tertiary)] has-[:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] has-[:focus-visible]:[outline-offset:2px]"
      style={{ background: value }}
    >
      <input
        type="color"
        aria-label={`${label} color`}
        value={value.toLowerCase()}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  )
}

/** Accepts a hex code as it is typed, applying it once it is complete. */
function HexField({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}): React.JSX.Element {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setText(value)
  }
  return (
    <TextField
      aria-label={`${label} hex code`}
      mono
      value={text}
      maxLength={7}
      className="w-[86px]! h-[28px]!"
      onValueChange={(next) => {
        setText(next)
        const color = parseHex(next)
        if (color !== null && /^#?[0-9a-f]{6}$/i.test(next.trim())) {
          const hex = toHex(color)
          setShown(hex)
          onChange(hex)
        }
      }}
      onBlur={() => setText(value)}
    />
  )
}
