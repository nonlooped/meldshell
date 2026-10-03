import { asRecord, nonEmptyText, type CanonicalEvent } from "@meldshell/contracts"

/** A working-log row's name: what the tool did, and what it did it to. */
export interface ToolLabel {
  readonly verb: string
  /** The file, pattern, query, or URL the call worked on; absent when the call names none. */
  readonly target: string | null
  /** The untruncated target, for the row's tooltip. */
  readonly full: string | null
}

const text = (value: unknown): string | null => {
  const found = nonEmptyText(value)
  return found === null ? null : found.replace(/\s+/g, " ").trim() || null
}

/**
 * Agents report absolute paths. The last few segments say which file it is; the full path stays in
 * the tooltip.
 */
export const shortPath = (path: string): string => {
  const parts = path.replaceAll("\\", "/").split("/").filter(Boolean)
  if (parts.length <= 3) return path
  return `…/${parts.slice(-3).join("/")}`
}

const quoted = (value: string): string => `“${value}”`

const label = (verb: string, target: string | null, full = target): ToolLabel => ({
  verb,
  target,
  full,
})

const pathLabel = (verb: string, path: string | null, suffix = ""): ToolLabel =>
  path === null ? label(verb, null) : label(verb, `${shortPath(path)}${suffix}`, `${path}${suffix}`)

const lineRange = (args: Record<string, unknown>): string => {
  const offset = typeof args.offset === "number" ? args.offset : null
  const limit = typeof args.limit === "number" ? args.limit : null
  if (offset === null && limit === null) return ""
  const start = Math.max(1, offset ?? 1)
  return limit === null ? ` from line ${start}` : ` lines ${start}–${start + limit - 1}`
}

/** A search pattern and, when the call narrowed it, where it looked. */
const searchLabel = (verb: string, args: Record<string, unknown>): ToolLabel => {
  const pattern = text(args.pattern) ?? text(args.query)
  const where = text(args.path) ?? text(args.glob) ?? text(args.type)
  if (pattern === null) return pathLabel(verb, where)
  if (where === null) return label(verb, quoted(pattern))
  return label(verb, `${quoted(pattern)} in ${shortPath(where)}`, `${quoted(pattern)} in ${where}`)
}

const hostAndPath = (url: string): string => {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`
  } catch {
    return url
  }
}

const urlLabel = (verb: string, url: string | null): ToolLabel =>
  url === null ? label(verb, null) : label(verb, hostAndPath(url), url)

const firstText = (args: Record<string, unknown>, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = text(args[key])
    if (value !== null) return value
  }
  return null
}

// Arguments that usually name what a tool works on, in order of how well they do.
const targetKeys = [
  "file_path",
  "path",
  "notebook_path",
  "url",
  "query",
  "pattern",
  "description",
  "name",
  "command",
  "prompt",
] as const

/** A tool's own words without an MCP server prefix, e.g. "mcp__browser__browser_click" as "Browser click". */
const toolName = (name: string): string => {
  const bare = name.startsWith("mcp__") ? name.split("__").slice(2).join("__") : name
  const words = bare
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .trim()
  if (words === "") return name
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

const genericLabel = (name: string, args: Record<string, unknown>): ToolLabel => {
  const target = firstText(args, targetKeys)
  if (target === null) return label(toolName(name), null)
  return /^(?:[a-z]:)?[\\/]/i.test(target)
    ? pathLabel(toolName(name), target)
    : label(toolName(name), target)
}

/** Claude Code's built-in tools, named by what they did. */
function claudeLabel(name: string, args: Record<string, unknown>): ToolLabel {
  switch (name) {
    case "Read":
      return pathLabel("Read", text(args.file_path), lineRange(args))
    case "NotebookRead":
      return pathLabel("Read", text(args.notebook_path))
    case "Grep":
      return searchLabel("Searched", args)
    case "Glob":
      return searchLabel("Found files", args)
    case "LS":
      return pathLabel("Listed", text(args.path))
    case "WebSearch":
      return label("Searched the web", firstText(args, ["query"]))
    case "WebFetch":
      return urlLabel("Fetched", text(args.url))
    case "ToolSearch":
      return label("Looked up tools", firstText(args, ["query"]))
    case "Task":
    case "Agent": {
      const type = text(args.subagent_type)
      return label(
        type === null || type === "general-purpose" ? "Agent" : `${toolName(type)} agent`,
        firstText(args, ["description", "prompt"]),
      )
    }
    case "Skill":
      return label("Used skill", firstText(args, ["skill", "command"]))
    case "SlashCommand":
      return label("Ran", firstText(args, ["command"]))
    case "BashOutput":
      return label("Checked output", firstText(args, ["bash_id"]))
    case "KillShell":
    case "KillBash":
      return label("Stopped shell", firstText(args, ["shell_id"]))
    case "ExitPlanMode":
      return label("Proposed a plan", null)
    default:
      return genericLabel(name, args)
  }
}

/** Codex web searches describe what they did in an action; older payloads only carry the query. */
function webSearchLabel(item: Record<string, unknown>): ToolLabel {
  const action = asRecord(item.action)
  const queries = Array.isArray(action.queries) ? action.queries.flatMap((q) => text(q) ?? []) : []
  switch (action.type) {
    case "openPage":
      return urlLabel("Opened", text(action.url))
    case "findInPage": {
      const pattern = text(action.pattern)
      const url = text(action.url)
      if (pattern === null) return urlLabel("Searched page", url)
      return label(
        "Searched page",
        `${quoted(pattern)}${url === null ? "" : ` in ${hostAndPath(url)}`}`,
        `${quoted(pattern)}${url === null ? "" : ` in ${url}`}`,
      )
    }
    default: {
      const query = text(action.query) ?? queries[0] ?? text(item.query)
      const more = queries.length > 1 ? ` (+${queries.length - 1} more)` : ""
      return label("Searched the web", query === null ? null : `${query}${more}`)
    }
  }
}

const collabVerbs: Readonly<Record<string, string>> = {
  spawnAgent: "Started agent",
  sendInput: "Messaged agent",
  resumeAgent: "Resumed agent",
  wait: "Waited for agents",
  closeAgent: "Closed agent",
}

/** A readable name for a tool row, or null when the event is not a tool call this can describe. */
export function toolLabel(event: CanonicalEvent): ToolLabel | null {
  if (event.kind !== "tool") return null
  const item = asRecord(asRecord(event.payload).item)
  const args = asRecord(item.arguments)
  const name = text(item.tool)
  switch (item.type) {
    case "webSearch":
      return webSearchLabel(item)
    case "imageView":
      return pathLabel("Viewed image", text(item.path))
    case "mcpToolCall":
      return name === null ? null : { ...genericLabel(name, args), verb: toolName(name) }
    case "collabAgentToolCall":
      return label(
        (name !== null && collabVerbs[name]) || "Agent",
        text(item.prompt)?.slice(0, 200) ?? null,
      )
    case "dynamicToolCall":
      // Background tasks name themselves with their description.
      if (name === null || name === "Background task") return null
      return claudeLabel(name, args)
    default:
      return null
  }
}

/** Whether a tool row started a Claude subagent, whose own activity nests under it. */
export const startsSubagent = (event: CanonicalEvent): boolean => {
  const item = asRecord(asRecord(event.payload).item)
  return event.kind === "tool" && (item.tool === "Task" || item.tool === "Agent")
}

/** The call a subagent's event belongs to, if any. */
export const parentCall = (event: CanonicalEvent): string | null =>
  nonEmptyText(asRecord(asRecord(event.payload).item).parentToolUseId)

/** The native id a working-log event's item carries. */
export const itemId = (event: CanonicalEvent): string | null =>
  nonEmptyText(asRecord(asRecord(event.payload).item).id)

export interface LogNode {
  readonly event: CanonicalEvent
  readonly children: readonly LogNode[]
}

/**
 * Nests each subagent's work under the call that started it. Events whose call is not in this log
 * (an earlier turn or a missing parent) stay at the top level.
 */
export function nestSubagents(events: readonly CanonicalEvent[]): readonly LogNode[] {
  const ids = new Set(events.flatMap((event) => itemId(event) ?? []))
  const children = new Map<string, CanonicalEvent[]>()
  const roots: CanonicalEvent[] = []
  for (const event of events) {
    const parent = parentCall(event)
    if (parent === null || parent === itemId(event) || !ids.has(parent)) roots.push(event)
    else {
      const siblings = children.get(parent) ?? []
      siblings.push(event)
      children.set(parent, siblings)
    }
  }
  const seen = new Set<string>()
  const node = (event: CanonicalEvent): LogNode => {
    const id = itemId(event)
    if (id === null || seen.has(id)) return { event, children: [] }
    seen.add(id)
    return { event, children: (children.get(id) ?? []).map(node) }
  }
  return roots.map(node)
}
