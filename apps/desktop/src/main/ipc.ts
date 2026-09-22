import { basename, dirname, extname } from "node:path"
import { dialog, ipcMain, nativeImage, shell } from "electron"
import { Effect } from "effect"
import { IPC, type AppSnapshot } from "@meldshell/contracts"
import type { ComposerAttachment } from "@meldshell/contracts/ipc"
import { hostOperations } from "@meldshell/host/api"
import { desktopHost } from "./runtime/services"
import { confirmAndClose, markInstallingUpdate, prepareToClose } from "./runtime/shutdown"
import { getMainWindow, applyAppearance } from "./window"
import { updateService } from "./updater"
import { getWebPageTitle } from "./web-page-title"

const controlURL =
  import.meta.env.VITE_CONTROL_URL || (import.meta.env.DEV ? "http://localhost:3001" : "")

const selectAttachments = Effect.gen(function* () {
  const options: Electron.OpenDialogOptions = {
    title: "Attach files to this turn",
    buttonLabel: "Attach",
    properties: ["openFile", "multiSelections"],
  }
  const currentWindow = getMainWindow()
  const choice = yield* Effect.tryPromise({
    try: () =>
      currentWindow === null
        ? dialog.showOpenDialog(options)
        : dialog.showOpenDialog(currentWindow, options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })
  if (choice.canceled) return []
  const imageExtensions = new Set([".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"])
  return yield* Effect.promise(() =>
    Promise.all(
      choice.filePaths.map(async (path): Promise<ComposerAttachment> => {
        if (basename(path).toLowerCase() === "skill.md") {
          return { type: "skill", value: path, name: basename(dirname(path)) }
        }
        if (imageExtensions.has(extname(path).toLowerCase())) {
          const previewUrl = await nativeImage
            .createThumbnailFromPath(path, { width: 160, height: 160 })
            .then((image) => (image.isEmpty() ? undefined : image.toDataURL()))
            .catch(() => undefined)
          return { type: "localImage", value: path, name: basename(path), previewUrl }
        }
        return { type: "mention", value: path, name: basename(path) }
      }),
    ),
  )
})

export const registerIpc = (): void => {
  for (const channel of Object.keys(hostOperations)) {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      if (
        channel === IPC.gitFileAction &&
        (args[0] as { action?: unknown })?.action === "restore"
      ) {
        const result = await dialog.showMessageBox({
          type: "warning",
          title: "Restore file?",
          message: "Discard unstaged changes to this file?",
          detail: "Untracked files will be deleted. This cannot be undone.",
          buttons: ["Cancel", "Restore"],
          defaultId: 0,
          cancelId: 0,
        })
        if (result.response !== 1) return
      }
      const result = await (await desktopHost.start()).call(channel, args)
      if (channel === IPC.getSnapshot || channel === IPC.setAppSettings)
        applyAppearance(result as AppSnapshot)
      return result
    })
  }
  ipcMain.handle(IPC.getWebPageTitle, (_event, url: unknown) =>
    typeof url === "string" ? getWebPageTitle(url) : null,
  )
  ipcMain.handle(IPC.addWorkspace, async () => {
    const options: Electron.OpenDialogOptions = {
      title: "Add a workspace",
      buttonLabel: "Add workspace",
      properties: ["openDirectory", "createDirectory"],
    }
    const window = getMainWindow()
    const choice = await (window
      ? dialog.showOpenDialog(window, options)
      : dialog.showOpenDialog(options))
    const host = await desktopHost.start()
    return choice.canceled || !choice.filePaths[0]
      ? host.call(IPC.getSnapshot, [])
      : host.addWorkspace(choice.filePaths[0])
  })
  ipcMain.handle(IPC.selectAttachments, () => Effect.runPromise(selectAttachments))
  ipcMain.handle(IPC.closeApp, () => Effect.runPromise(confirmAndClose))
  ipcMain.handle(IPC.getUpdateStatus, () => updateService.status)
  ipcMain.handle(IPC.checkForUpdates, () => updateService.check())
  ipcMain.handle(IPC.installUpdate, async () => {
    if (updateService.status.state !== "ready") return false
    if (!(await Effect.runPromise(prepareToClose))) return false
    markInstallingUpdate()
    return updateService.install()
  })
  const remote = async () => (await desktopHost.start()).remote
  ipcMain.handle(IPC.getRemoteStatus, async () => (await remote()).status())
  ipcMain.handle(IPC.linkRemote, async () => {
    if (!controlURL) throw new Error("This build has no account service configured.")
    return (await remote()).link(controlURL)
  })
  ipcMain.handle(IPC.openRemotePage, async (_event, raw: unknown) => {
    const status = await (await remote()).status()
    const url = raw === "sign-in" ? status.linking?.verificationURL : `${status.siteURL}/dashboard`
    if (!url?.startsWith("http")) throw new Error("This page is no longer available.")
    await shell.openExternal(url)
  })
  ipcMain.handle(IPC.unlinkRemote, async () => (await remote()).unlink())
}
