import { Either, Schema } from "effect"
import { eventKind, eventText, planText } from "./normalization"
import { prepareCursorEvents } from "./cursor"
import {
  asRecord,
  decodeNativePayload,
  type NativeItem,
  type NativePayload,
  nonEmptyText,
  type CanonicalEvent,
  type CanonicalEventKind,
} from "@meldshell/contracts"

type JsonRecord = NativeItem

interface ItemDetails {
  readonly id: string | null
  readonly type: string | null
  readonly record: JsonRecord | null
}

interface EventGroup {
  readonly id: string
  readonly first: CanonicalEvent
  kind: CanonicalEventKind
  method: string
  payload: unknown
  decoded: NativePayload
  completedText: string | null
  command: string | null
  progress: string | null
  readonly chunks: string[]
  readonly output: string[]
}

/** A question Codex asked in a message, answered by the user's next message. */
export interface AsyncQuestion {
  readonly title: string
  readonly options: ReadonlyArray<string>
}

export interface TranscriptTurn {
  readonly id: string
  readonly sequence: number
  readonly userMessages: ReadonlyArray<CanonicalEvent>
  readonly workingEvents: ReadonlyArray<CanonicalEvent>
  readonly finalResponse: CanonicalEvent | null
  /** Questions the turn left for the user, shown in place of the messages that carried them. */
  readonly questions: ReadonlyArray<AsyncQuestion>
  readonly durationMs: number
  readonly complete: boolean
}

/** The native item a payload carries, as Codex and the other harnesses nest it. */
const readPayload = (payload: unknown): NativePayload | null => {
  const decoded = decodeNativePayload(payload)
  return Either.isRight(decoded) ? decoded.right : null
}
const payloadItem = (payload: unknown): JsonRecord | null => readPayload(payload)?.item ?? null

const commandValue = (value: unknown): string | null =>
  nonEmptyText(value)?.replaceAll("\\\\", "\\") ?? null

const itemDetails = (payload: NativePayload): ItemDetails => {
  const item = payload?.item ?? null
  return {
    id: nonEmptyText(payload?.itemId) ?? nonEmptyText(item?.id),
    type: nonEmptyText(item?.type),
    record: item,
  }
}

const groupable = (kind: CanonicalEventKind): boolean =>
  kind === "assistant" ||
  kind === "reasoning" ||
  kind === "plan" ||
  kind === "command" ||
  kind === "file-change" ||
  kind === "tool"

const completedItemText = (item: JsonRecord | null): string | null => {
  if (item === null) return null
  for (const key of ["text", "message", "review"] as const) {
    const text = nonEmptyText(item[key])
    if (text !== null) return text
  }
  if (item.type === "reasoning") {
    for (const key of ["summary", "content"] as const) {
      const parts = item[key]
      if (Array.isArray(parts)) {
        const text = parts.filter((part) => typeof part === "string").join("\n")
        if (text) return text
      }
    }
  }
  return null
}

const fileName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

const fileChangeText = (payload: NativePayload): string | null => {
  const changeList = payload.item?.changes
  if (!Array.isArray(changeList)) return null
  const summaries = changeList.flatMap((value) => {
    const change = value
    const path = nonEmptyText(change.path)
    if (path === null) return []
    const changeType = nonEmptyText(change.kind.type)
    const verb = changeType === "add" ? "Created" : changeType === "delete" ? "Deleted" : "Updated"
    return [`${verb} ${fileName(path)}`]
  })
  return summaries.length > 0 ? summaries.join("\n") : null
}

const standaloneVisible = (event: CanonicalEvent): boolean =>
  event.kind === "user" ||
  event.kind === "assistant" ||
  event.kind === "reasoning" ||
  event.kind === "plan" ||
  event.kind === "command" ||
  event.kind === "file-change" ||
  event.kind === "tool" ||
  event.kind === "approval" ||
  event.kind === "error"

const finishGroup = (group: EventGroup): CanonicalEvent | null => {
  let text = group.completedText ?? group.chunks.join("")
  if (group.kind === "command") {
    const output = (
      nonEmptyText(group.decoded.item?.aggregatedOutput) ?? group.output.join("")
    ).trimEnd()
    text = [group.command, output === "" ? null : output].filter(Boolean).join("\n\n")
  } else if (group.kind === "file-change") {
    text = fileChangeText(group.decoded) ?? text
  } else if (group.kind === "plan") {
    text = planText(group.decoded.item?.plan) ?? text
  }
  if (text === "" && group.kind === "tool") {
    const item = group.decoded.item
    text =
      item?.type === "contextCompaction"
        ? group.method === "item/completed"
          ? "Context compacted"
          : "Compacting context"
        : (nonEmptyText(item?.tool) ?? nonEmptyText(item?.type) ?? "Tool")
  }
  if (text === "") return null
  return {
    ...group.first,
    id: group.id,
    kind: group.kind,
    method: group.method,
    text,
    payload:
      group.progress === null
        ? group.payload
        : {
            ...group.decoded,
            item: { ...group.decoded.item, progress: group.progress },
          },
  }
}

const updateDiff = (
  diffs: Map<string, CanonicalEvent>,
  event: CanonicalEvent,
  payload: NativePayload,
): void => {
  const diff = payload.diff
  if (typeof diff === "string") {
    const key = event.turnId ?? `sequence:${event.sequence}`
    const first = diffs.get(key)
    diffs.set(key, {
      ...(first ?? event),
      id: `diff:${key}`,
      kind: "file-change",
      method: event.method,
      text: diff,
      payload: event.payload,
    })
  }
}
const updatePlan = (plans: Map<string, CanonicalEvent>, event: CanonicalEvent): void => {
  const key = event.turnId ?? `sequence:${event.sequence}`
  plans.set(key, {
    ...(plans.get(key) ?? event),
    kind: "plan",
    payload: event.payload,
    text: eventText(event.method, event.payload),
  })
}
const nativeReply = (
  event: CanonicalEvent,
  payload: NativePayload,
  previous: CanonicalEvent | undefined,
): CanonicalEvent => {
  const content = payload.item?.content
  const text = Array.isArray(content)
    ? content
        .map((part) => nonEmptyText(asRecord(part).text) ?? "")
        .filter(Boolean)
        .join("\n")
    : event.text
  return { ...event, sequence: previous?.sequence ?? event.sequence, text }
}

export const prepareTranscriptEvents = (
  events: ReadonlyArray<CanonicalEvent>,
): ReadonlyArray<CanonicalEvent> => {
  const groups = new Map<string, EventGroup>()
  const diffs = new Map<string, CanonicalEvent>()
  const plans = new Map<string, CanonicalEvent>()
  const standalone: CanonicalEvent[] = []
  const questionTurns = new Set<string | null>()
  const replies = new Map<string, CanonicalEvent>()

  const appendReply = (event: CanonicalEvent, payload: NativePayload, id: string): void => {
    if (!questionTurns.has(event.turnId)) return
    const key = `${event.turnId}:${id}`
    replies.set(key, nativeReply(event, payload, replies.get(key)))
  }

  const append = (event: CanonicalEvent): void => {
    const decoded = decodeNativePayload(event.payload)
    if (Either.isLeft(decoded)) {
      standalone.push({
        ...event,
        kind: "error",
        text: `Invalid ${event.method} payload: ${decoded.left.message}`,
      })
      return
    }
    if (event.method === "turn/plan/updated") {
      updatePlan(plans, event)
      return
    }
    if (event.method === "turn/diff/updated") {
      updateDiff(diffs, event, decoded.right)
      return
    }

    const item = itemDetails(decoded.right)
    const kind = event.kind === "unknown" ? eventKind(event.method, event.payload) : event.kind
    if (kind === "user" && item.id !== null) {
      // Initial prompts already have a local user/message. Native replies to mid-turn
      // questions have no local duplicate and must survive transcript reloads.
      appendReply(event, decoded.right, item.id)
      return
    }

    const groupKey = `${event.turnId ?? event.threadId}:${item.id}`
    const existing = groups.get(groupKey)
    if (item.id !== null && (existing !== undefined || groupable(kind))) {
      const group = existing ?? newGroup(event, decoded.right, item.id, kind)
      groups.set(groupKey, group)
      updateGroup(group, event, decoded.right, item, kind)
      return
    }

    if (standaloneVisible(event)) standalone.push(event)
  }

  // MCP startup progress never appears in the transcript, so its payload shape cannot fail a turn.
  for (const event of prepareCursorEvents(events)) {
    if (asyncQuestions(event).length > 0) questionTurns.add(event.turnId)
    if (event.method !== "mcpServer/startupStatus/updated") append(event)
  }

  return [
    ...standalone,
    ...replies.values(),
    ...diffs.values(),
    ...plans.values(),
    ...[...groups.values()].flatMap((group) => finishGroup(group) ?? []),
  ].sort((left, right) => left.sequence - right.sequence)
}

const assistantPhase = (event: CanonicalEvent): string | null =>
  nonEmptyText(payloadItem(event.payload)?.phase)

const decodeAsyncQuestions = Schema.decodeUnknownEither(
  Schema.Array(
    Schema.Struct({
      title: Schema.String,
      options: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
    }),
  ),
)

/**
 * Codex asks without blocking the turn: the question arrives as an agent message delivered
 * asynchronously, and the user's next message answers it.
 */
const asyncQuestions = (event: CanonicalEvent): AsyncQuestion[] => {
  const item = asRecord(payloadItem(event.payload))
  if (item.delivery !== "async") return []
  const decoded = decodeAsyncQuestions(item.questions)
  if (Either.isLeft(decoded)) return []
  return decoded.right.flatMap((question) =>
    question.title.trim()
      ? [{ title: question.title, options: (question.options ?? []).filter((o) => o.trim()) }]
      : [],
  )
}

const eventTime = (event: CanonicalEvent): number => {
  const time = Date.parse(event.createdAt)
  return Number.isNaN(time) ? 0 : time
}

export const prepareTranscriptTurns = (
  events: ReadonlyArray<CanonicalEvent>,
): ReadonlyArray<TranscriptTurn> => {
  const prepared = prepareTranscriptEvents(events)
  const timing = new Map<
    string,
    { start: number | null; first: number; latest: number; completed: number | null }
  >()

  for (const entry of events) {
    const id = entry.turnId ?? `event:${entry.id}`
    const time = eventTime(entry)
    const current = timing.get(id) ?? {
      start: null,
      first: time,
      latest: time,
      completed: null,
    }
    current.first = Math.min(current.first, time)
    current.latest = Math.max(current.latest, time)
    if (entry.method === "turn/started") current.start = time
    if (entry.method === "turn/completed") current.completed = time
    timing.set(id, current)
  }

  const turns = new Map<
    string,
    {
      sequence: number
      userMessages: CanonicalEvent[]
      workingEvents: CanonicalEvent[]
      finalResponse: CanonicalEvent | null
      questions: AsyncQuestion[]
    }
  >()

  for (const entry of prepared) {
    const id = entry.turnId ?? `event:${entry.id}`
    const turn = turns.get(id) ?? {
      sequence: entry.sequence,
      userMessages: [],
      workingEvents: [],
      finalResponse: null,
      questions: [],
    }
    turn.sequence = Math.min(turn.sequence, entry.sequence)
    const questions = entry.kind === "assistant" ? asyncQuestions(entry) : []
    if (entry.kind === "user") {
      turn.userMessages.push(entry)
      // A steered answer belongs to the same turn and resolves its earlier questions.
      turn.questions = []
    } else if (questions.length > 0) {
      turn.questions.push(...questions)
    } else if (entry.kind === "assistant" && assistantPhase(entry) === "final_answer") {
      // Only the last final answer closes the turn; earlier ones stay in the working log in order.
      turn.workingEvents.push(entry)
      turn.finalResponse = entry
    } else {
      turn.workingEvents.push(entry)
    }
    turns.set(id, turn)
  }

  return [...turns.entries()]
    .map(([id, turn]) => {
      if (turn.finalResponse !== null)
        turn.workingEvents.splice(turn.workingEvents.lastIndexOf(turn.finalResponse), 1)
      else {
        const finalIndex = turn.workingEvents.findLastIndex(
          (entry) => entry.kind === "assistant" && !payloadItem(entry.payload)?.parentToolUseId,
        )
        if (finalIndex >= 0 && timing.get(id)?.completed != null) {
          turn.finalResponse = turn.workingEvents.splice(finalIndex, 1)[0] ?? null
        }
      }
      const clock = timing.get(id)
      const start = clock?.start ?? clock?.first ?? 0
      const end = clock?.completed ?? clock?.latest ?? start
      return {
        id,
        sequence: turn.sequence,
        userMessages: turn.userMessages,
        workingEvents: turn.workingEvents,
        finalResponse: turn.finalResponse,
        questions: turn.questions,
        durationMs: Math.max(0, end - start),
        complete: clock?.completed != null,
      }
    })
    .sort((left, right) => left.sequence - right.sequence)
}

function updateGroup(
  group: EventGroup,
  event: CanonicalEvent,
  payload: NativePayload,
  item: ReturnType<typeof itemDetails>,
  kind: CanonicalEvent["kind"],
): void {
  if (item.type !== null) group.kind = kind
  if (item.record !== null) {
    group.payload = event.payload
    group.decoded = payload
    group.command = commandValue(item.record.command) ?? group.command
  }
  if (event.method.endsWith("/progress")) {
    group.progress = nonEmptyText(payload.message) ?? event.text
  } else if (event.method === "item/completed") {
    group.method = event.method
    group.completedText = completedItemText(item.record) ?? group.completedText
  } else if (event.method.includes("outputDelta")) {
    if (event.text !== null) group.output.push(event.text)
  } else if (event.method.endsWith("/delta") && event.text !== null) {
    group.chunks.push(event.text)
  } else if (event.text !== null && group.command === null) {
    group.completedText = event.text
  }
}

const newGroup = (
  event: CanonicalEvent,
  decoded: NativePayload,
  id: string,
  kind: CanonicalEventKind,
): EventGroup => ({
  decoded,
  id: `item:${id}`,
  first: event,
  kind,
  method: event.method,
  payload: event.payload,
  completedText: null,
  command: null,
  progress: null,
  chunks: [],
  output: [],
})
