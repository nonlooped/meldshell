import { create } from "zustand"

export interface FileTab {
  readonly id: string
  readonly workspaceId: string
  readonly path: string
  readonly line?: number
  readonly endLine?: number
}
interface TabStore {
  readonly files: readonly FileTab[]
  readonly selectedFileId: string | null
  readonly openFile: (workspaceId: string, path: string, line?: number, endLine?: number) => void
  readonly selectTab: (id: string) => void
  readonly closeTab: (id: string) => void

  readonly openThreadIds: ReadonlyArray<string>
  readonly selectedThreadId: string | null
  readonly openThread: (threadId: string) => void
  readonly closeThread: (threadId: string) => void
  readonly selectThread: (threadId: string) => void
  readonly cycle: (direction: 1 | -1) => void
  readonly removeThread: (threadId: string) => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  files: [],
  selectedFileId: null,
  openFile: (workspaceId, path, line, endLine) =>
    set((state) => {
      const normalized = path.replaceAll("\\", "/")
      const id = `file:${JSON.stringify([workspaceId, normalized])}`
      return {
        files: state.files.some((file) => file.id === id)
          ? state.files.map((file) => (file.id === id ? { ...file, line, endLine } : file))
          : [...state.files, { id, workspaceId, path: normalized, line, endLine }],
        selectedFileId: id,
      }
    }),
  selectTab: (id) => {
    if (get().files.some((file) => file.id === id)) set({ selectedFileId: id })
    else get().selectThread(id)
  },
  closeTab: (id) => {
    const state = get()
    if (!state.files.some((file) => file.id === id)) {
      state.closeThread(id)
      return
    }
    const index = state.files.findIndex((file) => file.id === id)
    const files = state.files.filter((file) => file.id !== id)
    set({
      files,
      selectedFileId:
        state.selectedFileId === id
          ? (files[Math.min(index, files.length - 1)]?.id ?? null)
          : state.selectedFileId,
    })
  },
  openThreadIds: [],
  selectedThreadId: null,
  openThread: (threadId) =>
    set((state) => ({
      openThreadIds: state.openThreadIds.includes(threadId)
        ? state.openThreadIds
        : [...state.openThreadIds, threadId],
      selectedThreadId: threadId,
      selectedFileId: null,
    })),
  closeThread: (threadId) =>
    set((state) => {
      const closedIndex = state.openThreadIds.indexOf(threadId)
      const openThreadIds = state.openThreadIds.filter((id) => id !== threadId)
      const selectedThreadId =
        state.selectedThreadId === threadId
          ? (openThreadIds[Math.min(closedIndex, openThreadIds.length - 1)] ?? null)
          : state.selectedThreadId
      return { openThreadIds, selectedThreadId }
    }),
  selectThread: (threadId) => set({ selectedThreadId: threadId, selectedFileId: null }),
  cycle: (direction) => {
    const state = get()
    const ids = [...state.openThreadIds, ...state.files.map((file) => file.id)]
    if (ids.length < 2) return
    const index = Math.max(0, ids.indexOf(state.selectedFileId ?? state.selectedThreadId ?? ""))
    state.selectTab(ids[(index + direction + ids.length) % ids.length]!)
  },
  removeThread: (threadId) =>
    set((state) => {
      const openThreadIds = state.openThreadIds.filter((id) => id !== threadId)
      return {
        openThreadIds,
        selectedThreadId:
          state.selectedThreadId === threadId
            ? (openThreadIds.at(-1) ?? null)
            : state.selectedThreadId,
      }
    }),
}))
