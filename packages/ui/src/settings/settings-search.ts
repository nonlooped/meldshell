import type { Provider } from "@meldshell/contracts"
import { SHORTCUTS, type ShortcutAction } from "../app/keybindings"
import type { SettingsSection } from "../app/view-store"

export interface SettingsSearchEntry {
  readonly label: string
  readonly section: SettingsSection
  /** The titled group on the page that holds the setting, shown beside each result. */
  readonly group: string
  readonly keywords: string
  /** The `data-setting-label` to scroll to, when it is not the label itself. */
  readonly target?: string
  readonly capability?: "editor" | "environment" | "hostControl"
  /** A keyboard shortcut's action, so a result can show the keys it uses now. */
  readonly shortcut?: ShortcutAction
}

const ENTRIES: readonly SettingsSearchEntry[] = [
  {
    label: "Always full permissions",
    section: "threads",
    group: "Agents",
    keywords: "agents approval prompts tools security",
  },
  {
    label: "Follow-ups while the agent works",
    section: "threads",
    group: "Agents",
    keywords: "queue steer messages sending enter",
  },
  {
    label: "Model for thread titles",
    section: "threads",
    group: "Threads",
    keywords: "title naming conversations",
  },
  {
    label: "Show archived threads",
    section: "threads",
    group: "Threads",
    keywords: "inbox archive visibility",
  },
  {
    label: "Notification sounds",
    section: "threads",
    group: "Threads",
    keywords: "chime alerts completion attention",
  },
  {
    label: "Loadouts",
    section: "threads",
    group: "Loadouts",
    keywords: "saved agent model effort speed setup rename reorder delete presets",
  },
  { label: "Theme", section: "appearance", group: "Theme", keywords: "dark light system mode" },
  {
    label: "Color theme",
    section: "appearance",
    group: "Color theme",
    keywords:
      "colors palette accent custom create new edit graphite midnight arctic ocean forest ember rose dusk",
  },
  {
    label: "App opacity",
    section: "appearance",
    group: "Display",
    keywords: "window transparency",
  },
  {
    label: "Transcript text size",
    section: "appearance",
    group: "Display",
    keywords: "font reading accessibility",
  },
  {
    label: "Reduce motion",
    section: "appearance",
    group: "Display",
    keywords: "animations accessibility",
  },
  {
    label: "Keyboard shortcuts",
    section: "keyboard",
    group: "Keyboard shortcuts",
    keywords: "keybindings hotkeys reset restore defaults",
  },
  {
    label: "Dictation",
    section: "keyboard",
    group: "Dictation",
    keywords: "voice speech microphone audio",
  },
  {
    label: "Speech model",
    section: "keyboard",
    group: "Dictation",
    keywords: "voice fast accurate whisper",
  },
  {
    label: "Model download",
    section: "keyboard",
    group: "Dictation",
    keywords: "dictation speech offline download",
  },
  {
    label: "Provider connections",
    section: "providers",
    group: "Providers",
    target: "Providers",
    keywords: "agents sign in authentication connection enable disable",
  },
  {
    label: "Model catalog",
    section: "providers",
    group: "Providers",
    target: "Providers",
    keywords:
      "identifier display name reasoning efforts fast tier visibility shown hidden off add edit remove restore models",
  },
  {
    label: "Provider updates",
    section: "providers",
    group: "Providers",
    target: "Providers",
    keywords: "agents installed version upgrade",
  },
  {
    label: "Subscription usage",
    section: "providers",
    group: "Subscription usage",
    keywords: "allowance limits quota credits reset refresh",
  },
  {
    label: "Remote access",
    section: "account",
    group: "Remote access",
    keywords: "meldshell account sign in sign out relay privacy linking confirmation code",
  },
  {
    label: "Your devices",
    section: "account",
    group: "Remote access",
    target: "Remote access",
    keywords: "phone browser remote host this computer online offline retry reconnect",
  },
  {
    label: "MeldShell updates",
    section: "app",
    group: "Updates",
    keywords: "app version check download restart install",
  },
  {
    label: "Release channel",
    section: "app",
    group: "Updates",
    keywords: "stable nightly builds updates",
  },
  {
    label: "Execution environment",
    capability: "environment",
    section: "app",
    group: "Runtime & applications",
    keywords: "windows native wsl linux runtime distribution restart switch",
  },
  {
    label: "Default editor",
    capability: "editor",
    section: "app",
    group: "Runtime & applications",
    keywords: "external applications open in editor vscode cursor file manager",
  },
  {
    label: "Host controls",
    capability: "hostControl",
    section: "app",
    group: "Runtime & applications",
    keywords: "restart shutdown shut down host process",
  },
  {
    label: "About MeldShell",
    section: "app",
    group: "About MeldShell",
    keywords: "app version platform runtime electron",
  },
  {
    label: "Storage",
    section: "app",
    group: "About MeldShell",
    keywords: "data local privacy credentials relay",
  },
  {
    label: "Setup guide",
    section: "app",
    group: "About MeldShell",
    keywords: "onboarding run setup again",
  },
]

/** Closer matches first: a label that starts with the query, then one containing it. */
function rank(entry: SettingsSearchEntry, phrase: string): number {
  const label = entry.label.toLowerCase()
  if (label.startsWith(phrase)) return 0
  if (label.split(/\s+/).some((word) => word.startsWith(phrase))) return 1
  if (label.includes(phrase)) return 2
  return 3
}

export function searchSettings(
  query: string,
  providers: readonly Provider[],
  capabilities: Readonly<Record<"editor" | "environment" | "hostControl", boolean>>,
): readonly SettingsSearchEntry[] {
  const phrase = query.toLowerCase().trim().replace(/\s+/g, " ")
  const words = phrase.split(" ").filter(Boolean)
  if (words.length === 0) return []
  const entries = [
    ...ENTRIES,
    ...SHORTCUTS.map(
      (shortcut): SettingsSearchEntry => ({
        label: shortcut.label,
        section: "keyboard",
        group: `Keyboard shortcuts · ${shortcut.group}`,
        keywords: `keyboard shortcut ${shortcut.id} ${shortcut.chord}`,
        shortcut: shortcut.id,
      }),
    ),
    ...providers.map(
      (provider): SettingsSearchEntry => ({
        label: provider.displayName,
        section: "providers",
        group: "Providers",
        keywords: `${provider.harness} provider models connection display name`,
      }),
    ),
  ]
  return entries
    .filter((entry) => {
      if (entry.capability && !capabilities[entry.capability]) return false
      const text = `${entry.label} ${entry.group} ${entry.keywords}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    .map((entry, index) => ({ entry, index, rank: rank(entry, phrase) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ entry }) => entry)
}
