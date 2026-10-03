import { create } from "zustand"

export type SettingsSection =
  | "threads"
  | "appearance"
  | "keyboard"
  | "providers"
  | "account"
  | "app"

interface ViewStore {
  /** Workspace views cover the workbench while preserving its open tabs. */
  readonly schedulesOpen: boolean
  readonly openSchedules: () => void
  readonly closeSchedules: () => void
  readonly closeWorkbenchViews: () => void
  readonly settingsOpen: boolean
  readonly settingsSection: SettingsSection
  /**
   * The setting or group to bring into view once its page is on screen, by its
   * `data-setting-label`. The settings view clears it after scrolling there.
   */
  readonly settingsTarget: string | null
  readonly openSettings: (section?: SettingsSection, target?: string) => void
  readonly closeSettings: () => void
  readonly selectSettingsSection: (section: SettingsSection, target?: string) => void
  readonly clearSettingsTarget: () => void
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
  /** The session picker lists terminal sessions from this workspace, or the active one. */
  readonly sessionPicker: { readonly workspaceId?: string } | null
  readonly openSessionPicker: (workspaceId?: string) => void
  readonly closeSessionPicker: () => void
}

export const useViewStore = create<ViewStore>((set) => ({
  schedulesOpen: false,
  openSchedules: () => set({ schedulesOpen: true, settingsOpen: false }),
  closeSchedules: () => set({ schedulesOpen: false }),
  closeWorkbenchViews: () => set({ schedulesOpen: false, settingsOpen: false }),
  settingsOpen: false,
  settingsSection: "threads",
  settingsTarget: null,
  openSettings: (section, target) =>
    set((state) => ({
      settingsOpen: true,
      schedulesOpen: false,
      settingsSection: section ?? state.settingsSection,
      settingsTarget: target ?? null,
    })),
  closeSettings: () => set({ settingsOpen: false, settingsTarget: null }),
  selectSettingsSection: (section, target) =>
    set({ settingsSection: section, settingsTarget: target ?? null }),
  clearSettingsTarget: () => set({ settingsTarget: null }),
  onboardingOpen: false,
  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => set({ onboardingOpen: false }),
  composerFocusThreadId: null,
  focusComposer: (threadId) => set({ composerFocusThreadId: threadId }),
  issuePicker: null,
  openIssuePicker: (workspaceId) =>
    set({ issuePicker: workspaceId === undefined ? {} : { workspaceId } }),
  closeIssuePicker: () => set({ issuePicker: null }),
  sessionPicker: null,
  openSessionPicker: (workspaceId) =>
    set({ sessionPicker: workspaceId === undefined ? {} : { workspaceId } }),
  closeSessionPicker: () => set({ sessionPicker: null }),
}))
