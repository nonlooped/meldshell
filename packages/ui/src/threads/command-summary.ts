import { asRecord, asText } from "@meldshell/contracts"

export function commandLabel(payload: unknown, fallback: string): string {
  const item = asRecord(asRecord(payload).item)
  const summary = commandSummary(payload)
  if (summary !== null) return summary
  const actions = item.commandActions
  if (Array.isArray(actions) && actions.length > 0) {
    const commands = actions.map((action) => asText(asRecord(action).command))
    if (commands.every(Boolean)) return commands.join("; ")
  }
  return asText(item.command) || fallback
}

// Only summarize when the provider describes every action in the command.
function commandSummary(payload: unknown): string | null {
  const actions = asRecord(asRecord(payload).item).commandActions
  if (!Array.isArray(actions) || actions.length === 0) return null
  const summaries: string[] = []
  for (const value of actions) {
    const action = asRecord(value)
    const path = asText(action.path)
    switch (action.type) {
      case "read": {
        const name = asText(action.name) || path
        if (!name) return null
        summaries.push(`Read ${name}`)
        break
      }
      case "listFiles":
        summaries.push(path ? `List files in ${path}` : "List files")
        break
      case "search": {
        const query = asText(action.query)
        summaries.push(`Search${query ? ` for ${query}` : ""}${path ? ` in ${path}` : ""}`)
        break
      }
      default:
        return null
    }
  }
  return summaries.join(" · ")
}
