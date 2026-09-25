import { create } from "zustand"

/*
 * Keyboard shortcuts. Each app action has a default chord; the operator's changes are stored as
 * overrides in the app settings, where an empty chord leaves the action without a shortcut. A chord
 * names its modifiers in a fixed order followed by one key, as in `Ctrl+Shift+K`.
 */

export type ShortcutAction =
  | "newThread"
  | "threadPalette"
  | "filePalette"
  | "settings"
  | "closeTab"
  | "archiveThread"
  | "nextTab"
  | "previousTab"
  | "toggleInbox"
  | "toggleSourceControl"
  | "toggleTerminal"
  | "togglePreview"
  | "openInEditor"

export interface ShortcutDefinition {
  readonly id: ShortcutAction
  readonly label: string
  readonly group: "Navigation" | "Tabs" | "Panels" | "Workspace"
  readonly chord: string
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: "threadPalette", label: "Go to thread or message", group: "Navigation", chord: "Ctrl+K" },
  { id: "filePalette", label: "Go to file", group: "Navigation", chord: "Ctrl+P" },
  { id: "newThread", label: "New thread", group: "Navigation", chord: "Ctrl+N" },
  { id: "settings", label: "Open settings", group: "Navigation", chord: "Ctrl+," },
  { id: "closeTab", label: "Close tab", group: "Tabs", chord: "Ctrl+W" },
  { id: "archiveThread", label: "Archive or restore thread", group: "Tabs", chord: "Ctrl+E" },
  { id: "nextTab", label: "Next tab", group: "Tabs", chord: "Ctrl+Tab" },
  { id: "previousTab", label: "Previous tab", group: "Tabs", chord: "Ctrl+Shift+Tab" },
  { id: "toggleInbox", label: "Show or hide the inbox", group: "Panels", chord: "Ctrl+B" },
  {
    id: "toggleSourceControl",
    label: "Show or hide files and changes",
    group: "Panels",
    chord: "Ctrl+Alt+B",
  },
  { id: "toggleTerminal", label: "Show or hide the terminal", group: "Panels", chord: "Ctrl+`" },
  {
    id: "togglePreview",
    label: "Show or hide the preview",
    group: "Panels",
    chord: "Ctrl+Shift+B",
  },
  { id: "openInEditor", label: "Open in editor", group: "Workspace", chord: "Ctrl+Shift+E" },
]

export type Keybindings = Readonly<Record<ShortcutAction, string>>

const isAction = (id: string): id is ShortcutAction => SHORTCUTS.some((entry) => entry.id === id)

/** The chord for every action: its override when it has one, otherwise its default. */
export function resolveKeybindings(
  overrides: Readonly<Record<string, string>> | undefined,
): Keybindings {
  const bindings = Object.fromEntries(SHORTCUTS.map((entry) => [entry.id, entry.chord])) as Record<
    ShortcutAction,
    string
  >
  for (const [id, chord] of Object.entries(overrides ?? {}))
    if (isAction(id)) bindings[id] = normalizeChord(chord) ?? ""
  return bindings
}

/** The overrides to store for `bindings`: only the actions that differ from their defaults. */
export function overridesFor(bindings: Keybindings): Record<string, string> {
  return Object.fromEntries(
    SHORTCUTS.filter((entry) => bindings[entry.id] !== entry.chord).map((entry) => [
      entry.id,
      bindings[entry.id],
    ]),
  )
}

const MODIFIERS = ["Ctrl", "Alt", "Shift", "Meta"] as const

// Keys named by position, so a layout that puts another character there still reaches them.
const CODE_KEYS: Readonly<Record<string, string>> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Tab: "Tab",
  Enter: "Enter",
  Space: "Space",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Escape",
}

const KEY_NAMES = new Set(Object.values(CODE_KEYS))

type ChordEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>

/** The key part of a chord; null for a lone modifier or a key chords cannot use. */
function keyName(event: Pick<KeyboardEvent, "key" | "code">): string | null {
  // Letters follow the layout, as the shortcuts printed on menus do.
  if (/^[a-z]$/i.test(event.key)) return event.key.toUpperCase()
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code)
  if (digit) return digit[1] ?? null
  const letter = /^Key([A-Z])$/.exec(event.code)
  if (letter) return letter[1] ?? null
  if (/^F([1-9]|1\d|2[0-4])$/.test(event.code)) return event.code
  return CODE_KEYS[event.code] ?? null
}

export function chordFromEvent(event: ChordEvent): string | null {
  const key = keyName(event)
  if (key === null) return null
  const held = {
    Ctrl: event.ctrlKey,
    Alt: event.altKey,
    Shift: event.shiftKey,
    Meta: event.metaKey,
  }
  return [...MODIFIERS.filter((modifier) => held[modifier]), key].join("+")
}

/** Canonical spelling of a stored chord; null when it cannot be a chord. */
export function normalizeChord(chord: string): string | null {
  const trimmed = chord.trim()
  if (trimmed === "") return null
  // `Ctrl++` ends in the plus key, so split the key off before reading the modifiers.
  const match = /^(.*?)\+?([^+]+|\+)$/.exec(trimmed)
  if (!match) return null
  const key = match[2] ?? ""
  const modifiers = (match[1] ?? "").split("+").filter((part) => part !== "")
  const canonical = new Set<string>()
  for (const part of modifiers) {
    const modifier = MODIFIERS.find((entry) => entry.toLowerCase() === part.toLowerCase())
    if (modifier === undefined) return null
    canonical.add(modifier)
  }
  const name = /^[a-z]$/i.test(key)
    ? key.toUpperCase()
    : /^f([1-9]|1\d|2[0-4])$/i.test(key)
      ? key.toUpperCase()
      : /^\d$/.test(key) || KEY_NAMES.has(key)
        ? key
        : null
  if (name === null) return null
  return [...MODIFIERS.filter((modifier) => canonical.has(modifier)), name].join("+")
}

// Text fields rely on these, so they cannot be taken over.
const EDITING_CHORDS = new Set(["Ctrl+A", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Y", "Ctrl+Z"])

/** Why a chord cannot be assigned, or null when it can. */
export function chordProblem(chord: string): string | null {
  const parts = chord.split("+")
  const key = parts.at(-1) ?? ""
  const modified = parts.some((part) => part === "Ctrl" || part === "Alt" || part === "Meta")
  if (key === "Escape") return "Escape closes menus and dialogs, so it cannot be a shortcut."
  if (!modified && !/^F\d+$/.test(key))
    return "Add Ctrl, Alt, or the system key so typing never triggers the shortcut."
  if (EDITING_CHORDS.has(chord)) return `${chord} edits text, so it cannot be a shortcut.`
  return null
}

/** The action a key press triggers, if any. The first action listed wins a shared chord. */
export function actionForEvent(event: ChordEvent, bindings: Keybindings): ShortcutAction | null {
  const chord = chordFromEvent(event)
  if (chord === null) return null
  return SHORTCUTS.find((entry) => bindings[entry.id] === chord)?.id ?? null
}

/** How a chord reads in labels and tooltips. */
export const chordLabel = (chord: string): string => (chord === "" ? "None" : chord)

/** A chord in `aria-keyshortcuts` form, as in `Control+Shift+K`; undefined without a chord. */
export const ariaShortcut = (chord: string): string | undefined =>
  chord === "" ? undefined : chord.replace(/^Ctrl\b/, "Control")

/** A title with the action's shortcut appended, as in `Show terminal (Ctrl+`)`. */
export const withShortcut = (title: string, chord: string): string =>
  chord === "" ? title : `${title} (${chord})`

interface KeybindingStore {
  readonly bindings: Keybindings
  readonly setOverrides: (overrides: Readonly<Record<string, string>> | undefined) => void
}

/** The chords in effect, for code outside React such as terminal key handling. */
export const useKeybindings = create<KeybindingStore>((set) => ({
  bindings: resolveKeybindings(undefined),
  setOverrides: (overrides) => set({ bindings: resolveKeybindings(overrides) }),
}))
