import { randomUUID } from "node:crypto"
import { IPC } from "@meldshell/contracts/ipc"

const methods = new Set([
  IPC.getUpdateStatus,
  IPC.checkForUpdates,
  IPC.setUpdateChannel,
  IPC.installUpdate,
  IPC.getDesktopEnvironment,
  IPC.switchDesktopEnvironment,
  IPC.getWebPageTitle,
  "meldshell:remote-preview",
  "meldshell:restart-host",
  "meldshell:shutdown-host",
])

/** Reverse requests reach Electron through the same private pipe as native host events. */
export function administrationBridge(send: (channel: string, args: readonly unknown[]) => void) {
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >()
  return {
    handles: (method: string) => methods.has(method),
    call: (method: string, args: readonly unknown[]) =>
      new Promise<unknown>((resolve, reject) => {
        const id = randomUUID()
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error("The desktop did not confirm this action. It was not retried."))
        }, 120_000)
        pending.set(id, { resolve, reject, timer })
        send("host:administration", [id, method, args])
      }),
    result: async (id: string, ok: boolean, value: unknown) => {
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      clearTimeout(entry.timer)
      if (ok) entry.resolve(value)
      else entry.reject(new Error(String(value)))
    },
    close: () => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(new Error("The host closed before the action was confirmed."))
      }
      pending.clear()
    },
  }
}
