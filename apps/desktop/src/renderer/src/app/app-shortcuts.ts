interface ShortcutActions {
  settingsOpen: boolean
  closeSettings: () => void
  requestNewThread: () => void
  setSearchOpen: (open: boolean) => void
  setSwitcherQuery: (query: string) => void
  setSwitcherOpen: (open: boolean) => void
  openSettings: () => void
  selectedThreadId: string | null
  closeThread: (id: string) => void
  cycleTabs: (direction: 1 | -1) => void
}

export function handleAppShortcut(
  event: KeyboardEvent,
  {
    settingsOpen,
    closeSettings,
    requestNewThread,
    setSearchOpen,
    setSwitcherQuery,
    setSwitcherOpen,
    openSettings,
    selectedThreadId,
    closeThread,
    cycleTabs,
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
  switch (event.key.toLowerCase()) {
    case "n":
      event.preventDefault()
      requestNewThread()
      break
    case "k":
      event.preventDefault()
      setSearchOpen(true)
      break
    case "p":
      event.preventDefault()
      setSwitcherQuery("")
      setSwitcherOpen(true)
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
