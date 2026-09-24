import type { CanonicalEventKind } from "@meldshell/contracts"
import { cursorEventKind, cursorEventText } from "./cursor"

/** Claude Code asks to leave plan mode with the plan it wrote; approving it starts the work. */
export const CLAUDE_EXIT_PLAN_MODE = "claude/exit_plan_mode"
/** Claude Code left plan mode, so the thread's next turn should not start in it again. */
export const CLAUDE_PERMISSION_MODE = "claude/permission_mode"

export const eventKind = (method: string, params: unknown): CanonicalEventKind => {
  if (method.startsWith("cursor/")) return cursorEventKind(method, params)
  if (method === CLAUDE_EXIT_PLAN_MODE) return "approval"
  if (method === CLAUDE_PERMISSION_MODE) return "status"
  return nativeEventKind(method, params)
}

const nativeEventKind = (method: string, params: unknown): CanonicalEventKind => {
  const itemType = nativeItemType(params)

  if (itemType === "agentMessage" || method.includes("agentMessage")) return "assistant"
  if (itemType === "reasoning" || method.includes("reasoning")) return "reasoning"
  if (itemType === "userMessage") return "user"
  if (method.includes("plan") || itemType === "plan") return "plan"
  if (method.includes("commandExecution") || itemType === "commandExecution") return "command"
  if (method.includes("fileChange") || itemType === "fileChange") return "file-change"
  if (
    /mcp|tool|webSearch/i.test(method) ||
    /tool|search|imageGeneration|imageView|collabAgent|contextCompaction|providerStatus/i.test(
      itemType,
    )
  )
    return "tool"
  if (/requestApproval/i.test(method)) return "approval"
  if (/tokenUsage|rateLimits/i.test(method)) return "usage"
  if (method === "error" || method.endsWith("/error")) return "error"
  if (method.startsWith("turn/") || method.startsWith("thread/")) return "status"
  return "unknown"
}

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

export const planText = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null
  const steps = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return []
    const step = entry as Record<string, unknown>
    const text = stringValue(step.step) ?? stringValue(step.content)
    if (!text) return []
    const status =
      step.status === "completed"
        ? "Done"
        : step.status === "inProgress" || step.status === "in_progress"
          ? "In progress"
          : "Pending"
    return [`${status}: ${text}`]
  })
  return steps.length ? steps.join("\n") : null
}

export const eventText = (method: string, params: unknown): string | null => {
  if (method.startsWith("cursor/")) return cursorEventText(method, params)
  if (typeof params !== "object" || params === null) return null
  const record = params as Record<string, unknown>
  if (method === CLAUDE_EXIT_PLAN_MODE) return stringValue(record.plan)
  const delta = stringValue(record.delta)
  if (delta !== null) return delta
  if (method === "turn/plan/updated")
    return (
      [stringValue(record.explanation), planText(record.plan)].filter(Boolean).join("\n\n") || null
    )
  if (method.endsWith("/progress")) return stringValue(record.message)
  const error = record.error
  if (typeof error === "object" && error !== null) {
    const message = stringValue((error as Record<string, unknown>).message)
    if (message !== null) return message
  }
  const text = nativeItemText(record.item)
  if (text !== undefined) return text
  if (method === "turn/completed") {
    const turn = record.turn
    if (typeof turn === "object" && turn !== null && "status" in turn) {
      return `Turn ${String(turn.status)}.`
    }
  }
  return null
}

export const approvalCopy = (
  method: string,
  params: unknown,
): { title: string; detail: string } => {
  const record =
    typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {}
  if (method.startsWith("cursor/")) {
    return cursorApprovalCopy(method, record)
  }
  if (method === CLAUDE_EXIT_PLAN_MODE)
    return {
      title: "Approve Claude's plan?",
      detail: "Claude Code is ready to leave plan mode and start working.",
    }
  const provider = typeof record.toolName === "string" ? "Claude Code" : "Codex"
  const command = Array.isArray(record.command)
    ? record.command.map(String).join(" ")
    : stringValue(record.command)
  if (method.includes("commandExecution")) {
    return {
      title: "Allow this command?",
      detail: command ?? stringValue(record.reason) ?? `${provider} wants to run a command.`,
    }
  }
  if (method.includes("fileChange")) {
    return {
      title: "Allow these file changes?",
      detail: stringValue(record.reason) ?? `${provider} wants to edit files in this workspace.`,
    }
  }
  return { title: `${provider} needs your input`, detail: stringValue(record.reason) ?? method }
}

const cursorApprovalCopy = (method: string, record: Record<string, unknown>) => {
  const tool =
    typeof record.toolCall === "object" && record.toolCall !== null
      ? (record.toolCall as Record<string, unknown>)
      : {}
  return {
    title:
      method === "cursor/create_plan"
        ? "Approve Cursor's plan?"
        : method === "cursor/ask_question"
          ? String(record.title ?? "Cursor needs your input")
          : "Cursor requests permission",
    detail: String(record.overview ?? tool.title ?? record.title ?? "Review Cursor's request."),
  }
}

const nativeItemType = (params: unknown): string => {
  const item =
    typeof params === "object" && params !== null && "item" in params ? params.item : undefined
  return typeof item === "object" && item !== null && "type" in item ? String(item.type) : ""
}

const nativeItemText = (item: unknown): string | null | undefined => {
  if (typeof item === "object" && item !== null) {
    const itemRecord = item as Record<string, unknown>
    for (const key of ["text", "message", "summary", "plan", "review", "command"]) {
      const value = itemRecord[key]
      const text = stringValue(value)
      if (text !== null) return text
      if (Array.isArray(value))
        return value.filter((entry) => typeof entry === "string").join("\n") || null
    }
  }

  return undefined
}
