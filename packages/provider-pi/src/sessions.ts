import { createReadStream } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { createInterface } from "node:readline"
import {
  asRecord,
  asText,
  type CliSessionHistory,
  type CliSessionSummary,
  type ImportedTurn,
  type UnknownRecord,
} from "@meldshell/contracts"

/*
 * Pi keeps each session as a JSONL file of entries that form a tree; the conversation is the
 * branch from the newest entry back to the root. MeldShell names a Pi session by its file path,
 * as its own turns do.
 */

const SESSION_LIMIT = 100

const expandHome = (path: string): string =>
  path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path

const agentDirectory = (): string =>
  expandHome(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"))

/** Pi's per-folder directory under its sessions folder, as Pi encodes the folder's path. */
const folderDirectory = (workspacePath: string): string =>
  join(
    agentDirectory(),
    "sessions",
    `--${resolve(workspacePath)
      .replace(/^[/\\]/, "")
      .replace(/[/\\:]/g, "-")}--`,
  )

/**
 * Where Pi stores this folder's sessions, and whether the folder is shared with other folders'
 * sessions (a configured session directory), so each file's own folder must be checked.
 */
const sessionDirectory = async (
  workspacePath: string,
): Promise<{ readonly path: string; readonly shared: boolean }> => {
  const override = process.env.PI_CODING_AGENT_SESSION_DIR
  if (override) return { path: resolve(workspacePath, expandHome(override)), shared: true }
  const settings = await readFile(join(agentDirectory(), "settings.json"), "utf8").then(
    (text) => asRecord(JSON.parse(text)),
    () => ({}) as UnknownRecord,
  )
  const configured = asText(settings.sessionDir)
  if (configured) return { path: resolve(workspacePath, expandHome(configured)), shared: true }
  return { path: folderDirectory(workspacePath), shared: false }
}

const entries = async function* (path: string): AsyncGenerator<UnknownRecord> {
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    try {
      yield asRecord(JSON.parse(line))
    } catch {
      // A partly written last line is skipped, as Pi skips it.
    }
  }
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim()

const contentText = (content: unknown): string => {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((value) => {
      const block = asRecord(value)
      return block.type === "text" ? asText(block.text) : block.type === "image" ? "[Image]" : ""
    })
    .filter(Boolean)
    .join("\n")
    .trim()
}

/** What `/resume` shows for one session file, or null when the file is not a session. */
const summary = async (
  path: string,
  workspacePath: string | null,
): Promise<CliSessionSummary | null> => {
  let header: UnknownRecord | null = null
  let name = ""
  let first = ""
  for await (const entry of entries(path)) {
    if (header === null) {
      if (entry.type !== "session") return null
      header = entry
      if (workspacePath !== null && resolve(asText(entry.cwd) || ".") !== resolve(workspacePath))
        return null
      continue
    }
    if (entry.type === "session_info") name = asText(entry.name).trim()
    const message = asRecord(entry.message)
    if (!first && entry.type === "message" && message.role === "user")
      first = contentText(message.content)
  }
  if (header === null || !first) return null
  const changed = await stat(path)
  return {
    nativeThreadId: path,
    title: oneLine(name || first) || "Pi session",
    updatedAt: changed.mtime.toISOString(),
    branch: null,
  }
}

/** The sessions Pi stored for exactly this folder, newest first. */
export const listPiSessions = async (workspacePath: string): Promise<CliSessionSummary[]> => {
  const directory = await sessionDirectory(workspacePath)
  const names = await readdir(directory.path).catch(() => [] as string[])
  const files = names
    .filter((name) => name.endsWith(".jsonl"))
    // File names start with the session's start time, so the newest sort last.
    .sort((a, b) => b.localeCompare(a))
    .map((name) => join(directory.path, name))
  const sessions = await Promise.all(
    files.map((file) => summary(file, directory.shared ? workspacePath : null).catch(() => null)),
  )
  return sessions
    .filter((session) => session !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, SESSION_LIMIT)
}

/** The entries on the session's current branch, oldest first. */
const currentBranch = (all: readonly UnknownRecord[]): UnknownRecord[] => {
  const byId = new Map(all.map((entry) => [asText(entry.id), entry]))
  const branch: UnknownRecord[] = []
  const seen = new Set<string>()
  let entry = all.at(-1)
  while (entry !== undefined && !seen.has(asText(entry.id))) {
    seen.add(asText(entry.id))
    branch.push(entry)
    const parent = entry.parentId
    entry = typeof parent === "string" ? byId.get(parent) : undefined
  }
  return branch.reverse()
}

interface Building {
  readonly text: string
  status: ImportedTurn["status"]
  readonly startedAt: string
  completedAt: string
  model: string | null
  readonly events: ImportedTurn["events"][number][]
}

/** Builds turns from a session's entries, playing each as the record Pi's RPC mode sends live. */
class TurnBuilder {
  readonly turns: Building[] = []
  private now = new Date(0).toISOString()

  private start(text: string): Building {
    const turn: Building = {
      text,
      status: "completed",
      startedAt: this.now,
      completedAt: this.now,
      model: null,
      events: [],
    }
    this.push(turn, "turn/started", { turn: { status: "inProgress" } })
    this.turns.push(turn)
    return turn
  }

  /** The turn an entry belongs to; work before any prompt opens a turn of its own. */
  private ongoing(): Building {
    return this.turns.at(-1) ?? this.start("")
  }

  private push(turn: Building, method: string, params: unknown): void {
    turn.events.push({ method, params, createdAt: this.now })
    turn.completedAt = this.now
  }

  private record(type: string, fields: UnknownRecord, turn = this.ongoing()): void {
    this.push(turn, `pi/${type}`, { type, ...fields })
  }

  accept(entry: UnknownRecord): void {
    const time = asText(entry.timestamp)
    if (time && !Number.isNaN(Date.parse(time))) this.now = new Date(time).toISOString()
    switch (entry.type) {
      case "message":
        return this.message(asRecord(entry.message))
      case "compaction":
        return this.record("compaction_end", {})
      case "branch_summary":
        return this.record("message_end", {
          message: { role: "branchSummary", summary: asText(entry.summary) },
        })
      case "custom_message":
        if (entry.display === true)
          this.record("message_end", { message: { role: "custom", content: entry.content } })
        return
      default:
        return
    }
  }

  private message(message: UnknownRecord): void {
    switch (message.role) {
      case "user": {
        // The core records the prompt itself.
        const text = contentText(message.content)
        if (text) this.start(text)
        return
      }
      case "bashExecution": {
        const turn = this.start(`! ${asText(message.command)}`)
        return this.record("message_end", { message }, turn)
      }
      case "assistant": {
        const turn = this.ongoing()
        const provider = asText(message.provider)
        const model = asText(message.model)
        if (provider && model) turn.model = `${provider}/${model}`
        if (message.stopReason === "aborted") turn.status = "interrupted"
        else if (message.stopReason === "error") turn.status = "failed"
        else turn.status = "completed"
        this.record("message_start", { message }, turn)
        return this.record("message_end", { message }, turn)
      }
      case "toolResult":
      case "custom":
      case "branchSummary":
      case "compactionSummary":
        return this.record("message_end", { message })
      default:
        // System messages carry the prompt and tools, not the conversation.
        return
    }
  }
}

/** Splits a session's current branch into turns at each message the user sent. */
const piTurns = (all: readonly UnknownRecord[]): ImportedTurn[] => {
  const builder = new TurnBuilder()
  for (const entry of currentBranch(all.filter((entry) => entry.type !== "session")))
    builder.accept(entry)
  return builder.turns.map((turn) => ({
    text: turn.text,
    status: turn.status,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    model: turn.model,
    events: [
      ...turn.events,
      {
        method: "turn/completed",
        params: { turn: { status: turn.status } },
        createdAt: turn.completedAt,
      },
    ],
  }))
}

export const readPiSession = async (
  workspacePath: string,
  path: string,
): Promise<CliSessionHistory> => {
  // Only a session file Pi stored for this folder is read.
  const directory = await sessionDirectory(workspacePath)
  if (!path.endsWith(".jsonl") || dirname(resolve(path)) !== resolve(directory.path))
    throw new Error("Pi has no stored session with this ID for this folder.")
  const all: UnknownRecord[] = []
  for await (const entry of entries(path)) all.push(entry)
  if (all[0]?.type !== "session") throw new Error("Pi has no stored session in this file.")
  let name = ""
  for (const entry of all) if (entry.type === "session_info") name = asText(entry.name).trim()
  const turns = piTurns(all)
  return { title: oneLine(name || turns[0]?.text || "") || "Pi session", turns }
}
