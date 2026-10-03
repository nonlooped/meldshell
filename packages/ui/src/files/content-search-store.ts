import { create } from "zustand"

export type FilesSidebarTab = "files" | "changes" | "search"

interface ContentSearchStore {
  /** The files sidebar's tab; it outlives the sidebar, which remounts for each checkout. */
  readonly tab: FilesSidebarTab
  readonly setTab: (tab: FilesSidebarTab) => void
  /** The search carries across checkouts, so switching threads re-runs it in the new folder. */
  readonly query: string
  readonly caseSensitive: boolean
  readonly regex: boolean
  readonly setQuery: (query: string) => void
  readonly setCaseSensitive: (caseSensitive: boolean) => void
  readonly setRegex: (regex: boolean) => void
  /** Bumped to focus the search field, whether or not the tab was already showing. */
  readonly focusRequest: number
  /** Shows the search tab and focuses its field, starting from `query` when one is given. */
  readonly openSearch: (query?: string) => void
}

export const useContentSearch = create<ContentSearchStore>((set) => ({
  tab: "files",
  setTab: (tab) => set({ tab }),
  query: "",
  caseSensitive: false,
  regex: false,
  setQuery: (query) => set({ query }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),
  setRegex: (regex) => set({ regex }),
  focusRequest: 0,
  openSearch: (query) =>
    set((state) => ({
      tab: "search",
      query: query ?? state.query,
      focusRequest: state.focusRequest + 1,
    })),
}))

/** A single-line selection to search for, as editors do when search opens over selected text. */
export function selectedSearchText(): string | undefined {
  const text = window.getSelection()?.toString().trim() ?? ""
  return text === "" || text.includes("\n") || text.length > 200 ? undefined : text
}

/** Why the query cannot be searched as a regular expression, or null when it can. */
export function regexError(query: string): string | null {
  try {
    new RegExp(query)
    return null
  } catch (cause) {
    return cause instanceof Error
      ? cause.message.replace(/^Invalid regular expression: /, "")
      : String(cause)
  }
}
