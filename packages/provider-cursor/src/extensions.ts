import { RequestError } from "@agentclientprotocol/sdk"

export interface CursorQuestion {
  toolCallId: string
  questions: Array<{
    id: string
    prompt: string
    allowMultiple?: boolean
    options: Array<{ id: string; label: string }>
  }>
  [key: string]: unknown
}

export interface CursorPlan {
  toolCallId: string
  plan: string
  todos: unknown[]
  [key: string]: unknown
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseCursorQuestion = (value: unknown): CursorQuestion => {
  if (
    !object(value) ||
    typeof value.toolCallId !== "string" ||
    !Array.isArray(value.questions) ||
    !value.questions.length ||
    !value.questions.every(
      (question: unknown) =>
        object(question) &&
        typeof question.id === "string" &&
        typeof question.prompt === "string" &&
        (question.allowMultiple === undefined || typeof question.allowMultiple === "boolean") &&
        Array.isArray(question.options) &&
        question.options.every(
          (option: unknown) =>
            object(option) && typeof option.id === "string" && typeof option.label === "string",
        ),
    )
  )
    throw RequestError.invalidParams(undefined, "Invalid Cursor question.")
  return value as unknown as CursorQuestion
}

export const parseCursorPlan = (value: unknown): CursorPlan => {
  if (
    !object(value) ||
    typeof value.toolCallId !== "string" ||
    typeof value.plan !== "string" ||
    !Array.isArray(value.todos)
  )
    throw RequestError.invalidParams(undefined, "Invalid Cursor plan.")
  return value as CursorPlan
}
