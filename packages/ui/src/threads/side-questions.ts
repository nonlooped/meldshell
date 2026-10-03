import { create } from "zustand"
import { errorMessage, type ComposerCommand } from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"

/**
 * A side question is a quick question about a thread, answered by a separate request that reads
 * the conversation. It never joins the thread or its agent's context, so asking one does not
 * change what the agent does next. Answers last until dismissed or the app closes.
 */
export interface SideQuestion {
  readonly id: string
  readonly question: string
  readonly status: "asking" | "answered" | "failed"
  readonly answer: string | null
  readonly error: string | null
}

/** `/btw`, as in Claude Code, works with every agent because MeldShell answers it itself. */
export const SIDE_QUESTION_COMMAND: ComposerCommand = {
  kind: "command",
  name: "btw",
  description: "Ask a side question. The agent won't see it.",
  argumentHint: "<question>",
}

const SIDE_QUESTION = /^\s*\/btw(?:\s+([\s\S]*))?$/

/** The question in a `/btw` message, an empty string when it has none, or null for other text. */
export function sideQuestionText(draft: string): string | null {
  const match = SIDE_QUESTION.exec(draft)
  return match === null ? null : (match[1] ?? "").trim()
}

/** The built-in command comes first, in place of any harness command of the same name. */
export function withSideQuestionCommand(
  commands: readonly ComposerCommand[] | undefined,
): ComposerCommand[] {
  return [
    SIDE_QUESTION_COMMAND,
    ...(commands ?? []).filter(
      (command) => command.kind !== "command" || command.name !== SIDE_QUESTION_COMMAND.name,
    ),
  ]
}

const NO_QUESTIONS: ReadonlyArray<SideQuestion> = []

export const useSideQuestions = create<{
  questions: Readonly<Record<string, ReadonlyArray<SideQuestion>>>
  ask: (scope: WorkspaceScope & { readonly threadId: string }, question: string) => Promise<void>
  dismiss: (threadId: string, id: string) => void
}>((set) => {
  const patch = (threadId: string, id: string, change: Partial<SideQuestion>) =>
    set((state) => ({
      questions: {
        ...state.questions,
        [threadId]: (state.questions[threadId] ?? NO_QUESTIONS).map((entry) =>
          entry.id === id ? { ...entry, ...change } : entry,
        ),
      },
    }))
  return {
    questions: {},
    ask: async (scope, question) => {
      const id = crypto.randomUUID()
      set((state) => ({
        questions: {
          ...state.questions,
          [scope.threadId]: [
            ...(state.questions[scope.threadId] ?? NO_QUESTIONS),
            { id, question, status: "asking", answer: null, error: null },
          ],
        },
      }))
      try {
        const answer = await window.meldshell.askSideQuestion({ ...scope, question })
        patch(scope.threadId, id, { status: "answered", answer })
      } catch (error) {
        patch(scope.threadId, id, {
          status: "failed",
          error: errorMessage(error, "The question could not be answered."),
        })
      }
    },
    dismiss: (threadId, id) =>
      set((state) => ({
        questions: {
          ...state.questions,
          [threadId]: (state.questions[threadId] ?? NO_QUESTIONS).filter(
            (entry) => entry.id !== id,
          ),
        },
      })),
  }
})

export const useThreadSideQuestions = (threadId: string): ReadonlyArray<SideQuestion> =>
  useSideQuestions((state) => state.questions[threadId] ?? NO_QUESTIONS)
