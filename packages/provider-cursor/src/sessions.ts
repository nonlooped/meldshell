import {
  asRecord,
  asText,
  type CliSessionSummary,
  type ImportedTurn,
  type UnknownRecord,
} from "@meldshell/contracts"

/*
 * Cursor's CLI keeps its chats itself and hands them over ACP: `session/list` names them, and
 * `session/load` replays one as the same `session/update` notifications a live turn streams.
 */

/** The updates that make up a turn's transcript; the rest describe the session, not the work. */
const TRANSCRIPT_UPDATES = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
])

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim()

/** Whether the agent advertised the ACP capability `session/list` needs. */
export const listsSessions = (init: UnknownRecord): boolean => {
  const capabilities = asRecord(asRecord(init.agentCapabilities).sessionCapabilities)
  return capabilities.list !== undefined && capabilities.list !== null
}

/** The chats one `session/list` page names for exactly this folder. */
export const cursorSessionSummaries = (
  page: unknown,
  workspacePath: string,
  now: string,
): CliSessionSummary[] => {
  const sessions = asRecord(page).sessions
  if (!Array.isArray(sessions)) return []
  return sessions.flatMap((value) => {
    const session = asRecord(value)
    const id = asText(session.sessionId)
    const cwd = asText(session.cwd)
    if (!id || (cwd && cwd !== workspacePath)) return []
    const updated = asText(session.updatedAt)
    return [
      {
        nativeThreadId: id,
        title: oneLine(asText(session.title)) || "Cursor chat",
        updatedAt:
          updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated).toISOString() : now,
        branch: null,
      },
    ]
  })
}

const chunkText = (update: UnknownRecord): string => {
  const content = asRecord(update.content)
  return content.type === "text" ? asText(content.text) : content.type === "image" ? "[Image]" : ""
}

interface Building {
  text: string
  /** Whether the agent has answered, so further user chunks start the next turn. */
  answered: boolean
  readonly events: ImportedTurn["events"][number][]
}

/**
 * Splits a replayed chat into turns at each message the user sent. ACP carries no times, so every
 * event takes the chat's last activity time.
 */
export const cursorTurns = (
  sessionId: string,
  updates: readonly UnknownRecord[],
  time: string,
): ImportedTurn[] => {
  const turns: Building[] = []
  const event = (method: string, params: unknown) => ({ method, params, createdAt: time })
  const start = (text: string): Building => {
    const turn: Building = {
      text,
      answered: false,
      events: [event("turn/started", { turn: { status: "inProgress" } })],
    }
    turns.push(turn)
    return turn
  }
  for (const update of updates) {
    const kind = asText(update.sessionUpdate)
    const last = turns.at(-1)
    if (kind === "user_message_chunk") {
      const text = chunkText(update)
      // A message arrives in chunks; they join until the agent answers.
      if (last !== undefined && !last.answered) last.text += text
      else start(text)
      continue
    }
    if (!TRANSCRIPT_UPDATES.has(kind)) continue
    const turn = last ?? start("")
    turn.answered = true
    turn.events.push(event("cursor/acp/session/update", { sessionId, update }))
  }
  return turns.map((turn) => ({
    text: turn.text.trim(),
    status: "completed",
    startedAt: time,
    completedAt: time,
    model: null,
    events: [...turn.events, event("turn/completed", { turn: { status: "completed" } })],
  }))
}
