import type { MeldShellApi } from "@meldshell/contracts/ipc"
import { IPC, createInvoker } from "@meldshell/contracts/ipc"
import { contextBridge, ipcRenderer } from "electron"

const api: MeldShellApi = {
  platform: process.platform,
  ...createInvoker((channel, ...args) => ipcRenderer.invoke(channel, ...args)),
  onProviderStatus: (listener) => {
    const handleStatus = (
      _event: Electron.IpcRendererEvent,
      status: Parameters<typeof listener>[0],
    ): void => listener(status)
    ipcRenderer.on(IPC.providerStatusChanged, handleStatus)
    return () => ipcRenderer.removeListener(IPC.providerStatusChanged, handleStatus)
  },
  onCodexStatus: (listener) => {
    const handleStatus = (
      _event: Electron.IpcRendererEvent,
      status: Parameters<typeof listener>[0],
    ): void => {
      if (status.harness === "codex") listener(status)
    }
    ipcRenderer.on(IPC.providerStatusChanged, handleStatus)
    return () => ipcRenderer.removeListener(IPC.providerStatusChanged, handleStatus)
  },
  onRuntimeChanged: (listener) => {
    const handleChange = (
      _event: Electron.IpcRendererEvent,
      threadId: string,
      snapshotChanged = true,
    ): void => {
      listener(threadId, snapshotChanged)
    }
    ipcRenderer.on(IPC.runtimeChanged, handleChange)
    return () => ipcRenderer.removeListener(IPC.runtimeChanged, handleChange)
  },
  onOpenAttention: (listener) => {
    const handleAttention = (_event: Electron.IpcRendererEvent, threadId: string): void => {
      listener(threadId)
    }
    ipcRenderer.on(IPC.attentionRequested, handleAttention)
    return () => ipcRenderer.removeListener(IPC.attentionRequested, handleAttention)
  },
  onUpdateStatus: (listener) => {
    const handleStatus = (
      _event: Electron.IpcRendererEvent,
      status: Parameters<typeof listener>[0],
    ): void => listener(status)
    ipcRenderer.on(IPC.updateStatusChanged, handleStatus)
    return () => ipcRenderer.removeListener(IPC.updateStatusChanged, handleStatus)
  },
  terminal: {
    open: (input) => ipcRenderer.invoke(IPC.terminalOpen, input),
    // Keystrokes and resizes need no reply, so they skip invoke's round trip.
    write: (id, data) => ipcRenderer.send(IPC.terminalWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.terminalResize, id, cols, rows),
    close: (id) => ipcRenderer.send(IPC.terminalClose, id),
    onData: (listener) => {
      const handleData = (_event: Electron.IpcRendererEvent, id: string, data: string): void =>
        listener(id, data)
      ipcRenderer.on(IPC.terminalData, handleData)
      return () => ipcRenderer.removeListener(IPC.terminalData, handleData)
    },
    onExit: (listener) => {
      const handleExit = (_event: Electron.IpcRendererEvent, id: string, code: number): void =>
        listener(id, code)
      ipcRenderer.on(IPC.terminalExit, handleExit)
      return () => ipcRenderer.removeListener(IPC.terminalExit, handleExit)
    },
  },
}

contextBridge.exposeInMainWorld("meldshell", api)
