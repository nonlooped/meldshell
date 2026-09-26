import type { DesktopMode } from "@meldshell/contracts/ipc"

/** Serialize restart requests; cancellation and failed persistence leave the running host alone. */
export function createEnvironmentSwitcher(actions: {
  current: () => Promise<DesktopMode>
  confirm: (mode: DesktopMode) => Promise<boolean>
  save: (mode: DesktopMode) => Promise<void>
  restart: () => void
}) {
  let pending = false
  return async (mode: unknown): Promise<boolean> => {
    if (mode !== "windows" && mode !== "wsl") throw new Error("Choose Windows or WSL.")
    if (pending) return false
    pending = true
    try {
      if (mode === (await actions.current()) || !(await actions.confirm(mode))) return false
      await actions.save(mode)
      actions.restart()
      return true
    } finally {
      pending = false
    }
  }
}
