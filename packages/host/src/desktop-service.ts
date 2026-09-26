import { homedir } from "node:os"
import {
  DESKTOP_PROTOCOL,
  type DesktopMethods,
  type DesktopNotifications,
} from "./desktop-protocol"
import type { Host } from "./host"
import { createTerminals } from "./terminals"
import { listEditors, openEditor, type EditorSpawn } from "./editors"

export interface DesktopService {
  readonly methods: DesktopMethods
  readonly notifications: DesktopNotifications
}

/** Workstation operations shared by native desktops and the private WSL connection. */
export function desktopService(
  host: Host,
  send: (channel: string, args: unknown[]) => void,
  options: {
    toHostPath?: DesktopMethods["toHostPath"]
    spawnEditor?: EditorSpawn
  } = {},
): DesktopService {
  const terminals = createTerminals(host, send)
  return {
    methods: {
      info: async () => ({
        protocol: DESKTOP_PROTOCOL,
        home: homedir(),
        distribution: process.env.WSL_DISTRO_NAME ?? null,
      }),
      call: host.call,
      addWorkspace: host.addWorkspace,
      activeTurns: host.activeTurns,
      scopePath: host.scopePath,
      terminalContext: host.terminalContext,
      "remote.status": host.remote.status,
      "remote.link": host.remote.link,
      "remote.unlink": host.remote.unlink,
      "remote.retry": host.remote.retry,
      "terminal.open": terminals.open,
      "terminal.close": terminals.close,
      "editor.list": listEditors,
      "editor.open": async (scope, id) =>
        openEditor(await host.scopePath(scope), id, options.spawnEditor),
      toHostPath: options.toHostPath ?? (async (path) => path),
      close: async () => {
        await terminals.closeAll()
        await host.close()
      },
    },
    notifications: { "terminal.write": terminals.write, "terminal.resize": terminals.resize },
  }
}
