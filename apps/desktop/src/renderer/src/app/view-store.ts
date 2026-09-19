import { create } from "zustand"

export type SettingsSection = "general" | "appearance" | "providers" | "usage" | "threads" | "about"

interface ViewStore {
  /** Settings takes over the whole workbench; open tabs stay untouched behind it. */
  readonly settingsOpen: boolean
  readonly settingsSection: SettingsSection
  readonly openSettings: (section?: SettingsSection) => void
  readonly closeSettings: () => void
  readonly selectSettingsSection: (section: SettingsSection) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  settingsOpen: false,
  settingsSection: "general",
  openSettings: (section) =>
    set((state) => ({ settingsOpen: true, settingsSection: section ?? state.settingsSection })),
  closeSettings: () => set({ settingsOpen: false }),
  selectSettingsSection: (section) => set({ settingsSection: section }),
}))
