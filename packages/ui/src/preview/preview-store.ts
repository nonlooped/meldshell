import { create } from "zustand"

/*
 * Each thread's browser preview: whether its panel is shown, the page it last showed, and the
 * local servers its terminals announced. Pages reload when a thread's panel is shown again.
 */

export interface ThreadPreview {
  readonly open: boolean
  /** Null until a page is chosen. */
  readonly url: string | null
  /** Percentage of the thread pane's width taken by the preview. */
  readonly size: number
}

interface PreviewStore {
  readonly threads: Readonly<Record<string, ThreadPreview>>
  /** Local server addresses each thread's terminals printed, newest first. */
  readonly servers: Readonly<Record<string, readonly string[]>>
  readonly toggle: (threadId: string) => void
  /** Records the page a thread's preview shows, opening the panel if it is hidden. */
  readonly show: (threadId: string, url: string) => void
  readonly resize: (threadId: string, size: number) => void
  readonly noteServers: (threadId: string, urls: readonly string[]) => void
  readonly forget: (threadId: string) => void
}

const closed: ThreadPreview = { open: false, url: null, size: 45 }
const MAX_SERVERS = 6

const without = <Value>(record: Readonly<Record<string, Value>>, key: string) => {
  const { [key]: _removed, ...rest } = record
  return rest
}

export const previewSupported =
  window.meldshell.platform === "web"
    ? window.meldshell.remotePreview !== undefined
    : window.meldshell.desktop !== undefined

export const usePreviewStore = create<PreviewStore>((set) => ({
  threads: {},
  servers: {},
  toggle: (threadId) =>
    set((state) => {
      const current = state.threads[threadId] ?? closed
      return { threads: { ...state.threads, [threadId]: { ...current, open: !current.open } } }
    }),
  show: (threadId, url) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: { ...(state.threads[threadId] ?? closed), open: true, url },
      },
    })),
  resize: (threadId, size) =>
    set((state) => {
      const current = state.threads[threadId]
      return current === undefined
        ? state
        : { threads: { ...state.threads, [threadId]: { ...current, size } } }
    }),
  noteServers: (threadId, urls) =>
    set((state) => {
      const known = state.servers[threadId] ?? []
      if (urls.every((url, index) => known[index] === url)) return state
      const newest = [...urls].reverse()
      const next = [...newest, ...known.filter((url) => !newest.includes(url))].slice(
        0,
        MAX_SERVERS,
      )
      return { servers: { ...state.servers, [threadId]: next } }
    }),
  forget: (threadId) =>
    set((state) => ({
      threads: without(state.threads, threadId),
      servers: without(state.servers, threadId),
    })),
}))
