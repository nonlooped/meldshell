import {
  actionForEvent,
  type Keybindings,
  LOADOUT_ACTIONS,
  type LoadoutAction,
  type ShortcutAction,
} from "./keybindings"

interface ShortcutActions {
  settingsOpen: boolean
  closeSettings: () => void
  requestNewThread: () => void
  openThreadPalette: () => void
  openFilePalette: () => void
  openSettings: () => void
  selectedThreadId: string | null
  closeThread: (id: string) => void
  /** Archives or restores the thread in front; null when no thread is. */
  toggleArchived: (() => void) | null
  cycleTabs: (direction: 1 | -1) => void
  toggleInbox: () => void
  toggleSourceControl: () => void
  toggleTerminal: () => void
  togglePreview: () => void
  openInEditor: () => void
  /** Starts or stops dictation in the thread in front; null when no thread is. */
  dictate: (() => void) | null
  /**
   * Applies the saved loadout in `slot` (from 0) to the thread in front; null when no thread is.
   * Slots without a loadout leave the key to the focused element.
   */
  applyLoadout: ((slot: number) => void) | null
  loadoutCount: number
}

const isLoadoutAction = (action: ShortcutAction): action is LoadoutAction =>
  (LOADOUT_ACTIONS as readonly string[]).includes(action)

export function handleAppShortcut(
  event: KeyboardEvent,
  bindings: Keybindings,
  actions: ShortcutActions,
): void {
  if (
    event.defaultPrevented ||
    (event.target instanceof Element &&
      event.target.closest('[role="dialog"], [role="alertdialog"]'))
  )
    return
  if (event.key === "Escape" && actions.settingsOpen) {
    actions.closeSettings()
    return
  }
  const action = actionForEvent(event, bindings)
  if (action === null) return
  if (action === "closeTab" && actions.selectedThreadId === null) return
  if (action === "archiveThread" && actions.toggleArchived === null) return
  if (action === "dictate" && actions.dictate === null) return
  if (isLoadoutAction(action)) {
    const slot = LOADOUT_ACTIONS.indexOf(action)
    if (actions.applyLoadout === null || slot >= actions.loadoutCount) return
    event.preventDefault()
    actions.applyLoadout(slot)
    return
  }
  event.preventDefault()
  const run: Record<Exclude<ShortcutAction, LoadoutAction>, () => void> = {
    newThread: actions.requestNewThread,
    threadPalette: actions.openThreadPalette,
    filePalette: actions.openFilePalette,
    settings: actions.openSettings,
    closeTab: () => {
      if (actions.selectedThreadId !== null) actions.closeThread(actions.selectedThreadId)
    },
    archiveThread: () => actions.toggleArchived?.(),
    nextTab: () => actions.cycleTabs(1),
    previousTab: () => actions.cycleTabs(-1),
    toggleInbox: actions.toggleInbox,
    toggleSourceControl: actions.toggleSourceControl,
    toggleTerminal: actions.toggleTerminal,
    togglePreview: actions.togglePreview,
    openInEditor: actions.openInEditor,
    dictate: () => actions.dictate?.(),
  }
  run[action]()
}
