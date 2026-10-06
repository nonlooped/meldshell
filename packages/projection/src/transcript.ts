import { Result, Schema } from "effect"
import { eventKind, eventText, planText } from "./normalization"
import { cursorProjection } from "./cursor"
import { piProjection } from "./pi"
import { Slots } from "./slots"
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
  return Result.isSuccess(decoded) ? decoded.success : null
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

type Route =
  | { readonly to: "standalone"; readonly event: CanonicalEvent }
  | { readonly to: "plan" }
  | { readonly to: "diff"; readonly payload: NativePayload }
  | { readonly to: "reply"; readonly payload: NativePayload; readonly id: string }
  | {
      readonly to: "group"
      readonly key: string
      readonly id: string
      readonly payload: NativePayload
      readonly item: ItemDetails
      readonly kind: CanonicalEventKind
    }
  | { readonly to: "none" }

/**
 * Groups provider events into the items the transcript shows, however many events streamed each
 * one. A finished item keeps its object until an event changes it.
 */
class ItemProjection {
  private readonly groups = new Map<string, EventGroup>()
  private readonly finished = new Map<EventGroup, CanonicalEvent | null>()
  private readonly diffs = new Map<string, CanonicalEvent>()
  private readonly plans = new Map<string, CanonicalEvent>()
  private readonly standalone: CanonicalEvent[] = []
  private readonly questionTurns = new Set<string | null>()
  private readonly replies = new Map<string, CanonicalEvent>()
  /** The standalone entry each input became, so a replaced input can update it in place. */
  private readonly entries = new Map<number, number>()
  private output: ReadonlyArray<CanonicalEvent> | null = null

  push(event: CanonicalEvent, input: number): void {
    this.output = null
    if (asyncQuestions(event).length > 0) this.questionTurns.add(event.turnId)
    // MCP startup progress never appears in the transcript, so its payload shape cannot fail a turn.
    if (event.method === "mcpServer/startupStatus/updated") return
    const route = this.route(event)
    switch (route.to) {
      case "standalone":
        this.entries.set(input, this.standalone.length)
        this.standalone.push(route.event)
        return
      case "plan":
        return updatePlan(this.plans, event)
      case "diff":
        return updateDiff(this.diffs, event, route.payload)
      case "reply": {
        // Initial prompts already have a local user/message. Native replies to mid-turn
        // questions have no local duplicate and must survive transcript reloads.
        if (!this.questionTurns.has(event.turnId)) return
        const key = `${event.turnId}:${route.id}`
        this.replies.set(key, nativeReply(event, route.payload, this.replies.get(key)))
        return
      }
      case "group": {
        const group =
          this.groups.get(route.key) ?? newGroup(event, route.payload, route.id, route.kind)
        this.groups.set(route.key, group)
        updateGroup(group, event, route.payload, route.item, route.kind)
        this.finished.delete(group)
        return
      }
      case "none":
        return
    }
  }

  /** Replaces an input already read, when it only ever stood alone; false otherwise. */
  replace(input: number, event: CanonicalEvent): boolean {
    const entry = this.entries.get(input)
    if (entry === undefined || event.method === "mcpServer/startupStatus/updated") return false
    if (asyncQuestions(event).length > 0 && !this.questionTurns.has(event.turnId)) return false
    const route = this.route(event)
    if (route.to !== "standalone") return false
    this.standalone[entry] = route.event
    this.output = null
    return true
  }

  items(): ReadonlyArray<CanonicalEvent> {
    if (this.output !== null) return this.output
    const finished: CanonicalEvent[] = []
    for (const group of this.groups.values()) {
      if (!this.finished.has(group)) this.finished.set(group, finishGroup(group))
      const item = this.finished.get(group)
      if (item) finished.push(item)
    }
    this.output = [
      ...this.standalone,
      ...this.replies.values(),
      ...this.diffs.values(),
      ...this.plans.values(),
      ...finished,
    ].sort((left, right) => left.sequence - right.sequence)
    return this.output
  }

  private route(event: CanonicalEvent): Route {
    const decoded = decodeNativePayload(event.payload)
    if (Result.isFailure(decoded))
      return {
        to: "standalone",
        event: {
          ...event,
          kind: "error",
          text: `Invalid ${event.method} payload: ${decoded.failure.message}`,
        },
      }
    if (event.method === "turn/plan/updated") return { to: "plan" }
    if (event.method === "turn/diff/updated") return { to: "diff", payload: decoded.success }
    const item = itemDetails(decoded.success)
    const kind = event.kind === "unknown" ? eventKind(event.method, event.payload) : event.kind
    if (kind === "user" && item.id !== null)
      return { to: "reply", payload: decoded.success, id: item.id }
    const key = `${event.turnId ?? event.threadId}:${item.id}`
    if (item.id !== null && (this.groups.has(key) || groupable(kind)))
      return { to: "group", key, id: item.id, payload: decoded.success, item, kind }
    return standaloneVisible(event) ? { to: "standalone", event } : { to: "none" }
  }
}

/** Events, unlike the items they become, are read once each; their decoded items are kept. */
const payloadItems = new WeakMap<CanonicalEvent, JsonRecord | null>()
const itemOf = (event: CanonicalEvent): JsonRecord | null => {
  let item = payloadItems.get(event)
  if (item === undefined) {
    item = payloadItem(event.payload)
    payloadItems.set(event, item)
  }
  return item
}

const assistantPhase = (event: CanonicalEvent): string | null => nonEmptyText(itemOf(event)?.phase)

const decodeAsyncQuestions = Schema.decodeUnknownResult(
  Schema.Array(
    Schema.Struct({
      title: Schema.String,
      options: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
    }),
  ),
)

const questionsAsked = new WeakMap<CanonicalEvent, AsyncQuestion[]>()

/**
 * Codex asks without blocking the turn: the question arrives as an agent message delivered
 * asynchronously, and the user's next message answers it.
 */
const asyncQuestions = (event: CanonicalEvent): AsyncQuestion[] => {
  const known = questionsAsked.get(event)
  if (known !== undefined) return known
  const item = asRecord(itemOf(event))
  const decoded = item.delivery === "async" ? decodeAsyncQuestions(item.questions) : null
  const questions =
    decoded === null || Result.isFailure(decoded)
      ? []
      : decoded.success.flatMap((question) =>
          question.title.trim()
            ? [{ title: question.title, options: (question.options ?? []).filter((o) => o.trim()) }]
            : [],
        )
  questionsAsked.set(event, questions)
  return questions
}

const eventTime = (event: CanonicalEvent): number => {
  const time = Date.parse(event.createdAt)
  return Number.isNaN(time) ? 0 : time
}

interface Clock {
  start: number | null
  first: number
  latest: number
  completed: number | null
}

const clock = (timing: Map<string, Clock>, entry: CanonicalEvent): void => {
  const id = entry.turnId ?? `event:${entry.id}`
  const time = eventTime(entry)
  const current = timing.get(id) ?? { start: null, first: time, latest: time, completed: null }
  current.first = Math.min(current.first, time)
  current.latest = Math.max(current.latest, time)
  if (entry.method === "turn/started") current.start = time
  if (entry.method === "turn/completed") current.completed = time
  timing.set(id, current)
}

const buildTurns = (
  prepared: ReadonlyArray<CanonicalEvent>,
  timing: ReadonlyMap<string, Clock>,
): ReadonlyArray<TranscriptTurn> => {
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
          (entry) => entry.kind === "assistant" && !itemOf(entry)?.parentToolUseId,
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

/** The provider stages and item grouping, fed one batch of new events at a time. */
class Pipeline {
  private readonly pi = new Slots()
  private readonly cursor = new Slots()
  private readonly readPi = piProjection(this.pi)
  private readonly readCursor = cursorProjection(this.cursor)
  private piRead = 0
  private cursorRead = 0
  /** The cursor stage's entry for each Pi output it passed through unchanged. */
  private readonly passed = new Map<number, number>()
  readonly items = new ItemProjection()
  readonly timing = new Map<string, Clock>()

  /** False when a stage changed an earlier output in a way only reading everything again can follow. */
  read(events: ReadonlyArray<CanonicalEvent>): boolean {
    for (const event of events) {
      this.readPi(event)
      clock(this.timing, event)
    }
    const piRead = this.piRead
    for (const index of this.pi.drain()) {
      const event = this.pi.items[index]!
      if (index < piRead) {
        // Pi only rewrites its own entries, which the cursor stage passes through.
        const entry = this.passed.get(index)
        if (entry === undefined) return false
        this.cursor.set(entry, event)
        continue
      }
      if (!event.method.startsWith("cursor/")) this.passed.set(index, this.cursor.items.length)
      this.readCursor(event)
    }
    this.piRead = this.pi.items.length
    const cursorRead = this.cursorRead
    for (const index of this.cursor.drain()) {
      const event = this.cursor.items[index]!
      if (index >= cursorRead) this.items.push(event, index)
      else if (!this.items.replace(index, event)) return false
    }
    this.cursorRead = this.cursor.items.length
    return true
  }
}

/**
 * Projects a growing list of events. Events newer than every one already read are projected on
 * their own: finished items keep their objects and only the items those events touch change.
 * Anything else, such as an older page of history, projects every event again.
 */
export class TranscriptProjector {
  private raw: CanonicalEvent[] = []
  private ids = new Set<string>()
  private latest = Number.NEGATIVE_INFINITY
  private pipeline = new Pipeline()
  private projected: ReadonlyArray<TranscriptTurn> | null = null

  constructor(events: ReadonlyArray<CanonicalEvent> = []) {
    this.read(events)
  }

  /** The native events read, kept as stored. */
  get events(): ReadonlyArray<CanonicalEvent> {
    return this.raw
  }

  items(): ReadonlyArray<CanonicalEvent> {
    return this.pipeline.items.items()
  }

  turns(): ReadonlyArray<TranscriptTurn> {
    this.projected ??= buildTurns(this.items(), this.pipeline.timing)
    return this.projected
  }

  /** Adds events, replacing any already read with the same id. */
  update(events: ReadonlyArray<CanonicalEvent>): void {
    if (events.length === 0) return
    if (this.appends(events) && this.read(events)) return
    const byId = new Map(this.raw.map((event) => [event.id, event]))
    for (const event of events) byId.set(event.id, event)
    this.raw = []
    this.ids = new Set()
    this.latest = Number.NEGATIVE_INFINITY
    this.pipeline = new Pipeline()
    this.read([...byId.values()].sort((left, right) => left.sequence - right.sequence))
  }

  private appends(events: ReadonlyArray<CanonicalEvent>): boolean {
    let latest = this.latest
    for (const event of events) {
      if (event.sequence <= latest || this.ids.has(event.id)) return false
      latest = event.sequence
    }
    return true
  }

  private read(events: ReadonlyArray<CanonicalEvent>): boolean {
    this.projected = null
    for (const event of events) {
      this.raw.push(event)
      this.ids.add(event.id)
      this.latest = Math.max(this.latest, event.sequence)
    }
    return this.pipeline.read(events)
  }
}

export const prepareTranscriptEvents = (
  events: ReadonlyArray<CanonicalEvent>,
): ReadonlyArray<CanonicalEvent> => new TranscriptProjector(events).items()

export const prepareTranscriptTurns = (
  events: ReadonlyArray<CanonicalEvent>,
): ReadonlyArray<TranscriptTurn> => new TranscriptProjector(events).turns()

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
