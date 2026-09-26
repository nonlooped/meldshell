import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process"
import { stat } from "node:fs/promises"
import which from "which"
import type { ExternalEditor } from "@meldshell/contracts/ipc"
import { childEnvironment } from "./environment"

export type EditorSpawn = (file: string, args: string[], options: SpawnOptions) => ChildProcess

interface EditorCommand {
  readonly id: string
  readonly name: string
  /** Launchers to try in order; distributions name some of them differently. */
  readonly commands: readonly string[]
}

const EDITORS: readonly EditorCommand[] = [
  { id: "vscode", name: "Visual Studio Code", commands: ["code"] },
  { id: "vscode-insiders", name: "VS Code Insiders", commands: ["code-insiders"] },
  { id: "vscodium", name: "VSCodium", commands: ["codium"] },
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
  // Always last, in the same environment as the host.
  {
    id: "file-manager",
    name: process.platform === "win32" ? "File Explorer" : "File manager",
    commands: process.platform === "win32" ? ["explorer.exe"] : ["xdg-open", "open"],
  },
]

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
  return found.flat().map(({ id, name }) => ({ id, name }))
}

const launch = (file: string, folder: string, spawnEditor: EditorSpawn): Promise<void> =>
  new Promise((resolve, reject) => {
    // The folder is a single argument, including when its name contains spaces or shell syntax.
    const child = spawnEditor(file, [folder], {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
      env: childEnvironment(),
    })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })

export async function openEditor(
  folder: string,
  editorId: string,
  spawnEditor: EditorSpawn = spawn,
): Promise<void> {
  if (
    !(await stat(folder).then(
      (entry) => entry.isDirectory(),
      () => false,
    ))
  )
    throw new Error("This folder no longer exists.")
  const editor = EDITORS.find((entry) => entry.id === editorId)
  if (!editor) throw new Error("MeldShell does not know this editor.")
  const file = await locate(editor)
  if (!file) throw new Error(`${editor.name} is not installed in this environment.`)
  await launch(file, folder, spawnEditor)
}
