import type {
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
} from "@anthropic-ai/claude-agent-sdk"
import { asRecords, type ApprovalDecision } from "@meldshell/contracts"

/** Claude Code's own mode switch out of planning, which MeldShell reviews as a plan. */
const EXIT_PLAN_MODE = "ExitPlanMode"

interface ToolQuestion {
  readonly id: string
  readonly header: string
  readonly question: string
  readonly multiSelect: boolean
  readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>
}

/** The questions `AskUserQuestion` puts to the user, in the shared interaction shape. */
const toolQuestions = (toolName: string, toolInput: Record<string, unknown>): ToolQuestion[] =>
  toolName === "AskUserQuestion"
    ? asRecords(toolInput.questions).map((value, index) => ({
        id: String(index),
        header: String(value.header ?? "Question"),
        question: String(value.question ?? ""),
        multiSelect: value.multiSelect === true,
        options: asRecords(value.options).map((option) => ({
          label: String(option.label ?? ""),
          description: String(option.description ?? ""),
        })),
      }))
    : []

/** The interaction method a tool call raises, in the vocabulary Codex established. */
const approvalMethod = (toolName: string, asksQuestions: boolean): string => {
  if (toolName === EXIT_PLAN_MODE) return "claude/exit_plan_mode"
  if (asksQuestions) return "item/tool/requestUserInput"
  if (toolName === "Bash") return "item/commandExecution/requestApproval"
  if (["Edit", "Write", "NotebookEdit"].includes(toolName)) return "item/fileChange/requestApproval"
  return "item/permissions/requestApproval"
}

/** A tool call waiting on the user, with what is needed to answer it. */
export interface PendingApproval {
  readonly input: Record<string, unknown>
  readonly suggestions: ReadonlyArray<PermissionUpdate>
  readonly questions: ReadonlyArray<ToolQuestion>
  /** Set for a plan review: the mode Claude works in once the plan is approved. */
  readonly workingMode?: PermissionMode
}

/** The interaction to show for a tool call, and what answering it needs. */
export const toolApproval = (
  toolName: string,
  toolInput: Record<string, unknown>,
  suggestions: ReadonlyArray<PermissionUpdate>,
  workingMode: PermissionMode,
) => {
  const questions = toolQuestions(toolName, toolInput)
  const plan = toolName === EXIT_PLAN_MODE
  const pending: PendingApproval = {
    input: toolInput,
    suggestions,
    questions,
    ...(plan ? { workingMode } : {}),
  }
  return {
    pending,
    method: approvalMethod(toolName, questions.length > 0),
    params: {
      approvalScope: "turn",
      reason: `Claude Code wants to use ${toolName}.\n${JSON.stringify(toolInput, null, 2)}`,
      command: toolInput.command,
      permissions: { tool: toolName, input: toolInput },
      questions,
      ...(plan ? { plan: typeof toolInput.plan === "string" ? toolInput.plan : "" } : {}),
      toolName,
      input: toolInput,
    },
  }
}

export const accepts = (decision: ApprovalDecision): boolean =>
  decision === "accept" || decision === "acceptForSession"

/** Why answers cannot accept an approval, or null when they can. */
export const answerProblem = (
  approval: PendingApproval,
  answers: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
): string | null =>
  approval.questions.some((question) => !answers?.[question.id]?.some((answer) => answer.trim()))
    ? "Answer each question before continuing."
    : null

/** The SDK's answer to a tool call once the user has decided. */
export const permissionResult = (
  approval: PendingApproval,
  decision: ApprovalDecision,
  answers: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
): PermissionResult => {
  if (!accepts(decision))
    return {
      behavior: "deny",
      message: "The user declined this request.",
      interrupt: decision === "cancel",
    }
  const answered = approval.questions.length
    ? {
        answers: Object.fromEntries(
          approval.questions.map((question) => [
            question.question,
            (answers?.[question.id] ?? []).join(", "),
          ]),
        ),
      }
    : {}
  // Session approval must never write user or project settings.
  const permissions: PermissionUpdate[] | undefined =
    approval.workingMode !== undefined
      ? [{ type: "setMode", mode: approval.workingMode, destination: "session" }]
      : decision === "acceptForSession"
        ? approval.suggestions.map((suggestion) => ({ ...suggestion, destination: "session" }))
        : undefined
  return {
    behavior: "allow",
    updatedInput: { ...approval.input, ...answered },
    ...(permissions === undefined ? {} : { updatedPermissions: permissions }),
  }
}
