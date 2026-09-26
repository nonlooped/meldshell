import { IPC, type MeldShellApi, type TerminalSession } from "@meldshell/contracts/ipc"

export function browserTerminals(
  invoke: (method: string, args: readonly unknown[]) => Promise<unknown>,
  subscribe: (channel: string, listener: (...args: unknown[]) => void) => () => void,
  emit: (channel: string, args: readonly unknown[]) => void,
) {
  const session = crypto.randomUUID()
  const ids = new Set<string>()
  const offsets = new Map<string, number>()
  subscribe(IPC.terminalData, (id, _data, offset) => {
    if (typeof offset === "number") offsets.set(String(id), offset)
  })
  let ready: Promise<void> = Promise.resolve()
  const call = (method: string, input: object) => invoke(method, [{ session, ...input }])
  const failed = (id: string, cause: unknown) =>
    emit(IPC.terminalData, [
      id,
      `\r\n[MeldShell: ${cause instanceof Error ? cause.message : String(cause)}]\r\n`,
    ])
  const api: NonNullable<MeldShellApi["terminal"]> = {
    open: async (input) => {
      await ready
      ids.add(input.id)
      try {
        return (await call(IPC.terminalOpen, input)) as TerminalSession
      } catch (cause) {
        ids.delete(input.id)
        throw cause
      }
    },
    write: (id, data) => {
      void call(IPC.terminalWrite, { id, data }).catch((cause) => failed(id, cause))
    },
    resize: (id, cols, rows) => {
      void call(IPC.terminalResize, { id, cols, rows }).catch(() => undefined)
    },
    close: (id) => {
      ids.delete(id)
      offsets.delete(id)
      void call(IPC.terminalClose, { id }).catch(() => undefined)
    },
    onData: (listener) => subscribe(IPC.terminalData, listener as (...args: unknown[]) => void),
    onExit: (listener) => subscribe(IPC.terminalExit, listener as (...args: unknown[]) => void),
  }
  subscribe(IPC.terminalExit, (id) => ids.delete(String(id)))
  return {
    api,
    connected: () => {
      ready = call("meldshell:terminal-attach", { offsets: Object.fromEntries(offsets) }).then(
        (value) => {
          const active = value as string[]
          for (const id of active) if (!ids.has(id)) api.close(id)
          for (const id of ids) if (!active.includes(id)) emit(IPC.terminalExit, [id, 1])
        },
      )
      void ready.catch((cause) => {
        for (const id of ids) failed(id, cause)
      })
    },
    disconnected: () => {
      for (const id of ids)
        failed(
          id,
          "Connection lost. Input is not sent while offline; terminals are retained for five minutes.",
        )
    },
  }
}
