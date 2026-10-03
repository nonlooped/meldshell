import { lstat, mkdir, open, readdir, realpath, rename, rm, stat } from "node:fs/promises"
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path"
import type {
  DirectoryEntry,
  FilePreview,
  WorkspaceFileActionInput,
} from "@meldshell/contracts/ipc"
import mime from "mime"
import { git, gitValue, parseStatus } from "./git"

async function workspaceFile(root: string, path: string): Promise<string> {
  const canonicalRoot = await realpath(root)
  const target = await realpath(resolve(canonicalRoot, path))
  const within = relative(canonicalRoot, target)
  if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within))
    throw new Error("This path is outside the workspace.")
  return target
}

export const workspaceAbsolutePath = workspaceFile

function entryName(name: string | undefined): string {
  const trimmed = name?.trim() ?? ""
  if (!trimmed || trimmed === "." || trimmed === ".." || /[/\\\0]/.test(trimmed))
    throw new Error("Enter a file or folder name without path separators.")
  return trimmed
}

async function existingEntry(root: string, path: string): Promise<string> {
  if (
    !path ||
    isAbsolute(path) ||
    path.split(/[/\\]/).some((part) => part === ".." || part === ".") ||
    !basename(path) ||
    basename(path) === "." ||
    basename(path) === ".."
  )
    throw new Error("Select a file or folder inside the workspace.")
  const parent = await workspaceFile(root, dirname(path))
  const target = resolve(parent, basename(path))
  await lstat(target)
  return target
}

export async function workspaceFileAction(
  root: string,
  input: Pick<WorkspaceFileActionInput, "path" | "action" | "name">,
): Promise<void> {
  if (input.action === "create-file" || input.action === "create-folder") {
    const parent = await workspaceFile(root, input.path)
    const target = resolve(parent, entryName(input.name))
    if (input.action === "create-folder") await mkdir(target)
    else await (await open(target, "wx")).close()
    return
  }
  const target = await existingEntry(root, input.path)
  if (input.action === "delete") {
    await rm(target, { recursive: true, force: false })
    return
  }
  const destination = resolve(dirname(target), entryName(input.name))
  if (destination === target) return
  const occupied = await lstat(destination).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false
      throw error
    },
  )
  if (occupied) throw new Error("A file or folder with that name already exists.")
  await rename(target, destination)
}

/** Entry states for one directory; a folder outside Git has none. */
const directoryStatus = (cwd: string): Promise<string> =>
  git(
    cwd,
    ["status", "--porcelain=v1", "-z", "--ignored=matching", "--untracked-files=normal", "--", "."],
    10_000,
  ).catch(() => "")

export async function listDirectory(root: string, path: string): Promise<DirectoryEntry[]> {
  const directory = await workspaceFile(root, path)
  // Only enumerate this directory. In particular, never walk ignored dependency trees.
  const [entries, status] = await Promise.all([
    readdir(directory, { withFileTypes: true }),
    directoryStatus(directory),
  ])
  const changes = parseStatus(status)
  // Git porcelain paths are repository-relative, even when invoked in a subdirectory.
  const prefix = (await gitValue(directory, ["rev-parse", "--show-prefix"])) ?? ""
  const result: DirectoryEntry[] = []
  for (const entry of entries) {
    const entryPath = path ? `${path.replaceAll("\\", "/")}/${entry.name}` : entry.name
    const gitPath = `${prefix}${entry.name}`
    const matching = changes.filter(
      (change) => change.path === gitPath || change.path.startsWith(`${gitPath}/`),
    )
    const state =
      matching.find((change) => !["!!", "??"].includes(change.status))?.status ??
      matching[0]?.status ??
      ""
    const directoryEntry =
      entry.isDirectory() ||
      (entry.isSymbolicLink() &&
        (await stat(resolve(directory, entry.name)).then(
          (info) => info.isDirectory(),
          () => false,
        )))
    result.push({ name: entry.name, path: entryPath, directory: directoryEntry, status: state })
  }
  return result.sort(
    (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name),
  )
}

/** Image formats the viewer shows as pictures; any other file previews as text or not at all. */
const PREVIEWABLE_IMAGES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/vnd.microsoft.icon",
  "image/bmp",
  "image/avif",
])

/** Video formats the viewer plays; Chromium decodes these without extra codecs. */
const PLAYABLE_VIDEOS = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-m4v",
])

const imageType = (path: string): string | null => {
  const type = mime.getType(path)
  return type !== null && PREVIEWABLE_IMAGES.has(type) ? type : null
}

const videoType = (path: string): string | null => {
  const type = mime.getType(path)
  return type !== null && PLAYABLE_VIDEOS.has(type) ? type : null
}

/** The largest file each kind of preview reads, in megabytes. */
const previewLimit = (image: boolean, video: boolean): number => (video ? 64 : image ? 20 : 2)

export async function readWorkspaceFile(root: string, path: string): Promise<FilePreview> {
  const target = await realpath(resolve(root, path))
  const file = await open(target, "r")
  try {
    const info = await file.stat()
    if (!info.isFile()) throw new Error("This entry is not a regular file.")
    const image = imageType(path)
    const video = videoType(path)
    const limit = previewLimit(image !== null, video !== null) * 1024 * 1024
    if (info.size > limit)
      return {
        kind: "unsupported",
        content: `Preview unavailable: file exceeds ${limit / 1024 / 1024} MB.`,
      }
    // Bound the read as well as the stat check, in case the file grows concurrently.
    const bytes = Buffer.alloc(Math.min(info.size + 1, limit + 1))
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead > limit) return { kind: "unsupported", content: "File is too large to preview." }
    const data = bytes.subarray(0, bytesRead)
    if (image) return { kind: "image", content: `data:${image};base64,${data.toString("base64")}` }
    if (video) return { kind: "video", content: `data:${video};base64,${data.toString("base64")}` }
    if (data.includes(0))
      return { kind: "unsupported", content: "Binary file preview is unavailable." }
    const extension = extname(path).toLowerCase()
    return {
      kind: [".md", ".markdown"].includes(extension)
        ? "markdown"
        : [".html", ".htm"].includes(extension)
          ? "html"
          : "text",
      content: data.toString("utf8"),
    }
  } finally {
    await file.close()
  }
}
