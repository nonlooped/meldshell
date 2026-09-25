import { Either, Schema } from "effect"
import {
  decodeNativePayload,
  decodeCursorPayload,
  PlanStep,
  type NativeItem,
  type CursorPayload,
  nonEmptyText,
  type CanonicalEventKind,
} from "@meldshell/contracts"
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

export const planText = (value: unknown): string | null => {
  const decoded = Schema.decodeUnknownEither(Schema.Array(PlanStep))(value)
  if (Either.isLeft(decoded)) return null
  const steps = decoded.right.flatMap((step) => {
    const text = nonEmptyText(step.step) ?? nonEmptyText(step.content)
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
  const decoded = decodeNativePayload(params)
  if (Either.isLeft(decoded)) return `Invalid ${method} payload: ${decoded.left.message}`
  const record = decoded.right
  if (method === CLAUDE_EXIT_PLAN_MODE) return nonEmptyText(record.plan)
  const delta = nonEmptyText(record.delta)
  if (delta !== null) return delta
  if (method === "turn/plan/updated")
    return (
      [nonEmptyText(record.explanation), planText(record.plan)].filter(Boolean).join("\n\n") || null
    )
  if (method.endsWith("/progress")) return nonEmptyText(record.message)
  const error = record.error
  const message = nonEmptyText(typeof error === "string" ? error : error?.message)
  if (message !== null) return message
  const text = nativeItemText(record.item)
  if (text !== undefined) return text
  const turn = record.turn
  if (method === "turn/completed" && turn?.status) return `Turn ${String(turn.status)}.`
  return null
}

export const approvalCopy = (
  method: string,
  params: unknown,
): { title: string; detail: string } => {
  if (method.startsWith("cursor/")) {
    const decoded = decodeCursorPayload(params)
    return Either.isRight(decoded)
      ? cursorApprovalCopy(method, decoded.right)
      : { title: "Invalid Cursor request", detail: decoded.left.message }
  }
  const decoded = decodeNativePayload(params)
  if (Either.isLeft(decoded))
    return { title: "Invalid provider request", detail: decoded.left.message }
  const record = decoded.right
  if (method === CLAUDE_EXIT_PLAN_MODE)
    return {
      title: "Approve Claude's plan?",
      detail: "Claude Code is ready to leave plan mode and start working.",
    }
  const provider = typeof record.toolName === "string" ? "Claude Code" : "Codex"
  const command = Array.isArray(record.command)
    ? record.command.map(String).join(" ")
    : nonEmptyText(record.command)
  if (method.includes("commandExecution")) {
    return {
      title: "Allow this command?",
      detail: command ?? nonEmptyText(record.reason) ?? `${provider} wants to run a command.`,
    }
  }
  if (method.includes("fileChange")) {
    return {
      title: "Allow these file changes?",
      detail: nonEmptyText(record.reason) ?? `${provider} wants to edit files in this workspace.`,
    }
  }
  return { title: `${provider} needs your input`, detail: nonEmptyText(record.reason) ?? method }
}

const cursorApprovalCopy = (method: string, record: CursorPayload) => {
  const tool = record.toolCall
  return {
    title:
      method === "cursor/create_plan"
        ? "Approve Cursor's plan?"
        : method === "cursor/ask_question"
          ? String(record.title ?? "Cursor needs your input")
          : "Cursor requests permission",
    detail: String(record.overview ?? tool?.title ?? record.title ?? "Review Cursor's request."),
  }
}

const nativeItemType = (params: unknown): string => {
  const decoded = decodeNativePayload(params)
  return Either.isRight(decoded) ? (decoded.right.item?.type ?? "") : ""
}

const nativeItemText = (item: NativeItem | null | undefined): string | null | undefined => {
  if (!item) return undefined
  const itemRecord = item
  for (const key of ["text", "message", "summary", "plan", "review", "command"] as const) {
    const value = itemRecord[key]
    const text = nonEmptyText(value)
    if (text !== null) return text
    if (Array.isArray(value))
      return value.filter((entry) => typeof entry === "string").join("\n") || null
  }
  return undefined
}
