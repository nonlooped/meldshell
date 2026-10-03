import { create } from "zustand"

export type SettingsSection =
  | "threads"
  | "appearance"
  | "keyboard"
  | "providers"
  | "account"
  | "app"

export type SettingsSubsection = "shortcuts" | "dictation" | "configuration" | "usage"

interface ViewStore {
  /** Workspace views cover the workbench while preserving its open tabs. */
  readonly schedulesOpen: boolean
  readonly openSchedules: () => void
  readonly closeSchedules: () => void
  readonly closeWorkbenchViews: () => void
  readonly settingsOpen: boolean
  readonly settingsSection: SettingsSection
  readonly settingsSubsection: SettingsSubsection
  readonly openSettings: (section?: SettingsSection, subsection?: SettingsSubsection) => void
  readonly closeSettings: () => void
  readonly selectSettingsSection: (
    section: SettingsSection,
    subsection?: SettingsSubsection,
  ) => void
  /** The first-run guide covers the whole window until it is finished or skipped. */
  readonly onboardingOpen: boolean
  readonly openOnboarding: () => void
  readonly closeOnboarding: () => void
  /** A thread whose composer should take focus once it is on screen. */
  readonly composerFocusThreadId: string | null
  readonly focusComposer: (threadId: string | null) => void
  /** The issue picker lists issues from this workspace, or the active one when it is not set. */
  readonly issuePicker: { readonly workspaceId?: string } | null
  readonly openIssuePicker: (workspaceId?: string) => void
  readonly closeIssuePicker: () => void
}

export const useViewStore = create<ViewStore>((set) => ({
  schedulesOpen: false,
  openSchedules: () => set({ schedulesOpen: true, settingsOpen: false }),
  closeSchedules: () => set({ schedulesOpen: false }),
  closeWorkbenchViews: () => set({ schedulesOpen: false, settingsOpen: false }),
  settingsOpen: false,
  settingsSection: "threads",
  settingsSubsection: "shortcuts",
  openSettings: (section, subsection) =>
    set((state) => ({
      settingsOpen: true,
      schedulesOpen: false,
      settingsSection: section ?? state.settingsSection,
      settingsSubsection:
        subsection ??
        (section === "providers"
          ? "configuration"
          : section === "keyboard"
            ? "shortcuts"
            : state.settingsSubsection),
    })),
  closeSettings: () => set({ settingsOpen: false }),
  selectSettingsSection: (section, subsection) =>
    set({
      settingsSection: section,
      settingsSubsection: subsection ?? (section === "providers" ? "configuration" : "shortcuts"),
    }),
  onboardingOpen: false,
  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => set({ onboardingOpen: false }),
  composerFocusThreadId: null,
  focusComposer: (threadId) => set({ composerFocusThreadId: threadId }),
  issuePicker: null,
  openIssuePicker: (workspaceId) =>
    set({ issuePicker: workspaceId === undefined ? {} : { workspaceId } }),
  closeIssuePicker: () => set({ issuePicker: null }),
}))
