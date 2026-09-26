import type { DesktopMode } from "@meldshell/contracts/ipc"

interface SwitchActions {
  current: () => Promise<DesktopMode>
  confirm: (mode: DesktopMode) => Promise<boolean>
  save: (mode: DesktopMode) => Promise<void>
  restart: () => void
}

/**
 * Serialize restart requests; cancellation and failed persistence leave the running host alone.
 * Callers that confirm elsewhere, such as a remote browser, override confirmation and restart.
 */
export function createEnvironmentSwitcher(actions: SwitchActions) {
  let pending = false
  return async (
    mode: unknown,
    overrides: Partial<Pick<SwitchActions, "confirm" | "restart">> = {},
  ): Promise<boolean> => {
    if (mode !== "windows" && mode !== "wsl") throw new Error("Choose Windows or WSL.")
    if (pending) return false
    pending = true
    const { confirm, restart } = { ...actions, ...overrides }
    try {
      if (mode === (await actions.current()) || !(await confirm(mode))) return false
      await actions.save(mode)
      restart()
      return true
    } finally {
      pending = false
    }
  }
}
