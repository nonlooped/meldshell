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
  openIssuePicker: () => void
  openThreadPalette: () => void
  openFilePalette: () => void
  /** Shows the files sidebar's search and focuses it. */
  searchFiles: () => void
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
  /**
   * Pops the thread in front out into its own window, or a popped-out window's thread back into the
   * main window; null when no thread is in front or this client cannot open windows.
   */
  popOutThread: (() => void) | null
  /** Starts or stops dictation in the thread in front; null when no thread is. */
  dictate: (() => void) | null
  /** Puts the caret in the composer of the thread in front; null when no thread is. */
  focusComposer: (() => void) | null
  /** Moves focus to the next pane of a split; null while a single pane is shown. */
  nextPane: (() => void) | null
  /**
   * Applies the saved loadout in `slot` (from 0) to the thread in front; null when no thread is.
   * Slots without a loadout leave the key to the focused element.
   */
  applyLoadout: ((slot: number) => void) | null
  loadoutCount: number
}

const isLoadoutAction = (action: ShortcutAction): action is LoadoutAction =>
  (LOADOUT_ACTIONS as readonly string[]).includes(action)

/** Actions that have nothing to act on right now leave the key to the focused element. */
function unavailable(action: ShortcutAction, actions: ShortcutActions): boolean {
  const idle: Partial<Record<ShortcutAction, boolean>> = {
    closeTab: actions.settingsOpen || actions.selectedThreadId === null,
    archiveThread: actions.toggleArchived === null,
    dictate: actions.dictate === null,
    focusComposer: actions.focusComposer === null,
    nextPane: actions.nextPane === null,
    popOutThread: actions.popOutThread === null,
  }
  return idle[action] === true
}

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
  if (action === null || unavailable(action, actions)) return
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
    issuePicker: actions.openIssuePicker,
    threadPalette: actions.openThreadPalette,
    filePalette: actions.openFilePalette,
    searchFiles: actions.searchFiles,
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
    popOutThread: () => actions.popOutThread?.(),
    dictate: () => actions.dictate?.(),
    focusComposer: () => actions.focusComposer?.(),
    nextPane: () => actions.nextPane?.(),
  }
  run[action]()
}
