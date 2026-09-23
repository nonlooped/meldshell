import type { CanonicalEvent } from "@meldshell/contracts"

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

const readTools = new Set(["Read", "NotebookRead"])
const searchTools = new Set(["Grep", "Glob", "LS", "WebSearch", "ToolSearch"])

type Work = "thought" | "command" | "edit" | "read" | "search" | "fetch" | "tool" | "plan"

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
  const actions = Array.isArray(item.commandActions) ? item.commandActions.map(record) : []
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
  const paths = changes.map((change) => record(change).path)
  if (paths.length === 0) return [`item:${event.id}`]
  return paths.map((path) => (typeof path === "string" ? path : `item:${event.id}`))
}

/** Collapsed work line, e.g. "Ran 3 commands · edited 2 files · read 4 files". */
export function workSummary(events: ReadonlyArray<CanonicalEvent>): string {
  const counts = new Map<Work, number>()
  const edited = new Set<string>()
  const add = (work: Work) => counts.set(work, (counts.get(work) ?? 0) + 1)

  for (const event of events) {
    if (event.method === "turn/diff/updated") continue
    const item = record(record(event.payload).item)
    if (event.kind === "reasoning") add("thought")
    else if (event.kind === "plan") add("plan")
    else if (event.kind === "command") commandWork(item).forEach(add)
    else if (event.kind === "tool") add(toolWork(item))
    else if (event.kind === "file-change")
      for (const path of editedPaths(event, item)) edited.add(path)
  }

  counts.set("edit", edited.size)
  const segments = phrases.flatMap(([work, phrase]) => {
    const count = counts.get(work) ?? 0
    return count > 0 ? [phrase(count)] : []
  })
  const summary = segments.join(" · ")
  return summary.charAt(0).toUpperCase() + summary.slice(1)
}
