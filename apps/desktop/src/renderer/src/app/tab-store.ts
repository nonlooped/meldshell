import type { GitDiffSide, WorkspaceScope } from "@meldshell/contracts/ipc"
import { create } from "zustand"
import {
  movePane,
  removePane,
  resizeSplit,
  splitPane,
  threadLeaf,
  visibleThreads,
  type DropZone,
  type SplitEdge,
  type ThreadLayout,
} from "./thread-layout"

export interface FileTab extends WorkspaceScope {
  readonly id: string
  readonly path: string
  readonly diffSide?: GitDiffSide
  readonly line?: number
  readonly endLine?: number
}
export interface ThreadTab {
  readonly id: string
  readonly layout: ThreadLayout
  readonly focusedThreadId: string
}

interface TabStore {
  readonly threadTabs: readonly ThreadTab[]
  readonly selectedThreadTabId: string | null
  /** Pane tree for the thread area. Files still take the whole area while a file tab is selected. */
  readonly layout: ThreadLayout | null
  readonly dropThread: (target: string, threadId: string, zone: DropZone) => void
  readonly openBeside: (threadId: string, edge: SplitEdge) => void
  readonly resizeSplit: (id: string, ratio: number) => void
  readonly maximizeThread: (threadId: string) => void

  readonly files: readonly FileTab[]
  readonly selectedFileId: string | null
  readonly openFile: (scope: WorkspaceScope, path: string, line?: number, endLine?: number) => void
  readonly openDiff: (scope: WorkspaceScope, path: string, side: GitDiffSide) => void
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

function newThreadTab(threadId: string): ThreadTab {
  return {
    id: `tab:${crypto.randomUUID()}`,
    layout: threadLeaf(threadId),
    focusedThreadId: threadId,
  }
}

function withoutThread(tab: ThreadTab, threadId: string): ThreadTab[] {
  const layout = removePane(tab.layout, threadId)
  if (!layout) return []
  return [
    {
      ...tab,
      layout,
      focusedThreadId:
        tab.focusedThreadId === threadId ? visibleThreads(layout)[0]! : tab.focusedThreadId,
    },
  ]
}

/** Keep the active pane aliases in sync for thread consumers outside the tab strip. */
function tabState(threadTabs: readonly ThreadTab[], selectedId: string | null) {
  const selected = threadTabs.find((tab) => tab.id === selectedId) ?? threadTabs[0]
  return {
    threadTabs,
    selectedThreadTabId: selected?.id ?? null,
    layout: selected?.layout ?? null,
    selectedThreadId: selected?.focusedThreadId ?? null,
    openThreadIds: threadTabs.flatMap((tab) => visibleThreads(tab.layout)),
  }
}

export const useTabStore = create<TabStore>((set, get) => ({
  threadTabs: [],
  selectedThreadTabId: null,
  layout: null,
  dropThread: (target, threadId, zone) =>
    set((state) => {
      const active = state.threadTabs.find((tab) => tab.id === state.selectedThreadTabId)
      if (!active) return state
      const layout =
        zone === "center"
          ? movePane(active.layout, target, threadId)
          : splitPane(active.layout, target, threadId, zone, `split:${crypto.randomUUID()}`)
      if (!layout || layout === active.layout) return state
      const tabs = state.threadTabs.flatMap((tab) =>
        tab.id === active.id
          ? [{ ...tab, layout, focusedThreadId: threadId }]
          : withoutThread(tab, threadId),
      )
      // A center drop replaces a pane, but keeps the displaced conversation open on its own.
      for (const id of visibleThreads(active.layout)) {
        if (!visibleThreads(layout).includes(id)) tabs.push(newThreadTab(id))
      }
      return { ...tabState(tabs, active.id), selectedFileId: null }
    }),
  openBeside: (threadId, edge) => {
    const state = get()
    if (state.selectedFileId !== null || state.selectedThreadId === null) state.openThread(threadId)
    else state.dropThread(state.selectedThreadId, threadId, edge)
  },
  resizeSplit: (id, ratio) =>
    set((state) =>
      tabState(
        state.threadTabs.map((tab) => ({
          ...tab,
          layout: resizeSplit(tab.layout, id, ratio)!,
        })),
        state.selectedThreadTabId,
      ),
    ),
  maximizeThread: (threadId) =>
    set((state) => {
      const solo = newThreadTab(threadId)
      const tabs = state.threadTabs.flatMap((tab) => withoutThread(tab, threadId))
      return { ...tabState([...tabs, solo], solo.id), selectedFileId: null }
    }),
  files: [],
  selectedFileId: null,
  openFile: ({ workspaceId, threadId }, path, line, endLine) =>
    set((state) => {
      const normalized = path.replaceAll("\\", "/")
      const id = `file:${JSON.stringify([workspaceId, threadId ?? null, normalized])}`
      return {
        files: state.files.some((file) => file.id === id)
          ? state.files.map((file) => (file.id === id ? { ...file, line, endLine } : file))
          : [...state.files, { id, workspaceId, threadId, path: normalized, line, endLine }],
        selectedFileId: id,
      }
    }),
  openDiff: ({ workspaceId, threadId }, path, diffSide) =>
    set((state) => {
      const normalized = path.replaceAll("\\", "/")
      const id = `diff:${JSON.stringify([workspaceId, threadId ?? null, normalized, diffSide])}`
      return {
        files: state.files.some((file) => file.id === id)
          ? state.files
          : [...state.files, { id, workspaceId, threadId, path: normalized, diffSide }],
        selectedFileId: id,
      }
    }),
  selectTab: (id) => {
    if (get().files.some((file) => file.id === id)) set({ selectedFileId: id })
    else {
      const state = get()
      const tab = state.threadTabs.find((candidate) => candidate.id === id)
      if (tab) set({ ...tabState(state.threadTabs, id), selectedFileId: null })
      else state.selectThread(id)
    }
  },
  closeTab: (id) => {
    const state = get()
    if (!state.files.some((file) => file.id === id)) {
      const index = state.threadTabs.findIndex((tab) => tab.id === id)
      if (index < 0) state.closeThread(id)
      else {
        const tabs = state.threadTabs.filter((tab) => tab.id !== id)
        const selected =
          state.selectedThreadTabId === id
            ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
            : state.selectedThreadTabId
        set(tabState(tabs, selected))
      }
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
    set((state) => {
      const existing = state.threadTabs.find((tab) => visibleThreads(tab.layout).includes(threadId))
      const tab = existing ?? newThreadTab(threadId)
      const tabs = existing
        ? state.threadTabs.map((candidate) =>
            candidate.id === tab.id ? { ...candidate, focusedThreadId: threadId } : candidate,
          )
        : [...state.threadTabs, tab]
      return { ...tabState(tabs, tab.id), selectedFileId: null }
    }),
  closeThread: (threadId) =>
    set((state) => {
      const index = state.threadTabs.findIndex((tab) =>
        visibleThreads(tab.layout).includes(threadId),
      )
      const tabs = state.threadTabs.flatMap((tab) => withoutThread(tab, threadId))
      const selected = tabs.some((tab) => tab.id === state.selectedThreadTabId)
        ? state.selectedThreadTabId
        : (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
      return tabState(tabs, selected)
    }),
  selectThread: (threadId) => get().openThread(threadId),
  cycle: (direction) => {
    const state = get()
    const ids = [...state.threadTabs.map((tab) => tab.id), ...state.files.map((file) => file.id)]
    if (ids.length < 2) return
    const index = Math.max(0, ids.indexOf(state.selectedFileId ?? state.selectedThreadTabId ?? ""))
    state.selectTab(ids[(index + direction + ids.length) % ids.length]!)
  },
  removeThread: (threadId) => get().closeThread(threadId),
}))
