import { join } from "node:path"
import { HostPlatform } from "@meldshell/host/platform"
import { app, utilityProcess } from "electron"

export const desktopPlatform = (
  publish: (channel: string, args: readonly unknown[]) => void,
): typeof HostPlatform.Service => ({
  databasePath: join(process.env.MELDSHELL_DATA_DIR ?? app.getPath("userData"), "meldshell.sqlite"),
  fork: (entry, label, env) =>
    utilityProcess.fork(join(__dirname, entry), [], {
      env: { ...process.env, ...env },
      serviceName: label,
      stdio: "pipe",
    }),
  notify: ({ title, body, threadId }) => publish("host:notification", [title, body, threadId]),
})
