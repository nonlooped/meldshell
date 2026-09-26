import { app, dialog, Notification } from "electron"
import { Effect } from "effect"
import { startHost } from "@meldshell/host/host"
import { desktopService } from "@meldshell/host/desktop-service"
import type { DesktopConnection } from "@meldshell/host/desktop-protocol"
import { windowsWslPath } from "@meldshell/host/wsl-paths"
import { IPC } from "@meldshell/contracts/ipc"
import { desktopPlatform } from "./platform"
import { createConnectionManager, type Connection } from "./connection"
import { startWsl, WslCancelled } from "./wsl"
import { getMainWindow } from "../window"

const listeners = new Set<(channel: string, args: readonly unknown[]) => void>()
const events = new Set<string>([
  IPC.runtimeChanged,
  IPC.providerStatusChanged,
  IPC.providerUpdateChanged,
  IPC.attentionRequested,
])

function publish(channel: string, args: readonly unknown[]): void {
  for (const listener of listeners) listener(channel, args)
  const window = getMainWindow()
  if (channel === "host:notification") {
    if (window?.isFocused()) return
    const [title, body, threadId] = args
    if (typeof title !== "string" || typeof body !== "string" || typeof threadId !== "string")
      return
    const notification = new Notification({ title, body })
    notification.once("click", () => {
      const main = getMainWindow()
      if (main?.isMinimized()) main.restore()
      main?.show()
      main?.focus()
      main?.webContents.send(IPC.attentionRequested, threadId)
    })
    notification.show()
  } else if (events.has(channel) && window && !window.isDestroyed())
    window.webContents.send(channel, ...args)
}

async function connectLocal(): Promise<Connection> {
  const host = await startHost(
    process.env.MELDSHELL_DATA_DIR ?? app.getPath("userData"),
    desktopPlatform(publish),
    publish,
  )
  const { methods, notifications } = desktopService(host, publish)
  return {
    request: (method, ...args) => Reflect.apply(methods[method], undefined, args),
    notify: (method, ...args) => Reflect.apply(notifications[method], undefined, args),
    close: methods.close,
    pickerPath: undefined,
  }
}

/** Windows never runs a host of its own: setup either reaches WSL or the app quits. */
async function connectWsl(disconnected: () => void): Promise<Connection> {
  let reset = false
  for (;;) {
    if (manager.stopped()) throw new Error("MeldShell is closing.")
    try {
      const { client, distribution, home } = await startWsl(publish, disconnected, reset)
      return {
        request: client.request.bind(client),
        notify: client.notify.bind(client),
        close: () => client.close(),
        pickerPath: windowsWslPath(home, distribution),
      }
    } catch (cause) {
      if (manager.stopped()) throw cause
      if (cause instanceof WslCancelled) {
        app.quit()
        throw cause
      }
      const choice = await dialog.showMessageBox({
        type: "error",
        title: "MeldShell could not start in WSL",
        message: "The Linux host is unavailable.",
        detail: `${cause instanceof Error ? cause.message : String(cause)}\n\nMeldShell will not run agents or development tools on Windows.`,
        buttons: ["Retry", "Choose distribution", "Quit"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      })
      if (choice.response === 2) {
        app.quit()
        throw cause
      }
      reset = choice.response === 1
    }
  }
}

const manager = createConnectionManager({
  connect: (disconnected) =>
    process.platform === "win32" ? connectWsl(disconnected) : connectLocal(),
  disconnected: () => {
    publish("host:disconnected", [])
    publish(IPC.runtimeChanged, [""])
  },
})

export const desktopHost = {
  start: (): Promise<DesktopConnection> => manager.connection(),
  subscribe: (listener: (channel: string, args: readonly unknown[]) => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  pickerPath: async () => (await manager.connection()).pickerPath,
  // Closing a disconnected app must not start another host or get stuck in the setup dialog.
  activeTurns: () =>
    manager
      .current()
      ?.request("activeTurns")
      .catch(() => 0) ?? Promise.resolve(0),
  stop: manager.stop,
}
export const runtime = { runPromise: Effect.runPromise, dispose: desktopHost.stop }
