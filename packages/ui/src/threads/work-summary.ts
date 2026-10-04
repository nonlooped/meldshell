import { asRecord, asRecords, type CanonicalEvent } from "@meldshell/contracts"

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

const readTools = new Set(["Read", "NotebookRead"])
const searchTools = new Set(["Grep", "Glob", "LS", "WebSearch", "ToolSearch"])

export type Work = "thought" | "command" | "edit" | "read" | "search" | "fetch" | "tool" | "plan"

const phrases: ReadonlyArray<readonly [Work, (count: number) => string]> = [
  ["thought", (count) => (count === 1 ? "thought" : `thought ${count} times`)],
  ["command", (count) => `ran ${plural(count, "command", "commands")}`],
  ["edit", (count) => `edited ${plural(count, "file", "files")}`],
  ["read", (count) => `read ${plural(count, "file", "files")}`],
  ["search", (count) => `searched ${count === 1 ? "once" : `${count} times`}`],
  ["fetch", (count) => `fetched ${plural(count, "page", "pages")}`],
  ["tool", (count) => `used ${plural(count, "tool", "tools")}`],
  ["plan", () => "updated the plan"],
]

// Codex describes read-only commands; count those as what they did.
function commandWork(item: Record<string, unknown>): Work[] {
  const actions = asRecords(item.commandActions)
  const described =
    actions.length > 0 &&
    actions.every((action) => ["read", "search", "listFiles"].includes(String(action.type)))
  if (!described) return ["command"]
  return actions.map((action) => (action.type === "read" ? "read" : "search"))
}

function toolWork(item: Record<string, unknown>): Work {
  const name = typeof item.tool === "string" ? item.tool : ""
  if (readTools.has(name)) return "read"
  if (searchTools.has(name) || item.type === "webSearch") return "search"
  return name === "WebFetch" ? "fetch" : "tool"
}

function editedPaths(event: CanonicalEvent, item: Record<string, unknown>): string[] {
  const changes = Array.isArray(item.changes) ? item.changes : []
  const paths = changes.map((change) => asRecord(change).path)
  if (paths.length === 0) return [`item:${event.id}`]
  return paths.map((path) => (typeof path === "string" ? path : `item:${event.id}`))
}

function workCounts(events: ReadonlyArray<CanonicalEvent>): ReadonlyMap<Work, number> {
  const counts = new Map<Work, number>()
  const edited = new Set<string>()
  const add = (work: Work) => counts.set(work, (counts.get(work) ?? 0) + 1)

  for (const event of events) {
    if (event.method === "turn/diff/updated") continue
    const item = asRecord(asRecord(event.payload).item)
    if (event.kind === "reasoning") add("thought")
    else if (event.kind === "plan") add("plan")
    else if (event.kind === "command") commandWork(item).forEach(add)
    else if (event.kind === "tool") add(toolWork(item))
    else if (event.kind === "file-change")
      for (const path of editedPaths(event, item)) edited.add(path)
  }

  counts.set("edit", edited.size)
  return counts
}

/** Collapsed work line, e.g. "Ran 3 commands · edited 2 files · read 4 files". */
export function workSummary(events: ReadonlyArray<CanonicalEvent>): string {
  const counts = workCounts(events)
  const segments = phrases.flatMap(([work, phrase]) => {
    const count = counts.get(work) ?? 0
    return count > 0 ? [phrase(count)] : []
  })
  const summary = segments.join(" · ")
  return summary.charAt(0).toUpperCase() + summary.slice(1)
}

// The most consequential kind of work names the summary's icon.
const significance: ReadonlyArray<Work> = [
  "edit",
  "command",
  "fetch",
  "search",
  "read",
  "tool",
  "plan",
  "thought",
]

/** The most consequential work in a turn, or null when it did none. */
export function primaryWork(events: ReadonlyArray<CanonicalEvent>): Work | null {
  const counts = workCounts(events)
  return significance.find((work) => (counts.get(work) ?? 0) > 0) ?? null
}

/** What kind of work a tool call did, for its row's icon. */
export const toolEventWork = (event: CanonicalEvent): Work =>
  toolWork(asRecord(asRecord(event.payload).item))

/** Work that only looks things up; runs of it fold into one line in the working log. */
export type LookupWork = Extract<Work, "read" | "search">

/** What a single event looked up, or null when it did anything else. */
export function lookupWork(event: CanonicalEvent): LookupWork | null {
  const item = asRecord(asRecord(event.payload).item)
  const works =
    event.kind === "command" ? commandWork(item) : event.kind === "tool" ? [toolWork(item)] : []
  const first = works[0]
  if (first !== "read" && first !== "search") return null
  return works.every((work) => work === first) ? first : null
}

/** A folded run's line, e.g. "Read 6 files" or "Searched 4 times". */
export function lookupSummary(work: LookupWork, count: number): string {
  const phrase = phrases.find(([kind]) => kind === work)?.[1](count) ?? ""
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}
