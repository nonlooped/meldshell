import type { Provider } from "@meldshell/contracts"
import { SHORTCUTS } from "../app/keybindings"
import type { SettingsSection, SettingsSubsection } from "../app/view-store"

export interface SettingsSearchEntry {
  readonly label: string
  readonly section: SettingsSection
  readonly subsection?: SettingsSubsection
  readonly keywords: string
  readonly target?: string
  readonly capability?: "editor" | "environment" | "hostControl"
}

const ENTRIES: readonly SettingsSearchEntry[] = [
  {
    label: "Loadouts",
    section: "threads",
    keywords: "saved agent model effort speed setup rename reorder delete presets",
  },
  {
    label: "Always full permissions",
    section: "threads",
    keywords: "agents approval prompts tools security",
  },
  {
    label: "Follow-ups while the agent works",
    section: "threads",
    keywords: "queue steer messages sending enter",
  },
  { label: "Show archived threads", section: "threads", keywords: "inbox archive visibility" },
  { label: "Model for thread titles", section: "threads", keywords: "title naming conversations" },
  {
    label: "Notification sounds",
    section: "threads",
    keywords: "chime alerts completion attention",
  },
  { label: "Theme", section: "appearance", keywords: "dark light system" },
  { label: "App opacity", section: "appearance", keywords: "window transparency" },
  { label: "Transcript text size", section: "appearance", keywords: "font reading accessibility" },
  { label: "Reduce motion", section: "appearance", keywords: "animations accessibility" },
  {
    label: "Keyboard shortcuts",
    section: "keyboard",
    subsection: "shortcuts",
    keywords: "keybindings hotkeys reset restore defaults",
  },
  {
    label: "Dictation",
    section: "keyboard",
    subsection: "dictation",
    keywords: "voice speech microphone audio",
  },
  {
    label: "Speech model",
    section: "keyboard",
    subsection: "dictation",
    keywords: "voice fast accurate whisper",
  },
  {
    label: "Model download",
    section: "keyboard",
    subsection: "dictation",
    keywords: "dictation speech offline download",
  },
  {
    label: "Provider connections",
    section: "providers",
    subsection: "configuration",
    target: "Configuration",
    keywords: "agents sign in authentication connection enable disable",
  },
  {
    label: "Model catalog",
    section: "providers",
    subsection: "configuration",
    target: "Configuration",
    keywords:
      "identifier display name reasoning efforts fast tier visibility shown hidden off add edit remove restore models",
  },
  {
    label: "Provider updates",
    section: "providers",
    subsection: "configuration",
    target: "Configuration",
    keywords: "agents installed version upgrade",
  },
  {
    label: "Subscription usage",
    section: "providers",
    subsection: "usage",
    keywords: "allowance limits quota credits reset refresh",
  },
  {
    label: "Remote access",
    section: "account",
    target: "Account & devices",
    keywords: "meldshell account sign in sign out relay privacy linking confirmation code",
  },
  {
    label: "Your devices",
    section: "account",
    target: "Account & devices",
    keywords: "phone browser remote host this computer online offline retry reconnect",
  },
  {
    label: "Execution environment",
    capability: "environment",
    section: "app",
    keywords: "windows native wsl linux runtime distribution restart switch",
  },
  {
    label: "Default editor",
    capability: "editor",
    section: "app",
    keywords: "external applications open in editor vscode cursor file manager",
  },
  {
    label: "Host controls",
    capability: "hostControl",
    section: "app",
    keywords: "restart shutdown shut down host process",
  },
  {
    label: "MeldShell updates",
    section: "app",
    keywords: "app version check download restart install",
  },
  { label: "Release channel", section: "app", keywords: "stable nightly builds updates" },
  { label: "Setup guide", section: "app", keywords: "onboarding run setup again" },
  { label: "About MeldShell", section: "app", keywords: "app version platform runtime electron" },
  { label: "Storage", section: "app", keywords: "data local privacy credentials relay" },
]

export function searchSettings(
  query: string,
  providers: readonly Provider[],
  capabilities: Readonly<Record<"editor" | "environment" | "hostControl", boolean>>,
): readonly SettingsSearchEntry[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const entries = [
    ...ENTRIES,
    ...SHORTCUTS.map(
      (shortcut): SettingsSearchEntry => ({
        label: shortcut.label,
        section: "keyboard",
        subsection: "shortcuts",
        keywords: `keyboard shortcut ${shortcut.id} ${shortcut.chord}`,
      }),
    ),
    ...providers.map(
      (provider): SettingsSearchEntry => ({
        label: provider.displayName,
        section: "providers",
        subsection: "configuration",
        keywords: `${provider.harness} provider models connection display name`,
      }),
    ),
  ]
  return entries.filter((entry) => {
    if (entry.capability && !capabilities[entry.capability]) return false
    const text = `${entry.label} ${entry.keywords}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}
