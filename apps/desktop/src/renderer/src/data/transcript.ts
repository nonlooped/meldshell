import type { CanonicalEvent, TranscriptPage, TranscriptQuery } from "@meldshell/contracts"
import { prepareTranscriptTurns, type TranscriptTurn } from "@meldshell/projection"

const transcriptMetrics = {
  requests: 0,
  eventsReceived: 0,
  fetchMs: 0,
  turnsProjected: 0,
  eventsProjected: 0,
  projectionMs: 0,
}

export interface TranscriptWindow {
  readonly groups: ReadonlyMap<string, readonly CanonicalEvent[]>
  readonly projected: ReadonlyMap<string, readonly TranscriptTurn[]>
  readonly turns: readonly TranscriptTurn[]
  readonly latestSequence: number
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

// Events are durable append-only records. Only touched turns are reprojected;
// completed historical turns retain their object identity and native payloads.
export function mergeTranscript(
  previous: TranscriptWindow | undefined,
  events: readonly CanonicalEvent[],
): TranscriptWindow {
  if (previous && events.length === 0) return previous
  const start = performance.now()
  const groups = new Map(previous?.groups)
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
    const byId = new Map(groups.get(key)?.map((event) => [event.id, event]))
    for (const event of incoming) byId.set(event.id, event)
    const group = [...byId.values()].sort((a, b) => a.sequence - b.sequence)
    groups.set(key, group)
    projected.set(key, prepareTranscriptTurns(group))
    transcriptMetrics.turnsProjected++
    transcriptMetrics.eventsProjected += group.length
  }
  const turns = [...projected.values()].flat().sort((a, b) => a.sequence - b.sequence)
  transcriptMetrics.projectionMs += performance.now() - start
  return { groups, projected, turns, latestSequence }
}

export async function refreshTranscript(
  read: (input: TranscriptQuery) => Promise<TranscriptPage>,
  threadId: string,
  previous?: TranscriptWindow,
  current: () => TranscriptWindow | undefined = () => previous,
): Promise<TranscriptWindow> {
  const events: CanonicalEvent[] = []
  let afterSequence = previous?.latestSequence ?? 0
  while (true) {
    const page = await readTranscriptPage(read, { threadId, afterSequence, limit: 200 })
    events.push(...page.events)
    if (page.nextCursor === null) break
    if (page.nextCursor <= afterSequence) throw new Error("Transcript cursor did not advance.")
    afterSequence = page.nextCursor
  }
  return mergeTranscript(current() ?? previous, events)
}
