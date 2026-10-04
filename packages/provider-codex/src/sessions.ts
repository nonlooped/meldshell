import type { CliSessionHistory, CliSessionSummary, ImportedTurn } from "@meldshell/contracts"
import { requestCodex, type CodexAppServer } from "./client"
import type { ThreadTurnsListResponse, Turn } from "./generated/v2/ThreadTurnsListResponse"

type Server = Pick<CodexAppServer, "request">

/** Sessions started outside an app, from the terminal or an editor; MeldShell's own are app-server ones. */
const CLI_SOURCES = ["cli", "exec", "vscode"]
const SESSION_LIMIT = 100
const TURN_PAGE = 50

const isoSeconds = (seconds: number | null | undefined, fallback: string): string =>
  typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : fallback

const firstLine = (text: string): string => text.trim().split("\n")[0]?.trim() ?? ""

/** The terminal sessions Codex stored for exactly this folder, newest first. */
export const listCodexSessions = async (
  server: Server,
  workspacePath: string,
): Promise<CliSessionSummary[]> => {
  const response = await requestCodex(server, "thread/list", {
    cwd: workspacePath,
    sourceKinds: CLI_SOURCES,
    archived: false,
    limit: SESSION_LIMIT,
    sortKey: "updated_at",
  })
  return response.data
    .filter((thread) => !thread.ephemeral)
    .map((thread) => ({
      nativeThreadId: thread.id,
      title: thread.name?.trim() || firstLine(thread.preview) || "Codex session",
      updatedAt: isoSeconds(thread.updatedAt, new Date(0).toISOString()),
      branch: thread.gitInfo?.branch ?? null,
    }))
}

/** Every turn with its items, oldest first, from the paged history or the whole-thread read. */
const readTurns = async (server: Server, threadId: string): Promise<readonly Turn[]> => {
  try {
    const turns: Turn[] = []
    let cursor: string | null = null
    do {
      const page: ThreadTurnsListResponse = await requestCodex(server, "thread/turns/list", {
        threadId,
        cursor,
        limit: TURN_PAGE,
        sortDirection: "asc",
        itemsView: "full",
      })
      turns.push(...page.data)
      cursor = page.nextCursor ?? null
    } while (cursor !== null)
    return turns
  } catch {
    // Codex releases before paged history only answer the whole-thread read.
    const response = await requestCodex(server, "thread/read", { threadId, includeTurns: true })
    return response.thread.turns
  }
}

const userText = (item: Extract<Turn["items"][number], { type: "userMessage" }>): string =>
  item.content
    .map((input) =>
      input.type === "text"
        ? input.text
        : input.type === "image" || input.type === "localImage"
          ? "[Image]"
          : null,
    )
    .filter((text) => text !== null)
    .join("\n")
    .trim()

const turnStatus = (status: Turn["status"]): ImportedTurn["status"] =>
  status === "completed" || status === "failed" ? status : "interrupted"

/**
 * Plays back a stored turn as the item notifications Codex sends while it runs, so the core
 * records and projects it exactly like a turn MeldShell started.
 */
export const importedCodexTurn = (
  threadId: string,
  turn: Turn,
  model: string | null,
  fallbackTime: string,
): ImportedTurn => {
  const startedAt = isoSeconds(turn.startedAt, fallbackTime)
  const completedAt = isoSeconds(turn.completedAt, startedAt)
  const status = turnStatus(turn.status)
  const texts: string[] = []
  const events: ImportedTurn["events"][number][] = [
    {
      method: "turn/started",
      params: { threadId, turn: { id: turn.id, status: "inProgress" } },
      createdAt: startedAt,
    },
  ]
  for (const item of turn.items) {
    // The core records the user's message itself.
    if (item.type === "userMessage") {
      texts.push(userText(item))
      continue
    }
    events.push({
      method: "item/completed",
      params: { threadId, turnId: turn.id, item },
      createdAt: completedAt,
    })
  }
  if (turn.error?.message)
    events.push({
      method: "error",
      params: { threadId, turnId: turn.id, error: { message: turn.error.message } },
      createdAt: completedAt,
    })
  events.push({
    method: "turn/completed",
    params: { threadId, turn: { id: turn.id, status } },
    createdAt: completedAt,
  })
  return {
    text: texts.filter(Boolean).join("\n\n"),
    status,
    startedAt,
    completedAt,
    model,
    events,
  }
}

export const readCodexSession = async (
  server: Server,
  threadId: string,
): Promise<CliSessionHistory> => {
  const { thread } = await requestCodex(server, "thread/read", { threadId, includeTurns: false })
  const turns = await readTurns(server, threadId)
  const created = isoSeconds(thread.createdAt, new Date().toISOString())
  return {
    title: thread.name?.trim() || firstLine(thread.preview) || "Codex session",
    turns: turns.map((turn) => importedCodexTurn(threadId, turn, thread.model ?? null, created)),
  }
}
