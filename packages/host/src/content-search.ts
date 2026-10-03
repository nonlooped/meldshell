import { Worker } from "node:worker_threads"
import type { ContentSearchResult } from "@meldshell/contracts/ipc"
import { workspaceFiles } from "./workspace-search"

export interface ContentSearchOptions {
  readonly query: string
  readonly caseSensitive: boolean
  readonly regex: boolean
  readonly limit?: number | undefined
}

/** Searching stops here and returns what it found so far. */
const BUDGET_MS = 8_000
/** A pattern that is still running this long after the budget is stuck backtracking. */
const HARD_TIMEOUT_MS = BUDGET_MS + 4_000
const MAX_FILE_BYTES = 1024 * 1024
/** Longer lines, typically minified bundles, are only searched this far. */
const MAX_LINE_CHARS = 4_000
const PREVIEW_CHARS = 240
/** Characters kept before the first match when a line is cut, so it shows in a narrow sidebar. */
const PREVIEW_LEAD = 12
/** A line is only cut when its first match starts further in than this. */
const PREVIEW_CLIP_AFTER = 24
const MAX_RANGES_PER_LINE = 50

/*
 * The scan runs in a worker thread so a large workspace never blocks the host, and so a pattern
 * that backtracks without end can be stopped by terminating the thread. The source is plain
 * CommonJS evaluated by the worker, which keeps it independent of how the host is bundled.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads")
const { open } = require("node:fs/promises")
const { join } = require("node:path")
const { root, files, source, flags, limit, deadline, maxFileBytes, maxLineChars, previewChars, previewLead, previewClipAfter, maxRanges } = workerData
const pattern = new RegExp(source, flags)
const BATCH = 16

async function read(path) {
  let handle
  try {
    handle = await open(join(root, path), "r")
    const info = await handle.stat()
    if (!info.isFile() || info.size > maxFileBytes) return null
    const buffer = await handle.readFile()
    if (buffer.subarray(0, 8000).includes(0)) return null
    return buffer.toString("utf8")
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

function rangesIn(line) {
  const ranges = []
  pattern.lastIndex = 0
  let match
  while (ranges.length < maxRanges && (match = pattern.exec(line)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (end === start) {
      if (start >= line.length) break
      pattern.lastIndex = start + 1
      continue
    }
    ranges.push([start, end])
  }
  return ranges
}

function preview(line, ranges) {
  const indent = line.length - line.trimStart().length
  const start = ranges[0][0] - indent > previewClipAfter ? ranges[0][0] - previewLead : indent
  const text = line.slice(start, start + previewChars).trimEnd()
  return {
    text,
    clipped: start > indent,
    ranges: ranges
      .filter(([from]) => from - start < text.length)
      .map(([from, to]) => [Math.max(from - start, 0), Math.min(to - start, text.length)]),
  }
}

async function run() {
  const found = []
  let lineCount = 0
  let truncated = false
  scan: for (let index = 0; index < files.length; index += BATCH) {
    if (Date.now() > deadline) {
      truncated = true
      break
    }
    const batch = files.slice(index, index + BATCH)
    const texts = await Promise.all(batch.map(read))
    for (let item = 0; item < batch.length; item++) {
      const text = texts[item]
      if (text === null) continue
      pattern.lastIndex = 0
      if (!pattern.test(text)) continue
      const lines = []
      const all = text.split("\\n")
      for (let number = 0; number < all.length; number++) {
        let line = all[number]
        if (line.endsWith("\\r")) line = line.slice(0, -1)
        if (line.length > maxLineChars) line = line.slice(0, maxLineChars)
        const ranges = rangesIn(line)
        if (ranges.length === 0) continue
        if (lineCount === limit) {
          truncated = true
          if (lines.length > 0) found.push({ path: batch[item], lines })
          break scan
        }
        lines.push({ line: number + 1, ...preview(line, ranges) })
        lineCount++
      }
      if (lines.length > 0) found.push({ path: batch[item], lines })
    }
  }
  return { files: found, lineCount, truncated }
}

run().then((result) => parentPort.postMessage(result))
`

/** The pattern a query searches for; throws a readable error for an invalid expression. */
export function contentPattern(options: ContentSearchOptions): RegExp {
  const source = options.regex
    ? options.query
    : options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  try {
    return new RegExp(source, options.caseSensitive ? "gm" : "gim")
  } catch (cause) {
    throw new Error(
      `Invalid regular expression: ${cause instanceof Error ? cause.message.replace(/^Invalid regular expression: /, "") : String(cause)}`,
    )
  }
}

/** The search running in each workspace; a newer search there replaces it. */
const running = new Map<string, Worker>()

/** Matching lines in the workspace's tracked and unignored text files, in path order. */
export async function searchWorkspaceContents(
  root: string,
  options: ContentSearchOptions,
): Promise<ContentSearchResult> {
  const pattern = contentPattern(options)
  const files = [...(await workspaceFiles(root))].sort()
  running.get(root)?.terminate()
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      root,
      files,
      source: pattern.source,
      flags: pattern.flags,
      limit: Math.min(Math.max(options.limit ?? 2000, 1), 5000),
      deadline: Date.now() + BUDGET_MS,
      maxFileBytes: MAX_FILE_BYTES,
      maxLineChars: MAX_LINE_CHARS,
      previewChars: PREVIEW_CHARS,
      previewLead: PREVIEW_LEAD,
      previewClipAfter: PREVIEW_CLIP_AFTER,
      maxRanges: MAX_RANGES_PER_LINE,
    },
  })
  running.set(root, worker)
  return new Promise<ContentSearchResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("The search took too long. Try a more specific pattern."))
      void worker.terminate()
    }, HARD_TIMEOUT_MS)
    worker.once("message", (result: ContentSearchResult) => resolve(result))
    worker.once("error", reject)
    // Settling first wins, so this only reports a search that ended without an answer.
    worker.once("exit", () => {
      clearTimeout(timer)
      if (running.get(root) === worker) running.delete(root)
      reject(new Error("The search was replaced by a newer one."))
    })
  }).finally(() => void worker.terminate())
}
