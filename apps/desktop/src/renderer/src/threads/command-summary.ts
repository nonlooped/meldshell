const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

const text = (value: unknown): string => (typeof value === "string" ? value : "")

export function commandLabel(payload: unknown, fallback: string): string {
  const item = record(record(payload).item)
  // The Claude adapter preserves the native tool name on Bash executions.
  if (item.tool === "Bash")
    return item.status === "inProgress" ? "Running a command" : "Ran a command"

  const summary = commandSummary(payload)
  if (summary !== null) return summary
  const actions = item.commandActions
  if (Array.isArray(actions) && actions.length > 0) {
    const commands = actions.map((action) => text(record(action).command))
    if (commands.every(Boolean)) return commands.join("; ")
  }
  return text(item.command) || fallback
}

// Only summarize when the provider describes every action in the command.
function commandSummary(payload: unknown): string | null {
  const actions = record(record(payload).item).commandActions
  if (!Array.isArray(actions) || actions.length === 0) return null
  const summaries: string[] = []
  for (const value of actions) {
    const action = record(value)
    const path = text(action.path)
    switch (action.type) {
      case "read": {
        const name = text(action.name) || path
        if (!name) return null
        summaries.push(`Read ${name}`)
        break
      }
      case "listFiles":
        summaries.push(path ? `List files in ${path}` : "List files")
        break
      case "search": {
        const query = text(action.query)
        summaries.push(`Search${query ? ` for ${query}` : ""}${path ? ` in ${path}` : ""}`)
        break
      }
      default:
        return null
    }
  }
  return summaries.join(" · ")
}
