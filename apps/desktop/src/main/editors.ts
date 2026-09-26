import { ipcMain } from "electron"
import { IPC } from "@meldshell/contracts/ipc"
import { desktopHost } from "./runtime/services"

/** Editors and the file manager live where the folders are: in the host environment. */
export function registerEditorIpc(): void {
  ipcMain.handle(IPC.listEditors, async () => (await desktopHost.start()).request("editor.list"))
  ipcMain.handle(IPC.openInEditor, async (_event, input: unknown) => {
    const { workspaceId, threadId, editorId } = (input ?? {}) as Record<string, unknown>
    if (typeof workspaceId !== "string" || typeof editorId !== "string")
      throw new Error("Choose a workspace and an editor.")
    const scope = { workspaceId, threadId: typeof threadId === "string" ? threadId : undefined }
    await (await desktopHost.start()).request("editor.open", scope, editorId)
  })
}
