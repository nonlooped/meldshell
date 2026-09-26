import { app, dialog, ipcMain } from "electron"
import { IPC } from "@meldshell/contracts/ipc"
import { desktopHost } from "./services"
import { writeDesktopMode } from "./environment-settings"
import { createEnvironmentSwitcher } from "./environment-switch"
import { quitting, installingUpdate } from "./shutdown"

export const switchEnvironment = createEnvironmentSwitcher({
  current: async () => (await desktopHost.environment()).mode,
  confirm: async (mode) => {
    if (quitting || installingUpdate) return false
    const active = await desktopHost.activeTurns()
    const label = mode === "windows" ? "Windows" : "WSL"
    const answer = await dialog.showMessageBox({
      type: active > 0 ? "warning" : "question",
      title: `Switch to ${label}?`,
      message: `Restart MeldShell in ${label} mode?`,
      detail: `${active > 0 ? `${active} running agent turn(s) will be interrupted. ` : ""}Terminals will close. Threads, settings, and provider sign-ins stay in their current environment and return when you switch back. ${mode === "wsl" ? "WSL uses Linux tools in your selected distribution." : "Windows uses only native Windows tools."}`,
      buttons: ["Cancel", "Restart and switch"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    return answer.response === 1 && !quitting && !installingUpdate
  },
  save: (mode) => writeDesktopMode(app.getPath("userData"), mode),
  restart: () => {
    app.relaunch()
    // The existing before-quit handler closes providers, PTYs, and the database before exit.
    app.quit()
  },
})

export function registerEnvironmentIpc(): void {
  if (process.platform !== "win32") return
  ipcMain.handle(IPC.getDesktopEnvironment, () => desktopHost.environment())
  ipcMain.handle(IPC.switchDesktopEnvironment, (_event, mode: unknown) => switchEnvironment(mode))
}
