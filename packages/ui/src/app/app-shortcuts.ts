import { actionForEvent, type Keybindings, type ShortcutAction } from "./keybindings"

interface ShortcutActions {
  settingsOpen: boolean
  closeSettings: () => void
  requestNewThread: () => void
  openIssuePicker: () => void
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
  if (action === null) return
  if (action === "closeTab" && (actions.settingsOpen || actions.selectedThreadId === null)) return
  if (action === "archiveThread" && actions.toggleArchived === null) return
  if (action === "dictate" && actions.dictate === null) return
  event.preventDefault()
  const run: Record<ShortcutAction, () => void> = {
    newThread: actions.requestNewThread,
    issuePicker: actions.openIssuePicker,
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
