import { create } from "zustand"

export type SettingsSection =
  | "account"
  | "general"
  | "appearance"
  | "providers"
  | "usage"
  | "threads"
  | "loadouts"
  | "schedules"
  | "keyboard"
  | "dictation"
  | "about"

interface ViewStore {
  /** Settings takes over the whole workbench; open tabs stay untouched behind it. */
  readonly settingsOpen: boolean
  readonly settingsSection: SettingsSection
  readonly openSettings: (section?: SettingsSection) => void
  readonly closeSettings: () => void
  readonly selectSettingsSection: (section: SettingsSection) => void
  /** The first-run guide covers the whole window until it is finished or skipped. */
  readonly onboardingOpen: boolean
  readonly openOnboarding: () => void
  readonly closeOnboarding: () => void
  /** A thread whose composer should take focus once it is on screen. */
  readonly composerFocusThreadId: string | null
  readonly focusComposer: (threadId: string | null) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  settingsOpen: false,
  settingsSection: "general",
  openSettings: (section) =>
    set((state) => ({ settingsOpen: true, settingsSection: section ?? state.settingsSection })),
  closeSettings: () => set({ settingsOpen: false }),
  selectSettingsSection: (section) => set({ settingsSection: section }),
  onboardingOpen: false,
  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => set({ onboardingOpen: false }),
  composerFocusThreadId: null,
  focusComposer: (threadId) => set({ composerFocusThreadId: threadId }),
}))
