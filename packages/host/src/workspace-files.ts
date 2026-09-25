import { open, readdir, realpath, stat } from "node:fs/promises"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"
import type { DirectoryEntry, FilePreview } from "@meldshell/contracts/ipc"
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

const imageType = (path: string): string | null => {
  const type = mime.getType(path)
  return type !== null && PREVIEWABLE_IMAGES.has(type) ? type : null
}

export async function readWorkspaceFile(root: string, path: string): Promise<FilePreview> {
  const target = await realpath(resolve(root, path))
  const file = await open(target, "r")
  try {
    const info = await file.stat()
    if (!info.isFile()) throw new Error("This entry is not a regular file.")
    const image = imageType(path)
    const limit = (image ? 20 : 2) * 1024 * 1024
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
