import { type CanonicalEvent, HARNESSES, isHarness, type TurnHandoff } from "@meldshell/contracts"
import { prepareTranscriptTurns } from "@meldshell/projection"

/**
 * A provider session only knows the turns it ran. When a thread moves to another harness, or a
 * rewind restarts the session, the next turn carries a written account of the work it missed, so
 * the agent continues the conversation instead of starting it over.
 */

interface PastTurn {
  readonly id: string
  readonly harness: string
  readonly status: string
  readonly events: ReadonlyArray<CanonicalEvent>
}

/** The whole summary stays well inside every harness's prompt limit. */
const BRIEF_LIMIT = 32_000
const MESSAGE_LIMIT = 4_000
const REPLY_LIMIT = 3_000
const OUTLINE_LIMIT = 280
const LISTED_FILES = 20
const LISTED_COMMANDS = 8

const harnessLabel = (harness: string) => (isHarness(harness) ? HARNESSES[harness].label : harness)

const clip = (text: string, limit: number) => {
  const trimmed = text.trim()
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit).trimEnd()} […]`
}

const DIFF_PATH = /^diff --git a\/(.+?) b\//gm
const CHANGE_LINE = /^(?:Created|Updated|Deleted) (.+)$/gm

const changedFiles = (events: ReadonlyArray<CanonicalEvent>) => {
  const files = new Set<string>()
  for (const event of events) {
    if (event.kind !== "file-change" || event.text === null) continue
    const pattern = event.text.startsWith("diff --git") ? DIFF_PATH : CHANGE_LINE
    for (const match of event.text.matchAll(pattern)) if (match[1]) files.add(match[1])
  }
  return [...files]
}

const commandsRun = (events: ReadonlyArray<CanonicalEvent>) =>
  events.flatMap((event) => {
    const command = event.kind === "command" ? event.text?.split("\n")[0]?.trim() : undefined
    return command ? [command] : []
  })

/** What one turn asked for and did, in the terms a person reading the transcript would use. */
interface TurnDigest {
  readonly harness: string
  readonly status: string
  readonly request: string
  readonly reply: string
  readonly files: readonly string[]
  readonly commands: readonly string[]
}

const digest = (turn: PastTurn): TurnDigest | null => {
  const projected = prepareTranscriptTurns(turn.events)
  const request = projected
    .flatMap((part) => part.userMessages.map((event) => event.text ?? ""))
    .filter((text) => text.trim() !== "")
    .join("\n\n")
  const working = projected.flatMap((part) => part.workingEvents)
  const reply =
    projected.findLast((part) => part.finalResponse !== null)?.finalResponse?.text ??
    working.findLast((event) => event.kind === "assistant")?.text ??
    ""
  const files = changedFiles(working)
  const commands = commandsRun(working)
  // A turn that failed before doing anything has nothing to hand over.
  if (reply.trim() === "" && files.length === 0 && commands.length === 0) return null
  return { harness: turn.harness, status: turn.status, request, reply, files, commands }
}

const list = (items: readonly string[], limit: number) =>
  items.length <= limit
    ? items.join(", ")
    : `${items.slice(0, limit).join(", ")}, and ${items.length - limit} more`

const fullSection = (turn: TurnDigest, index: number) => {
  const agent = harnessLabel(turn.harness)
  const lines = [`### Turn ${index + 1} (${agent})`]
  if (turn.request !== "") lines.push(`**User:** ${clip(turn.request, MESSAGE_LIMIT)}`)
  if (turn.files.length > 0) lines.push(`**Files changed:** ${list(turn.files, LISTED_FILES)}`)
  if (turn.commands.length > 0)
    lines.push(
      `**Commands run:** ${list(
        turn.commands.map((command) => `\`${clip(command, 120)}\``),
        LISTED_COMMANDS,
      )}`,
    )
  if (turn.reply.trim() !== "") lines.push(`**${agent} replied:** ${clip(turn.reply, REPLY_LIMIT)}`)
  if (turn.status === "running") lines.push("_This turn is still running._")
  else if (turn.status !== "completed") lines.push(`_This turn was ${turn.status}._`)
  return lines.join("\n\n")
}

const outline = (turn: TurnDigest, index: number) =>
  `- Turn ${index + 1} (${harnessLabel(turn.harness)}): ${clip(
    turn.request.replace(/\s+/g, " ") || "(no message)",
    OUTLINE_LIMIT,
  )}`

/**
 * Keeps the latest turns in full and outlines older ones once the full sections would pass the
 * limit, because the most recent work matters most to whoever continues it.
 */
const sections = (turns: readonly TurnDigest[]) => {
  const parts: string[] = []
  let used = 0
  let index = turns.length - 1
  for (; index >= 0; index--) {
    const section = fullSection(turns[index]!, index)
    if (used + section.length > BRIEF_LIMIT * 0.8 && parts.length > 0) break
    parts.unshift(section)
    used += section.length
  }
  const outlines: string[] = []
  for (; index >= 0; index--) {
    const line = outline(turns[index]!, index)
    if (used + line.length > BRIEF_LIMIT) break
    outlines.unshift(line)
    used += line.length
  }
  const omitted = index + 1
  const older = [
    ...(omitted > 0 ? [`- ${omitted} earlier ${omitted === 1 ? "turn" : "turns"} omitted.`] : []),
    ...outlines,
  ]
  return older.length > 0 ? [`### Earlier turns\n\n${older.join("\n")}`, ...parts] : parts
}

/**
 * The summary a provider session receives in place of the turns it did not run, or null when
 * there is nothing it missed.
 */
export const buildHandoff = (
  harness: string,
  turns: ReadonlyArray<PastTurn>,
): TurnHandoff | null => {
  const digests = turns.flatMap((turn) => digest(turn) ?? [])
  if (digests.length === 0) return null
  const from = [...new Set(digests.map((turn) => turn.harness))]
  const reason = from.every((other) => other === harness) ? "restart" : "handoff"
  const others = from.filter((other) => other !== harness).map(harnessLabel)
  const intro =
    reason === "restart"
      ? "This conversation was rewound, so you are starting a new session. Here is the conversation so far, oldest first."
      : `You are continuing a thread that ${list(others, others.length)} worked on in this folder. You have not seen ${
          digests.length === 1 ? "that turn" : "those turns"
        }, so here is what happened, oldest first.`
  const brief = [
    "<meldshell_handoff>",
    `${intro} The files in the working folder already reflect this work; read them for detail rather than redoing it. The user's new message is outside this block.`,
    ...sections(digests),
    "</meldshell_handoff>",
  ].join("\n\n")
  return { reason, from, to: harness, turnCount: digests.length, brief }
}

const SIDE_QUESTION_LIMIT = 4_000

/**
 * A side question is answered by a separate, read-only request that sees a written account of the
 * conversation. Nothing is added to the thread or its provider session, so the agent never sees the
 * question or the answer.
 */
export const buildSideQuestionPrompt = (
  harness: string,
  turns: ReadonlyArray<PastTurn>,
  question: string,
): string => {
  const digests = turns.flatMap((turn) => digest(turn) ?? [])
  const known = isHarness(harness)
  const agent = known ? HARNESSES[harness].label : "The agent"
  const conversation =
    digests.length === 0
      ? "The conversation has no finished work yet."
      : sections(digests).join("\n\n")
  return [
    `The user is working with ${known ? `${agent}, a coding agent,` : "a coding agent"} in this folder. They have a quick side question about that conversation. ${agent} will not see the question or your answer, so do not address it or continue its work.`,
    "Answer the question directly and briefly, in Markdown. Base the answer on the conversation below and on the files in this folder when you can read them. Do not change any files or run commands that change anything. If the conversation does not say enough to answer, say what is missing instead of guessing.",
    `<conversation>\n\n${conversation}\n\n</conversation>`,
    `<side_question>\n${clip(question, SIDE_QUESTION_LIMIT)}\n</side_question>`,
  ].join("\n\n")
}
