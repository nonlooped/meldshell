import { readdir, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, isAbsolute, join } from "node:path"
import type { HostFolders } from "@meldshell/contracts/ipc"

export async function workspaceFolder(path: string): Promise<string> {
  if (!isAbsolute(path) || path.includes("\0"))
    throw new Error("Enter an absolute host folder path.")
  const resolved = await realpath(path)
  if (!(await stat(resolved)).isDirectory()) throw new Error("Choose a folder on the host.")
  return resolved
}

/** Authenticated owners can browse the host, including folders outside existing workspaces. */
export async function browseHostFolders(input: string): Promise<HostFolders> {
  const path = await workspaceFolder(input || homedir())
  const entries = await readdir(path, { withFileTypes: true })
  const folders = await Promise.all(
    entries.map(async (entry) => {
      const child = join(path, entry.name)
      const directory =
        entry.isDirectory() ||
        (entry.isSymbolicLink() &&
          (await stat(child).then(
            (s) => s.isDirectory(),
            () => false,
          )))
      return directory ? { name: entry.name, path: child } : null
    }),
  )
  return {
    path,
    parent: dirname(path) === path ? null : dirname(path),
    folders: folders.filter((entry) => entry !== null).sort((a, b) => a.name.localeCompare(b.name)),
  }
}
