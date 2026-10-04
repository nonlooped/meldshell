import type {
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
} from "@anthropic-ai/claude-agent-sdk"
import { readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import { asRecords, type ApprovalDecision } from "@meldshell/contracts"
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff"

/** Claude Code's own mode switch out of planning, which MeldShell reviews as a plan. */
const EXIT_PLAN_MODE = "ExitPlanMode"

/** Claude Code runs shell commands through Bash, and through PowerShell on Windows. */
export const shellTools: ReadonlyArray<string> = ["Bash", "PowerShell"]

/** Claude Code's tools that change files, which MeldShell reviews as file changes. */
const fileTools: ReadonlyArray<string> = ["Edit", "MultiEdit", "Write", "NotebookEdit"]

/** Larger files are not read to place an edit; the edit's own text is shown instead. */
const MAX_DIFF_BYTES = 2_000_000

const filePath = (input: Record<string, unknown>): string | null => {
  const path = input.file_path ?? input.notebook_path
  return typeof path === "string" && path !== "" ? path : null
}

/** A path as the user knows it: relative to the workspace when inside it. */
const displayPath = (path: string, workspacePath: string): string => {
  const inside = relative(workspacePath, resolve(workspacePath, path))
  const shown = inside === "" || inside.startsWith("..") || isAbsolute(inside) ? path : inside
  return shown.replaceAll("\\", "/")
}

/** What a tool call is for, in a sentence. */
const toolSummary = (
  toolName: string,
  toolInput: Record<string, unknown>,
  workspacePath: string,
): string => {
  const path = filePath(toolInput)
  if (path === null || !fileTools.includes(toolName)) return `Claude Code wants to use ${toolName}.`
  const verb = toolName === "Write" ? "write" : "edit"
  return `Claude Code wants to ${verb} ${displayPath(path, workspacePath)}.`
}

interface TextEdit {
  readonly oldText: string
  readonly newText: string
  readonly all: boolean
}

const textEdits = (toolName: string, toolInput: Record<string, unknown>): TextEdit[] => {
  const edit = (value: Record<string, unknown>): TextEdit => ({
    oldText: String(value.old_string ?? ""),
    newText: String(value.new_string ?? ""),
    all: value.replace_all === true,
  })
  if (toolName === "Edit") return [edit(toolInput)]
  if (toolName === "MultiEdit") return asRecords(toolInput.edits).map(edit)
  return []
}

/** The file after the edits, or null when one no longer matches it. */
const applyEdits = (content: string, edits: ReadonlyArray<TextEdit>): string | null => {
  let next = content
  for (const { oldText, newText, all } of edits) {
    // An empty match creates the file, as Claude Code's Edit does.
    if (oldText === "") {
      if (next !== "") return null
      next = newText
    } else if (!next.includes(oldText)) return null
    else next = all ? next.replaceAll(oldText, newText) : next.replace(oldText, () => newText)
  }
  return next
}

const readText = async (path: string): Promise<string | null> => {
  try {
    const content = await readFile(path, "utf8")
    return content.length > MAX_DIFF_BYTES ? null : content
  } catch {
    return null
  }
}

const filePatch = (oldName: string, newName: string, before: string, after: string): string =>
  createTwoFilesPatch(oldName, newName, before, after, undefined, undefined, {
    context: 3,
    headerOptions: FILE_HEADERS_ONLY,
  })

/**
 * The unified diff a file tool call would make, read against the file as it is now so the lines
 * carry their real numbers. Null for tools that change no file text.
 */
export const toolPatch = async (
  toolName: string,
  toolInput: Record<string, unknown>,
  workspacePath: string,
  read: (path: string) => Promise<string | null> = readText,
): Promise<string | null> => {
  const path = filePath(toolInput)
  if (path === null) return null
  const name = displayPath(path, workspacePath)
  if (toolName === "Write") {
    const before = await read(resolve(workspacePath, path))
    const content = String(toolInput.content ?? "")
    return before === null
      ? filePatch("/dev/null", name, "", content)
      : filePatch(name, name, before, content)
  }
  const edits = textEdits(toolName, toolInput)
  if (edits.length === 0) return null
  const before = await read(resolve(workspacePath, path))
  const after = before === null ? null : applyEdits(before, edits)
  if (before !== null && after !== null) return filePatch(name, name, before, after)
  // Without the file, the edits' own text still shows what changes, without line numbers.
  return edits.map(({ oldText, newText }) => filePatch(name, name, oldText, newText)).join("")
}

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
  if (shellTools.includes(toolName)) return "item/commandExecution/requestApproval"
  if (fileTools.includes(toolName)) return "item/fileChange/requestApproval"
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
  workspacePath: string,
  patch: string | null = null,
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
      reason: toolSummary(toolName, toolInput, workspacePath),
      ...(toolInput.command === undefined ? {} : { command: toolInput.command }),
      permissions: { tool: toolName, input: toolInput },
      questions,
      ...(plan ? { plan: typeof toolInput.plan === "string" ? toolInput.plan : "" } : {}),
      toolName,
      input: toolInput,
      ...(patch === null ? {} : { patch }),
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
  reason?: string,
): PermissionResult => {
  if (!accepts(decision))
    return {
      behavior: "deny",
      message: reason?.trim()
        ? `The user declined this request and said: ${reason.trim()}`
        : "The user declined this request.",
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
