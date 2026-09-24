import { actionForEvent, type Keybindings, type ShortcutAction } from "./keybindings"

interface ShortcutActions {
  settingsOpen: boolean
  closeSettings: () => void
  requestNewThread: () => void
  openThreadPalette: () => void
  openFilePalette: () => void
  openSettings: () => void
  selectedThreadId: string | null
  closeThread: (id: string) => void
  cycleTabs: (direction: 1 | -1) => void
  toggleInbox: () => void
  toggleSourceControl: () => void
  toggleTerminal: () => void
  openInEditor: () => void
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
  if (action === "closeTab" && actions.selectedThreadId === null) return
  event.preventDefault()
  const run: Record<ShortcutAction, () => void> = {
    newThread: actions.requestNewThread,
    threadPalette: actions.openThreadPalette,
    filePalette: actions.openFilePalette,
    settings: actions.openSettings,
    closeTab: () => {
      if (actions.selectedThreadId !== null) actions.closeThread(actions.selectedThreadId)
    },
    nextTab: () => actions.cycleTabs(1),
    previousTab: () => actions.cycleTabs(-1),
    toggleInbox: actions.toggleInbox,
    toggleSourceControl: actions.toggleSourceControl,
    toggleTerminal: actions.toggleTerminal,
    openInEditor: actions.openInEditor,
  }
  run[action]()
}
