import { app } from "electron"
import { IPC, errorMessage } from "@meldshell/contracts"
import { Effect } from "effect"
import { desktopHost } from "./runtime/services"
import { switchEnvironment } from "./runtime/environment"
import { installingUpdate, markInstallingUpdate, quitting, stopProviders } from "./runtime/shutdown"
import { setUpdateChannel, updateService } from "./updater"
import { getWebPageTitle } from "./web-page-title"
import { remotePreview } from "./remote-preview"

let restarting = false
const scheduleRestart = (action: () => Promise<void> | void) => {
  if (restarting) throw new Error("A host restart is already in progress.")
  restarting = true
  // Acknowledge through the private pipe and relay before shutting either down.
  setTimeout(() => {
    void Promise.resolve(action()).catch((cause) => {
      restarting = false
      console.error(cause)
    })
  }, 1000)
  return true
}

const relaunch = () => {
  app.relaunch()
  app.quit()
}

/** The browser already confirmed; the shared switcher still serializes it with local switches. */
const switchRemoteEnvironment = (mode: unknown) => {
  if (process.platform !== "win32") throw new Error("Choose a supported execution environment.")
  return switchEnvironment(mode, {
    confirm: async () => !restarting && !quitting && !installingUpdate,
    restart: () => scheduleRestart(relaunch),
  })
}

async function execute(method: string, args: readonly unknown[]): Promise<unknown> {
  if (method === "meldshell:remote-preview") return remotePreview(args[0])
  if (method === IPC.getWebPageTitle)
    return typeof args[0] === "string" ? getWebPageTitle(args[0]) : null
  if (method === IPC.getUpdateStatus) return updateService.status
  if (method === IPC.checkForUpdates) return updateService.check()
  if (method === IPC.setUpdateChannel) {
    if (args[0] !== "stable" && args[0] !== "nightly") throw new Error("Unknown update channel.")
    return setUpdateChannel(args[0])
  }
  if (method === IPC.installUpdate) {
    if (updateService.status.state !== "ready") return false
    return scheduleRestart(async () => {
      await Effect.runPromise(stopProviders)
      markInstallingUpdate()
      updateService.install()
    })
  }
  if (method === IPC.getDesktopEnvironment)
    return process.platform === "win32" ? desktopHost.environment() : null
  if (method === IPC.switchDesktopEnvironment) return switchRemoteEnvironment(args[0])
  if (method === "meldshell:restart-host") return scheduleRestart(relaunch)
  if (method === "meldshell:shutdown-host") return scheduleRestart(() => app.quit())
  throw new Error("Unknown administration action.")
}

export function registerRemoteAdministration(): void {
  desktopHost.subscribe((channel, args) => {
    if (channel !== "host:administration") return
    const [id, method, input] = args
    if (typeof id !== "string" || typeof method !== "string" || !Array.isArray(input)) return
    void desktopHost
      .start()
      .then(async (host) => {
        try {
          await host.request("administrationResult", id, true, await execute(method, input))
        } catch (cause) {
          await host.request("administrationResult", id, false, errorMessage(cause))
        }
      })
      .catch(console.error)
  })
}
