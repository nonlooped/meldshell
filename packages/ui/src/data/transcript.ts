import type { CanonicalEvent, TranscriptPage, TranscriptQuery } from "@meldshell/contracts"
import { TranscriptProjector, type TranscriptTurn } from "@meldshell/projection"

const transcriptMetrics = {
  requests: 0,
  eventsReceived: 0,
  fetchMs: 0,
  turnsProjected: 0,
  eventsProjected: 0,
  projectionMs: 0,
}

/** Events per request. A backward page also completes the turn at its start. */
const PAGE_SIZE = 200

export interface TranscriptWindow {
  /** Each turn's native events, as stored. */
  readonly groups: ReadonlyMap<string, readonly CanonicalEvent[]>
  readonly projectors: ReadonlyMap<string, TranscriptProjector>
  readonly projected: ReadonlyMap<string, readonly TranscriptTurn[]>
  readonly turns: readonly TranscriptTurn[]
  readonly latestSequence: number
  /** Where older history continues, or null once the thread's first turn is loaded. */
  readonly olderCursor: number | null
}

async function readTranscriptPage(
  read: (input: TranscriptQuery) => Promise<TranscriptPage>,
  input: TranscriptQuery,
): Promise<TranscriptPage> {
  const start = performance.now()
  transcriptMetrics.requests++
  try {
    const page = await read(input)
    transcriptMetrics.eventsReceived += page.events.length
    return page
  } finally {
    transcriptMetrics.fetchMs += performance.now() - start
  }
}

// Events are durable append-only records. Only touched turns are projected again, and a turn
// that only gained newer events projects just those; the rest keep their object identity.
function mergeTranscript(
  previous: TranscriptWindow | undefined,
  events: readonly CanonicalEvent[],
  olderCursor: number | null,
): TranscriptWindow {
  if (previous && events.length === 0 && olderCursor === previous.olderCursor) return previous
  const start = performance.now()
  const groups = new Map(previous?.groups)
  const projectors = new Map(previous?.projectors)
  const changed = new Map<string, CanonicalEvent[]>()
  let latestSequence = previous?.latestSequence ?? 0
  for (const event of events) {
    const key = event.turnId ?? `thread:${event.threadId}`
    const group = changed.get(key) ?? []
    group.push(event)
    changed.set(key, group)
    latestSequence = Math.max(latestSequence, event.sequence)
  }
  const projected = new Map(previous?.projected)
  for (const [key, incoming] of changed) {
    // A discarded fetch may already have read these events; the projector skips repeats by id.
    const projector = projectors.get(key) ?? new TranscriptProjector()
    projector.update(incoming)
    projectors.set(key, projector)
    groups.set(key, [...projector.events])
    projected.set(key, projector.turns())
    transcriptMetrics.turnsProjected++
    transcriptMetrics.eventsProjected += incoming.length
  }
  const turns = [...projected.values()].flat().sort((a, b) => a.sequence - b.sequence)
  transcriptMetrics.projectionMs += performance.now() - start
  return { groups, projectors, projected, turns, latestSequence, olderCursor }
}

/**
 * A thread opens at its latest turns. Later reads fetch only the events after the newest one
 * loaded, and `older` adds one page of the history before the oldest.
 */
export async function refreshTranscript(
  read: (input: TranscriptQuery) => Promise<TranscriptPage>,
  threadId: string,
  previous?: TranscriptWindow,
  current: () => TranscriptWindow | undefined = () => previous,
  older = false,
): Promise<TranscriptWindow> {
  if (previous === undefined) {
    const page = await readTranscriptPage(read, { threadId, limit: PAGE_SIZE })
    const latest = current()
    return mergeTranscript(latest, page.events, latest?.olderCursor ?? page.nextCursor)
  }
  const events: CanonicalEvent[] = []
  let olderCursor = previous.olderCursor
  if (older && olderCursor !== null) {
    const page = await readTranscriptPage(read, {
      threadId,
      beforeSequence: olderCursor,
      limit: PAGE_SIZE,
    })
    events.push(...page.events)
    olderCursor = page.nextCursor
  }
  let afterSequence = previous.latestSequence
  while (true) {
    const page = await readTranscriptPage(read, { threadId, afterSequence, limit: PAGE_SIZE })
    events.push(...page.events)
    if (page.nextCursor === null) break
    if (page.nextCursor <= afterSequence) throw new Error("Transcript cursor did not advance.")
    afterSequence = page.nextCursor
  }
  const latest = current() ?? previous
  // Another read may have reached further back meanwhile.
  return mergeTranscript(
    latest,
    events,
    latest.olderCursor === null || olderCursor === null
      ? null
      : Math.min(latest.olderCursor, olderCursor),
  )
}
