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
}

contextBridge.exposeInMainWorld("meldshell", api)
