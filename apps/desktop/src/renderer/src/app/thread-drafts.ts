import type { ComposerAttachment } from "@meldshell/contracts/ipc"
import { create } from "zustand"

interface ThreadDraft {
  readonly text: string
  readonly attachments: ReadonlyArray<ComposerAttachment>
  readonly sending: boolean
  readonly error: string | null
}

export const emptyDraft: ThreadDraft = { text: "", attachments: [], sending: false, error: null }

export const useThreadDrafts = create<{
  drafts: Readonly<Record<string, ThreadDraft>>
  update: (id: string, patch: Partial<ThreadDraft>) => void
  finish: (id: string, sent: ThreadDraft) => void
  forget: (id: string) => void
}>((set) => ({
  drafts: {},
  update: (id, patch) =>
    set((state) => ({
      drafts: { ...state.drafts, [id]: { ...(state.drafts[id] ?? emptyDraft), ...patch } },
    })),
  finish: (id, sent) =>
    set((state) => {
      const current = state.drafts[id]
      if (!current) return state
      return {
        drafts: {
          ...state.drafts,
          [id]: {
            ...current,
            sending: false,
            text: current.text === sent.text ? "" : current.text,
            attachments: current.attachments.filter(
              (attachment) => !sent.attachments.includes(attachment),
            ),
          },
        },
      }
    }),
  forget: (id) =>
    set((state) => {
      const drafts = { ...state.drafts }
      delete drafts[id]
      return { drafts }
    }),
}))
