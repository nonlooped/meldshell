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
  onProviderUpdate: on(IPC.providerUpdateChanged),
  onRuntimeChanged: (listener) =>
    on<[string, boolean?]>(IPC.runtimeChanged)((threadId, snapshotChanged = true) =>
      listener(threadId, snapshotChanged),
    ),
  onOpenAttention: on(IPC.attentionRequested),
  onUpdateStatus: on(IPC.updateStatusChanged),
  desktop: {
    ...(process.platform === "win32"
      ? {
          environment: {
            get: () => ipcRenderer.invoke(IPC.getDesktopEnvironment),
            switch: (mode: import("@meldshell/contracts/ipc").DesktopMode) =>
              ipcRenderer.invoke(IPC.switchDesktopEnvironment, mode),
          },
        }
      : {}),
    listEditors: () => ipcRenderer.invoke(IPC.listEditors),
    openInEditor: (input) => ipcRenderer.invoke(IPC.openInEditor, input),
    revealFile: (input) => ipcRenderer.invoke(IPC.revealFile, input),
    threadPort: (threadId) => ipcRenderer.invoke(IPC.threadPort, threadId),
    openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
    setAttention: (count) => ipcRenderer.send(IPC.setAttention, count),
    agentBrowser: {
      attach: (threadId, webContentsId) =>
        ipcRenderer.send(IPC.agentBrowserAttach, threadId, webContentsId),
      onShow: on(IPC.agentBrowserShow),
      onActivity: on(IPC.agentBrowserActivity),
    },
    threadWindows: {
      open: (threadId) => ipcRenderer.invoke(IPC.openThreadWindow, threadId),
      dock: (threadId) => ipcRenderer.invoke(IPC.dockThreadWindow, threadId),
      list: () => ipcRenderer.invoke(IPC.listThreadWindows),
      onChange: on(IPC.threadWindowsChanged),
    },
    designMode: {
      pick: (webContentsId, accent) =>
        ipcRenderer.invoke(IPC.designModePick, webContentsId, accent),
      cancel: (webContentsId) => ipcRenderer.send(IPC.designModeCancel, webContentsId),
    },
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
