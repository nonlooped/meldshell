import { eventKind, eventText, planText } from "./normalization"
import { prepareCursorEvents } from "./cursor"
import {
  asRecord,
  isRecord,
  nonEmptyText,
  type CanonicalEvent,
  type CanonicalEventKind,
  type UnknownRecord,
} from "@meldshell/contracts"

type JsonRecord = Readonly<UnknownRecord>

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
  completedText: string | null
  command: string | null
  progress: string | null
  readonly chunks: string[]
  readonly output: string[]
}

export interface TranscriptTurn {
  readonly id: string
  readonly sequence: number
  readonly userMessages: ReadonlyArray<CanonicalEvent>
  readonly workingEvents: ReadonlyArray<CanonicalEvent>
  readonly finalResponse: CanonicalEvent | null
  readonly durationMs: number
  readonly complete: boolean
}

/** The native item a payload carries, as Codex and the other harnesses nest it. */
const payloadItem = (payload: unknown): JsonRecord => asRecord(asRecord(payload).item)

const commandValue = (value: unknown): string | null =>
  nonEmptyText(value)?.replaceAll("\\\\", "\\") ?? null

const itemDetails = (event: CanonicalEvent): ItemDetails => {
  const payload = asRecord(event.payload)
  const item = isRecord(payload.item) ? payload.item : null
  return {
    id: nonEmptyText(payload.itemId) ?? nonEmptyText(item?.id),
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
  for (const key of ["text", "message", "review"]) {
    const text = nonEmptyText(item[key])
    if (text !== null) return text
  }
  if (item.type === "reasoning") {
    for (const key of ["summary", "content"]) {
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

const fileChangeText = (payload: unknown): string | null => {
  const changeList = payloadItem(payload).changes
  if (!Array.isArray(changeList)) return null
  const summaries = changeList.flatMap((value) => {
    const change = asRecord(value)
    const path = nonEmptyText(change.path)
    if (path === null) return []
    const changeType = nonEmptyText(asRecord(change.kind).type)
    const verb = changeType === "add" ? "Created" : changeType === "delete" ? "Deleted" : "Updated"
    return [`${verb} ${fileName(path)}`]
  })
  return summaries.length > 0 ? summaries.join("\n") : null
}

const standaloneVisible = (event: CanonicalEvent): boolean => {
  if (event.method === "mcpServer/startupStatus/updated") return false
  return (
    event.kind === "user" ||
    event.kind === "assistant" ||
    event.kind === "reasoning" ||
    event.kind === "plan" ||
    event.kind === "command" ||
    event.kind === "file-change" ||
    event.kind === "tool" ||
    event.kind === "approval" ||
    event.kind === "error"
  )
}

const finishGroup = (group: EventGroup): CanonicalEvent | null => {
  let text = group.completedText ?? group.chunks.join("")
  if (group.kind === "command") {
    const output = (
      nonEmptyText(payloadItem(group.payload).aggregatedOutput) ?? group.output.join("")
    ).trimEnd()
    text = [group.command, output === "" ? null : output].filter(Boolean).join("\n\n")
  } else if (group.kind === "file-change") {
    text = fileChangeText(group.payload) ?? text
  } else if (group.kind === "plan") {
    text = planText(payloadItem(group.payload).plan) ?? text
  }
  if (text === "" && group.kind === "tool") {
    const item = payloadItem(group.payload)
    text =
      item.type === "contextCompaction"
        ? group.method === "item/completed"
          ? "Context compacted"
          : "Compacting context"
        : (nonEmptyText(item.tool) ?? nonEmptyText(item.type) ?? "Tool")
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
            ...asRecord(group.payload),
            item: { ...payloadItem(group.payload), progress: group.progress },
          },
  }
}

const updateDiff = (diffs: Map<string, CanonicalEvent>, event: CanonicalEvent): void => {
  const diff = asRecord(event.payload).diff
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
export const prepareTranscriptEvents = (
  events: ReadonlyArray<CanonicalEvent>,
): ReadonlyArray<CanonicalEvent> => {
  const groups = new Map<string, EventGroup>()
  const diffs = new Map<string, CanonicalEvent>()
  const plans = new Map<string, CanonicalEvent>()
  const standalone: CanonicalEvent[] = []

  for (const event of prepareCursorEvents(events)) {
    if (event.method === "turn/plan/updated") {
      updatePlan(plans, event)
      continue
    }
    if (event.method === "turn/diff/updated") {
      updateDiff(diffs, event)
      continue
    }

    const item = itemDetails(event)
    const kind = event.kind === "unknown" ? eventKind(event.method, event.payload) : event.kind
    if (kind === "user" && item.id !== null) continue

    const groupKey = `${event.turnId ?? event.threadId}:${item.id}`
    const existing = item.id === null ? undefined : groups.get(groupKey)
    if (item.id !== null && (existing !== undefined || groupable(kind))) {
      const group =
        existing ??
        ({
          id: `item:${item.id}`,
          first: event,
          kind,
          method: event.method,
          payload: event.payload,
          completedText: null,
          command: null,
          progress: null,
          chunks: [],
          output: [],
        } satisfies EventGroup)
      groups.set(groupKey, group)
      updateGroup(group, event, item, kind)
      continue
    }

    if (standaloneVisible(event)) standalone.push(event)
  }

  return [
    ...standalone,
    ...diffs.values(),
    ...plans.values(),
    ...[...groups.values()].flatMap((group) => finishGroup(group) ?? []),
  ].sort((left, right) => left.sequence - right.sequence)
}

const assistantPhase = (event: CanonicalEvent): string | null =>
  nonEmptyText(payloadItem(event.payload).phase)

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
    }
  >()

  for (const entry of prepared) {
    const id = entry.turnId ?? `event:${entry.id}`
    const turn = turns.get(id) ?? {
      sequence: entry.sequence,
      userMessages: [],
      workingEvents: [],
      finalResponse: null,
    }
    turn.sequence = Math.min(turn.sequence, entry.sequence)
    if (entry.kind === "user") {
      turn.userMessages.push(entry)
    } else if (entry.kind === "assistant" && assistantPhase(entry) === "final_answer") {
      turn.finalResponse = entry
    } else {
      turn.workingEvents.push(entry)
    }
    turns.set(id, turn)
  }

  return [...turns.entries()]
    .map(([id, turn]) => {
      if (turn.finalResponse === null) {
        const finalIndex = turn.workingEvents.findLastIndex(
          (entry) => entry.kind === "assistant" && !payloadItem(entry.payload).parentToolUseId,
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
        durationMs: Math.max(0, end - start),
        complete: clock?.completed != null,
      }
    })
    .sort((left, right) => left.sequence - right.sequence)
}

function updateGroup(
  group: EventGroup,
  event: CanonicalEvent,
  item: ReturnType<typeof itemDetails>,
  kind: CanonicalEvent["kind"],
): void {
  if (item.type !== null) group.kind = kind
  if (item.record !== null) {
    group.payload = event.payload
    group.command = commandValue(item.record.command) ?? group.command
  }
  if (event.method.endsWith("/progress")) {
    group.progress = nonEmptyText(asRecord(event.payload).message) ?? event.text
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
