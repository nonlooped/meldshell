import { readdir, realpath } from "node:fs/promises"
import { join } from "node:path"
import type { WorkspacePathMatch } from "@meldshell/contracts/ipc"
import { git } from "./git"

const INDEX_TTL_MS = 10_000
const MAX_FILES = 50_000
/** Walked only when a workspace is not a Git repository; Git already applies ignore rules. */
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", ".hg", ".svn", "dist", "build", "out"])

interface WorkspaceIndex {
  readonly files: readonly string[]
  readonly directories: readonly string[]
}

const indexes = new Map<string, { readonly at: number; readonly index: Promise<WorkspaceIndex> }>()

/** Tracked and unignored files, or null outside a Git repository. */
const gitFiles = (root: string): Promise<string[] | null> =>
  git(
    root,
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    10_000,
    64 * 1024 * 1024,
  )
    .then((output) => output.split("\0").filter(Boolean).slice(0, MAX_FILES))
    .catch(() => null)

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const pending = [""]
  while (pending.length > 0 && files.length < MAX_FILES) {
    const directory = pending.shift()!
    const entries = await readdir(join(root, directory), { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) pending.push(path)
      } else files.push(path)
    }
  }
  return files
}

export function buildIndex(files: readonly string[]): WorkspaceIndex {
  const directories = new Set<string>()
  for (const file of files) {
    for (let slash = file.indexOf("/"); slash !== -1; slash = file.indexOf("/", slash + 1))
      directories.add(file.slice(0, slash + 1))
  }
  return { files, directories: [...directories] }
}

function workspaceIndex(root: string): Promise<WorkspaceIndex> {
  const cached = indexes.get(root)
  if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.index
  const index = realpath(root)
    .then(async (canonical) =>
      buildIndex((await gitFiles(canonical)) ?? (await walkFiles(canonical))),
    )
    .catch((cause) => {
      indexes.delete(root)
      throw cause
    })
  indexes.set(root, { at: Date.now(), index })
  return index
}

const baseName = (path: string): string => {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  return trimmed.slice(trimmed.lastIndexOf("/") + 1)
}

/** Characters of `query` appear in order in `target`; tighter runs score higher. */
function subsequenceScore(query: string, target: string): number | null {
  let score = 0
  let position = -1
  for (const character of query) {
    const next = target.indexOf(character, position + 1)
    if (next === -1) return null
    score += next === position + 1 ? 3 : 1
    position = next
  }
  return score
}

function score(query: string, path: string): number | null {
  const lowerPath = path.toLowerCase()
  const name = baseName(lowerPath)
  let value: number
  if (name === query) value = 1000
  else if (name.startsWith(query)) value = 800
  else if (name.includes(query)) value = 600
  else if (lowerPath.includes(query)) value = 400
  else {
    const fuzzy = subsequenceScore(query, lowerPath)
    if (fuzzy === null) return null
    value = fuzzy
  }
  // Prefer shallow, short paths among equally good matches.
  return value - path.split("/").length * 2 - path.length / 100
}

export function searchIndex(
  index: WorkspaceIndex,
  query: string,
  limit: number,
): WorkspacePathMatch[] {
  const normalized = query.replaceAll("\\", "/").replace(/^\.\//, "")
  const entries = [
    ...index.directories.map((path) => ({ path, directory: true })),
    ...index.files.map((path) => ({ path, directory: false })),
  ]
  // An empty query or a trailing slash browses that directory's immediate children.
  if (normalized === "" || normalized.endsWith("/")) {
    return entries
      .filter((entry) => {
        if (!entry.path.startsWith(normalized) || entry.path === normalized) return false
        const rest = entry.path.slice(normalized.length)
        const slash = rest.indexOf("/")
        return slash === -1 || slash === rest.length - 1
      })
      .sort(
        (a, b) =>
          Number(b.directory) - Number(a.directory) ||
          Number(a.path.startsWith(".")) - Number(b.path.startsWith(".")) ||
          a.path.localeCompare(b.path),
      )
      .slice(0, limit)
  }
  const lowered = normalized.toLowerCase()
  const matches: Array<WorkspacePathMatch & { score: number }> = []
  for (const entry of entries) {
    const value = score(lowered, entry.path)
    if (value !== null) matches.push({ ...entry, score: value })
  }
  return matches
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(({ path, directory }) => ({ path, directory }))
}

export async function searchWorkspacePaths(
  root: string,
  query: string,
  limit = 50,
): Promise<WorkspacePathMatch[]> {
  return searchIndex(await workspaceIndex(root), query, Math.min(Math.max(limit, 1), 200))
}
