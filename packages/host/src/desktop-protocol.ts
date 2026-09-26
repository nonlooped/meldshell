import type { Host } from "./host"
import type {
  ExternalEditor,
  TerminalOpenInput,
  TerminalSession,
  WorkspaceScope,
} from "@meldshell/contracts/ipc"

/** Private desktop/WSL pipe protocol. Native provider messages remain inside the host. */
export const DESKTOP_PROTOCOL = 1
interface HostInfo {
  readonly protocol: number
  readonly home: string
  readonly distribution: string | null
}
export interface DesktopMethods {
  info: () => Promise<HostInfo>
  call: Host["call"]
  addWorkspace: Host["addWorkspace"]
  activeTurns: Host["activeTurns"]
  scopePath: Host["scopePath"]
  terminalContext: Host["terminalContext"]
  "remote.status": Host["remote"]["status"]
  "remote.link": Host["remote"]["link"]
  "remote.unlink": Host["remote"]["unlink"]
  "remote.retry": Host["remote"]["retry"]
  "terminal.open": (input: TerminalOpenInput) => Promise<TerminalSession>
  "terminal.close": (id: string) => Promise<void>
  "editor.list": () => Promise<ExternalEditor[]>
  "editor.open": (scope: WorkspaceScope, id: string) => Promise<void>
  toHostPath: (path: string) => Promise<string>
  close: () => Promise<void>
}
/** Streams with no answer worth waiting for; a keystroke must not allocate a pending request. */
export interface DesktopNotifications {
  "terminal.write": (id: string, data: string) => void
  "terminal.resize": (id: string, cols: number, rows: number) => void
}
export type DesktopMethod = keyof DesktopMethods
export type DesktopNotification = keyof DesktopNotifications
export type DesktopFrame =
  | {
      readonly type: "request"
      readonly id: string
      readonly method: DesktopMethod
      readonly args: readonly unknown[]
    }
  | {
      readonly type: "notify"
      readonly method: DesktopNotification
      readonly args: readonly unknown[]
    }
  | { readonly type: "result"; readonly id: string; readonly ok: true; readonly value: unknown }
  | { readonly type: "result"; readonly id: string; readonly ok: false; readonly error: string }
  | { readonly type: "event"; readonly channel: string; readonly args: readonly unknown[] }

export interface DesktopConnection {
  request<M extends DesktopMethod>(
    method: M,
    ...args: Parameters<DesktopMethods[M]>
  ): Promise<Awaited<ReturnType<DesktopMethods[M]>>>
  notify<N extends DesktopNotification>(
    method: N,
    ...args: Parameters<DesktopNotifications[N]>
  ): void
}
