import { app } from "electron"
import { Effect } from "effect"
import { startHost, type Host } from "@meldshell/host/host"
import { desktopPlatform } from "./platform"
import { getMainWindow } from "../window"

let starting: Promise<Host> | undefined
let stopping: Promise<void> | undefined
const start = () =>
  (starting ??= startHost(
    process.env.MELDSHELL_DATA_DIR ?? app.getPath("userData"),
    desktopPlatform(),
    (channel, args) => {
      const window = getMainWindow()
      if (window && !window.isDestroyed()) window.webContents.send(channel, ...args)
    },
  ))
export const desktopHost = {
  start,
  stop: () =>
    (stopping ??= (async () => {
      const host = await starting?.catch(() => undefined)
      await host?.close()
    })()),
}
export const runtime = { runPromise: Effect.runPromise, dispose: desktopHost.stop }
