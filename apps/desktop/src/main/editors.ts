import { spawn } from "node:child_process"
import { stat } from "node:fs/promises"
import { ipcMain, shell } from "electron"
import which from "which"
import { IPC, type ExternalEditor, type WorkspaceScope } from "@meldshell/contracts/ipc"
import { desktopHost } from "./runtime/services"

/*
 * External editors. Each is found through the command-line launcher it installs on PATH, so an
 * editor appears only when it can actually be started. The file manager is always offered last.
 */

interface EditorCommand {
  readonly id: string
  readonly name: string
  /** Launchers to try in order; distributions name some of them differently. */
  readonly commands: readonly string[]
}

const EDITORS: readonly EditorCommand[] = [
  { id: "vscode", name: "Visual Studio Code", commands: ["code"] },
  { id: "vscode-insiders", name: "VS Code Insiders", commands: ["code-insiders"] },
  { id: "cursor", name: "Cursor", commands: ["cursor"] },
  { id: "windsurf", name: "Windsurf", commands: ["windsurf"] },
  { id: "zed", name: "Zed", commands: ["zed", "zeditor"] },
  { id: "sublime", name: "Sublime Text", commands: ["subl"] },
  { id: "idea", name: "IntelliJ IDEA", commands: ["idea", "idea.sh"] },
  { id: "webstorm", name: "WebStorm", commands: ["webstorm", "webstorm.sh"] },
  { id: "pycharm", name: "PyCharm", commands: ["pycharm", "pycharm.sh", "charm"] },
  { id: "goland", name: "GoLand", commands: ["goland", "goland.sh"] },
  { id: "rider", name: "Rider", commands: ["rider", "rider.sh"] },
  { id: "rustrover", name: "RustRover", commands: ["rustrover", "rustrover.sh"] },
]

const FILE_MANAGER: ExternalEditor = {
  id: "file-manager",
  name: process.platform === "win32" ? "File Explorer" : "File manager",
}

const locate = async (editor: EditorCommand): Promise<string | null> => {
  for (const command of editor.commands) {
    const path = await which(command, { nothrow: true })
    if (path !== null) return path
  }
  return null
}

export async function listEditors(): Promise<ExternalEditor[]> {
  const found = await Promise.all(
    EDITORS.map(async (editor) => ((await locate(editor)) === null ? [] : [editor])),
  )
  return [...found.flat().map(({ id, name }) => ({ id, name })), FILE_MANAGER]
}

/** Electron's own switches would make an Electron-based editor start as plain Node. */
const launchEnvironment = () =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("ELECTRON_")))

const launch = (file: string, folder: string): Promise<void> =>
  new Promise((resolve, reject) => {
    // Windows launchers are batch files, which only start through the command interpreter.
    const batch = process.platform === "win32" && /\.(cmd|bat)$/i.test(file)
    const child = batch
      ? spawn(`"${file}" "${folder}"`, {
          shell: true,
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: launchEnvironment(),
        })
      : spawn(file, [folder], { detached: true, stdio: "ignore", env: launchEnvironment() })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })

export async function openInEditor(scope: WorkspaceScope, editorId: string): Promise<void> {
  const host = await desktopHost.start()
  const folder = await host.scopePath(scope)
  if (
    !(await stat(folder).then(
      (entry) => entry.isDirectory(),
      () => false,
    ))
  )
    throw new Error("This folder no longer exists.")
  if (editorId === FILE_MANAGER.id) {
    const failure = await shell.openPath(folder)
    if (failure !== "") throw new Error(failure)
    return
  }
  const editor = EDITORS.find((entry) => entry.id === editorId)
  if (editor === undefined) throw new Error("MeldShell does not know this editor.")
  const file = await locate(editor)
  if (file === null) throw new Error(`${editor.name} is no longer installed on this computer.`)
  await launch(file, folder)
}

export function registerEditorIpc(): void {
  ipcMain.handle(IPC.listEditors, () => listEditors())
  ipcMain.handle(IPC.openInEditor, (_event, input: unknown) => {
    const { workspaceId, threadId, editorId } = (input ?? {}) as Record<string, unknown>
    if (typeof workspaceId !== "string" || typeof editorId !== "string")
      throw new Error("Choose a workspace and an editor.")
    return openInEditor(
      { workspaceId, threadId: typeof threadId === "string" ? threadId : undefined },
      editorId,
    )
  })
}
