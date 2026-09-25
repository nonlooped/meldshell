import type { MeldShellApi } from "@meldshell/contracts/ipc"
import { IPC, createInvoker } from "@meldshell/contracts/ipc"
import { contextBridge, ipcRenderer } from "electron"

/** Subscribes to a main-process channel, dropping the event argument; returns the unsubscribe. */
const on =
  <Args extends unknown[]>(channel: string) =>
  (listener: (...args: Args) => void): (() => void) => {
    const handle = (_event: Electron.IpcRendererEvent, ...args: Args): void => listener(...args)
    ipcRenderer.on(channel, handle)
    return () => ipcRenderer.removeListener(channel, handle)
  }

const api: MeldShellApi = {
  platform: process.platform,
  ...createInvoker((channel, ...args) => ipcRenderer.invoke(channel, ...args)),
  onProviderStatus: on(IPC.providerStatusChanged),
  onRuntimeChanged: (listener) =>
    on<[string, boolean?]>(IPC.runtimeChanged)((threadId, snapshotChanged = true) =>
      listener(threadId, snapshotChanged),
    ),
  onOpenAttention: on(IPC.attentionRequested),
  onUpdateStatus: on(IPC.updateStatusChanged),
  desktop: {
    listEditors: () => ipcRenderer.invoke(IPC.listEditors),
    openInEditor: (input) => ipcRenderer.invoke(IPC.openInEditor, input),
    threadPort: (threadId) => ipcRenderer.invoke(IPC.threadPort, threadId),
    openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  },
  terminal: {
    open: (input) => ipcRenderer.invoke(IPC.terminalOpen, input),
    // Keystrokes and resizes need no reply, so they skip invoke's round trip.
    write: (id, data) => ipcRenderer.send(IPC.terminalWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.terminalResize, id, cols, rows),
    close: (id) => ipcRenderer.send(IPC.terminalClose, id),
    onData: on(IPC.terminalData),
    onExit: on(IPC.terminalExit),
  },
}

contextBridge.exposeInMainWorld("meldshell", api)
