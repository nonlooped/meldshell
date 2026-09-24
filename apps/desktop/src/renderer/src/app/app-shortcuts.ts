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
  toggleTerminal: () => void
}

export function handleAppShortcut(
  event: KeyboardEvent,
  {
    settingsOpen,
    closeSettings,
    requestNewThread,
    openThreadPalette,
    openFilePalette,
    openSettings,
    selectedThreadId,
    closeThread,
    cycleTabs,
    toggleTerminal,
  }: ShortcutActions,
): void {
  if (
    event.defaultPrevented ||
    (event.target instanceof Element &&
      event.target.closest('[role="dialog"], [role="alertdialog"]'))
  )
    return
  if (event.key === "Escape" && settingsOpen) {
    closeSettings()
    return
  }
  if (!event.ctrlKey) return
  // By position, so layouts that put another character on that key still reach the terminal.
  if (event.code === "Backquote") {
    event.preventDefault()
    toggleTerminal()
    return
  }
  switch (event.key.toLowerCase()) {
    case "n":
      event.preventDefault()
      requestNewThread()
      break
    case "k":
      event.preventDefault()
      openThreadPalette()
      break
    case "p":
      event.preventDefault()
      openFilePalette()
      break
    case ",":
      event.preventDefault()
      openSettings()
      break
    case "w":
      if (selectedThreadId === null) return
      event.preventDefault()
      closeThread(selectedThreadId)
      break
    case "tab":
      event.preventDefault()
      cycleTabs(event.shiftKey ? -1 : 1)
      break
  }
}
