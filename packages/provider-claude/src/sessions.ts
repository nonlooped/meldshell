import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import {
  getSessionInfo,
  getSessionMessages,
  listSessions,
  type SDKMessage,
  type SessionMessage,
} from "@anthropic-ai/claude-agent-sdk"
import {
  asRecord,
  type CliSessionHistory,
  type CliSessionSummary,
  type ImportedTurn,
} from "@meldshell/contracts"
import { ClaudeEvents } from "./events"

const SESSION_LIMIT = 100

/**
 * The sessions Claude Code stored for exactly this folder, newest first. Sessions MeldShell or
 * another program ran through the SDK are left out, as Claude Code's own `/resume` leaves them out.
 */
export const listClaudeSessions = async (workspacePath: string): Promise<CliSessionSummary[]> => {
  const sessions = await listSessions({
    dir: workspacePath,
    includeWorktrees: false,
    includeProgrammatic: false,
    limit: SESSION_LIMIT,
  })
  return sessions.map((session) => ({
    nativeThreadId: session.sessionId,
    title: oneLine(session.customTitle ?? session.summary) || "Claude Code session",
    updatedAt: new Date(session.lastModified).toISOString(),
    branch: session.gitBranch ?? null,
  }))
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim()

const configDirectory = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")

/** The session's transcript file, found by name in whichever project folder holds it. */
const transcriptPath = async (sessionId: string): Promise<string | null> => {
  const projects = join(configDirectory(), "projects")
  const folders = await readdir(projects, { withFileTypes: true }).catch(() => [])
  for (const folder of folders) {
    if (!folder.isDirectory()) continue
    const path = join(projects, folder.name, `${sessionId}.jsonl`)
    if (
      await stat(path).then(
        (entry) => entry.isFile(),
        () => false,
      )
    )
      return path
  }
  return null
}

/**
 * The structured tool results the transcript keeps beside each message, which carry the patches
 * behind edits. The SDK's message reader leaves them out.
 */
const toolResults = async (sessionId: string): Promise<Map<string, unknown>> => {
  const results = new Map<string, unknown>()
  const path = await transcriptPath(sessionId)
  if (path === null) return results
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.includes('"toolUseResult"')) continue
    try {
      const entry = asRecord(JSON.parse(line))
      if (typeof entry.uuid === "string" && entry.toolUseResult !== undefined)
        results.set(entry.uuid, entry.toolUseResult)
    } catch {
      // A partly written last line is skipped, as Claude Code skips it.
    }
  }
  return results
}

const INTERRUPTED = /^\[Request interrupted by user/
const CONTINUED = /^This session is being continued from a previous conversation/

const tag = (text: string, name: string): string | null => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)
  return match === null ? null : (match[1] ?? "").trim()
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal colour codes are removed.
const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, "")

/** What a user entry in the transcript stands for in a MeldShell thread. */
type UserEntry =
  | { readonly kind: "prompt"; readonly text: string }
  | { readonly kind: "shell"; readonly command: string }
  | { readonly kind: "shell-output"; readonly output: string }
  | { readonly kind: "command-output"; readonly text: string }
  | { readonly kind: "interrupted" }
  | { readonly kind: "continued" }
  | { readonly kind: "tool-results" }

const userEntry = (content: unknown): UserEntry => {
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content
  if (!Array.isArray(blocks)) return { kind: "prompt", text: "" }
  if (blocks.some((block) => asRecord(block).type === "tool_result"))
    return { kind: "tool-results" }
  const text = blocks
    .map((value) => {
      const block = asRecord(value)
      return block.type === "text" && typeof block.text === "string"
        ? block.text
        : block.type === "image"
          ? "[Image]"
          : ""
    })
    .filter(Boolean)
    .join("\n")
    .trim()
  if (INTERRUPTED.test(text)) return { kind: "interrupted" }
  if (CONTINUED.test(text)) return { kind: "continued" }
  const command = tag(text, "command-name")
  if (command !== null)
    return { kind: "prompt", text: [command, tag(text, "command-args")].filter(Boolean).join(" ") }
  const shell = tag(text, "bash-input")
  if (shell !== null) return { kind: "shell", command: shell }
  const stdout = tag(text, "bash-stdout")
  const stderr = tag(text, "bash-stderr")
  if (stdout !== null || stderr !== null)
    return {
      kind: "shell-output",
      output: stripAnsi([stdout, stderr].filter(Boolean).join("\n")),
    }
  const local = tag(text, "local-command-stdout") ?? tag(text, "local-command-stderr")
  if (local !== null) return { kind: "command-output", text: stripAnsi(local) }
  return { kind: "prompt", text }
}

interface Building {
  readonly text: string
  status: ImportedTurn["status"]
  readonly startedAt: string
  completedAt: string
  model: string | null
  readonly events: ImportedTurn["events"][number][]
  readonly claude: ClaudeEvents
  /** The command a `!` shell message ran, which its output message follows. */
  shellCommand: string | null
}

/** Messages the SDK reads from a transcript also carry the time Claude Code wrote them. */
const messageTime = (message: SessionMessage, fallback: string): string => {
  const time = asRecord(message).timestamp
  return typeof time === "string" && !Number.isNaN(Date.parse(time)) ? time : fallback
}

const sdkMessage = (message: SessionMessage, extra: Record<string, unknown> = {}): SDKMessage =>
  ({
    type: message.type,
    message: message.message,
    parent_tool_use_id: message.parent_tool_use_id,
    uuid: message.uuid,
    session_id: message.session_id,
    ...extra,
  }) as SDKMessage

/** Builds turns from a transcript's messages, oldest first. */
class TurnBuilder {
  readonly turns: Building[] = []
  private now = new Date(0).toISOString()

  constructor(private readonly results: ReadonlyMap<string, unknown>) {}

  private start(text: string): Building {
    const turn: Building = {
      text,
      status: "completed",
      startedAt: this.now,
      completedAt: this.now,
      model: null,
      events: [],
      claude: new ClaudeEvents((method, params) => this.push(turn, method, params)),
      shellCommand: null,
    }
    this.push(turn, "turn/started", { turn: { status: "running" } })
    this.turns.push(turn)
    return turn
  }

  /** The turn a message belongs to; work before any prompt opens a turn of its own. */
  private ongoing(): Building {
    return this.turns.at(-1) ?? this.start("")
  }

  private push(turn: Building, method: string, params: unknown): void {
    // Streamed output only matters live; the completed command carries all of it.
    if (method === "item/commandExecution/outputDelta") return
    turn.events.push({ method, params, createdAt: this.now })
    turn.completedAt = this.now
  }

  private item(item: Record<string, unknown>): void {
    this.push(this.ongoing(), "item/completed", { item })
  }

  accept(message: SessionMessage): void {
    this.now = messageTime(message, this.now)
    if (message.type === "assistant") {
      const turn = this.ongoing()
      const model = asRecord(message.message).model
      // Claude Code marks messages it wrote itself, such as API errors, with a model like <synthetic>.
      if (typeof model === "string" && !model.startsWith("<")) turn.model = model
      turn.claude.accept(sdkMessage(message))
    } else if (message.type === "user") this.user(message)
  }

  private user(message: SessionMessage): void {
    const entry = userEntry(asRecord(message.message).content)
    switch (entry.kind) {
      case "prompt":
        if (entry.text !== "") this.start(entry.text)
        return
      case "shell":
        this.start(`! ${entry.command}`).shellCommand = entry.command
        return
      case "tool-results": {
        const result = this.results.get(message.uuid)
        this.ongoing().claude.accept(
          sdkMessage(message, result === undefined ? {} : { tool_use_result: result }),
        )
        return
      }
      case "shell-output":
        return this.item({
          id: message.uuid,
          type: "commandExecution",
          command: this.ongoing().shellCommand ?? "",
          aggregatedOutput: entry.output,
          status: "completed",
        })
      case "command-output":
        if (entry.text !== "")
          this.item({
            id: message.uuid,
            type: "agentMessage",
            text: entry.text,
            phase: "final_answer",
          })
        return
      case "interrupted":
        this.ongoing().status = "interrupted"
        return
      case "continued":
        return this.item({
          id: message.uuid,
          type: "contextCompaction",
          text: "Context compacted",
          status: "completed",
        })
    }
  }
}

/**
 * Splits a stored conversation into turns at each message the user typed, and plays each turn's
 * messages through the same translation a live turn uses.
 */
export const claudeTurns = (
  messages: readonly SessionMessage[],
  results: ReadonlyMap<string, unknown> = new Map(),
): ImportedTurn[] => {
  const builder = new TurnBuilder(results)
  for (const message of messages) builder.accept(message)
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

export const readClaudeSession = async (
  workspacePath: string,
  sessionId: string,
): Promise<CliSessionHistory> => {
  const [info, messages, results] = await Promise.all([
    getSessionInfo(sessionId, { dir: workspacePath }),
    getSessionMessages(sessionId, { dir: workspacePath }),
    toolResults(sessionId),
  ])
  if (messages.length === 0)
    throw new Error("Claude Code has no stored conversation with this ID in this folder.")
  return {
    title: oneLine(info?.customTitle ?? info?.summary ?? "") || "Claude Code session",
    turns: claudeTurns(messages, results),
  }
}
