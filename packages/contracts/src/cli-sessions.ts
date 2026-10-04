import { Schema } from "effect"
import { AppSnapshot, HARNESSES } from "./models"

/*
 * Conversations a harness's own command-line tool stored, which MeldShell can bring in as threads,
 * and the threads MeldShell can hand back to that tool.
 */

/** The harnesses whose terminal sessions MeldShell can bring in and continue in their CLI. */
export const CliHarness = Schema.Literals(["claude-code", "codex", "cursor", "pi"])

export type CliHarness = typeof CliHarness.Type

export const isCliHarness = Schema.is(CliHarness)

/**
 * The ID each harness's CLI takes to resume a session. Pi sessions are kept by file path, named
 * `<time>_<id>.jsonl`, and Pi finds one by its ID.
 */
export const cliSessionArgument = (harness: CliHarness, nativeThreadId: string): string => {
  if (harness !== "pi" || !nativeThreadId.endsWith(".jsonl")) return nativeThreadId
  const name = nativeThreadId.split(/[\\/]/).at(-1) ?? ""
  return name.slice(name.indexOf("_") + 1, -".jsonl".length)
}

/** The command that starts each harness's CLI on a stored session. */
export const cliResumeCommand = (harness: CliHarness, nativeThreadId: string): string => {
  const id = cliSessionArgument(harness, nativeThreadId)
  switch (harness) {
    case "claude-code":
      return `claude --resume ${id}`
    case "codex":
      return `codex resume ${id}`
    case "cursor":
      return `cursor-agent --resume ${id}`
    case "pi":
      return `pi --session ${id}`
  }
}

export const cliLabel = (harness: CliHarness): string => `${HARNESSES[harness].label} CLI`

/** A stored CLI session as its harness's worker lists it. */
export const CliSessionSummary = Schema.Struct({
  nativeThreadId: Schema.String,
  title: Schema.String,
  /** When the session last changed, as an ISO time. */
  updatedAt: Schema.String,
  /** The branch checked out when the session last ran, when the CLI recorded one. */
  branch: Schema.NullOr(Schema.String),
})

export type CliSessionSummary = typeof CliSessionSummary.Type

export const CliSession = Schema.Struct({
  ...CliSessionSummary.fields,
  harness: CliHarness,
  /** The MeldShell thread that already holds this session, opened instead of importing it again. */
  threadId: Schema.NullOr(Schema.String),
})

export type CliSession = typeof CliSession.Type

/** One native event of an imported turn, as the harness's worker would have reported it live. */
const ImportedEvent = Schema.Struct({
  method: Schema.String,
  params: Schema.Unknown,
  createdAt: Schema.String,
})

export const ImportedTurn = Schema.Struct({
  /** What the user typed; empty when the turn started without a message, as after a compaction. */
  text: Schema.String,
  status: Schema.Literals(["completed", "failed", "interrupted"]),
  startedAt: Schema.String,
  completedAt: Schema.String,
  model: Schema.NullOr(Schema.String),
  events: Schema.Array(ImportedEvent),
})

export type ImportedTurn = typeof ImportedTurn.Type

/** A stored session's conversation, oldest turn first. */
export const CliSessionHistory = Schema.Struct({
  title: Schema.String,
  turns: Schema.Array(ImportedTurn),
})

export type CliSessionHistory = typeof CliSessionHistory.Type

export const ImportCliSessionInput = Schema.Struct({
  workspaceId: Schema.String,
  harness: CliHarness,
  nativeThreadId: Schema.String,
})

export type ImportCliSessionInput = typeof ImportCliSessionInput.Type

/** The core's record of an imported session, read by the host from the harness's worker. */
export const RecordCliSessionInput = Schema.Struct({
  ...ImportCliSessionInput.fields,
  history: CliSessionHistory,
})

export type RecordCliSessionInput = typeof RecordCliSessionInput.Type

export const ImportedCliSession = Schema.Struct({
  snapshot: AppSnapshot,
  threadId: Schema.String,
})

export type ImportedCliSession = typeof ImportedCliSession.Type

export interface CliSessionList {
  /** Newest first, across every harness that answered. */
  readonly sessions: readonly CliSession[]
  /** Why a harness's sessions are missing, one sentence each. */
  readonly problems: readonly string[]
}

/** The stored session a thread's CLI would continue: its latest harness's. */
export const ResumableSession = Schema.Struct({
  harness: CliHarness,
  nativeThreadId: Schema.String,
})

export type ResumableSession = typeof ResumableSession.Type
