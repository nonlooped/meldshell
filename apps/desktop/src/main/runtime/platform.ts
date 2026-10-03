import { join } from "node:path"
import { HostPlatform } from "@meldshell/host/platform"
import { app, utilityProcess } from "electron"
import { agentBrowserEndpoint } from "../agent-browser"

export const desktopPlatform = (
  publish: (channel: string, args: readonly unknown[]) => void,
): typeof HostPlatform.Service => ({
  databasePath: join(process.env.MELDSHELL_DATA_DIR ?? app.getPath("userData"), "meldshell.sqlite"),
  fork: (entry, label, env) => {
    const browser = agentBrowserEndpoint()
    return utilityProcess.fork(join(__dirname, entry), [], {
      env: { ...process.env, ...(browser ? { MELDSHELL_BROWSER_MCP: browser } : {}), ...env },
      serviceName: label,
      stdio: "pipe",
    })
  },
  notify: ({ title, body, threadId }) => publish("host:notification", [title, body, threadId]),
})
