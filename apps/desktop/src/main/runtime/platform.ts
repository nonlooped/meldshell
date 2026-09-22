import { join } from "node:path"
import { HostPlatform } from "@meldshell/host/platform"
import { app, Notification, utilityProcess } from "electron"
import { getMainWindow } from "../window"

export const desktopPlatform = (): typeof HostPlatform.Service => ({
  databasePath: join(process.env.MELDSHELL_DATA_DIR ?? app.getPath("userData"), "meldshell.sqlite"),
  fork: (entry, label, env) =>
    utilityProcess.fork(join(__dirname, entry), [], {
      env: { ...process.env, ...env },
      serviceName: label,
      stdio: "pipe",
    }),
  notify: ({ title, body, onClick }) => {
    if (getMainWindow()?.isFocused()) return
    const notification = new Notification({ title, body })
    notification.on("click", () => {
      const window = getMainWindow()
      if (window?.isMinimized()) window.restore()
      window?.show()
      window?.focus()
      onClick()
    })
    notification.show()
  },
})
