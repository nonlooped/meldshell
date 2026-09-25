import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { Thread, TranscriptSearchResult, Workspace } from "@meldshell/contracts"
import { MessageSquare, TextSearch } from "lucide-react"
import { useState } from "react"
import { queryKeys } from "../data/cache"
import { Palette, PaletteRow, PaletteSearch, useDebouncedQuery } from "./Palette"

const THREAD_LIMIT = 20

type ThreadItem =
  | { readonly kind: "thread"; readonly thread: Thread }
  | { readonly kind: "match"; readonly result: TranscriptSearchResult }

const itemKey = (item: ThreadItem): string =>
  item.kind === "thread"
    ? `thread:${item.thread.id}`
    : `match:${item.result.thread.id}:${item.result.turnId}:${item.result.eventId}`

const itemLabel = (item: ThreadItem): string =>
  item.kind === "thread" ? item.thread.title : item.result.thread.title

/** One line of a transcript snippet, with the host's `[match]` markers highlighted. */
function Snippet({ snippet }: { readonly snippet: string }): React.JSX.Element {
  return (
    <>
      {snippet
        .replace(/\s+/g, " ")
        .split(/(\[match\].*?\[\/match\])/gs)
        .map((part, index) =>
          part.startsWith("[match]") ? (
            <mark key={index} className="bg-transparent text-[var(--text-primary)] font-semibold">
              {part.slice(7, -8)}
            </mark>
          ) : (
            <span key={index} className="text-[var(--text-secondary)]">
              {part}
            </span>
          ),
        )}
    </>
  )
}

/** Ctrl+K: open a thread by title, or jump to a message anywhere in its transcript. */
export function ThreadPalette({
  open,
  onOpenChange,
  threads,
  workspaces,
  onOpenThread,
  onOpenMatch,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly threads: ReadonlyArray<Thread>
  readonly workspaces: ReadonlyArray<Workspace>
  readonly onOpenThread: (threadId: string) => void
  readonly onOpenMatch: (result: TranscriptSearchResult) => void
}): React.JSX.Element {
  return (
    <Palette open={open} onOpenChange={onOpenChange} title="Go to thread">
      <ThreadSearch
        threads={threads}
        workspaces={workspaces}
        onPick={(item) => {
          if (item.kind === "thread") onOpenThread(item.thread.id)
          else onOpenMatch(item.result)
          onOpenChange(false)
        }}
      />
    </Palette>
  )
}

function ThreadSearch({
  threads,
  workspaces,
  onPick,
}: {
  readonly threads: ReadonlyArray<Thread>
  readonly workspaces: ReadonlyArray<Workspace>
  readonly onPick: (item: ThreadItem) => void
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const debounced = useDebouncedQuery(query)
  const lowered = debounced.toLowerCase()
  const matches = useQuery({
    queryKey: [...queryKeys.search, debounced],
    queryFn: () => window.meldshell.searchTranscripts({ query: debounced }),
    enabled: debounced !== "",
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
  const items: ThreadItem[] = [
    ...threads
      .filter((thread) => thread.title.toLowerCase().includes(lowered))
      .slice(0, THREAD_LIMIT)
      .map((thread): ThreadItem => ({ kind: "thread", thread })),
    ...(debounced === "" || matches.isError ? [] : (matches.data?.results ?? [])).map(
      (result): ThreadItem => ({ kind: "match", result }),
    ),
  ]
  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]))
  return (
    <PaletteSearch<ThreadItem>
      items={items}
      query={query}
      onQueryChange={setQuery}
      placeholder="Go to thread, or search messages"
      itemKey={itemKey}
      itemLabel={itemLabel}
      onPick={onPick}
      renderItem={(item) =>
        item.kind === "thread" ? (
          <PaletteRow
            icon={<MessageSquare size={14} aria-hidden="true" />}
            label={item.thread.title}
            detail={workspaceNames.get(item.thread.workspaceId)}
          />
        ) : (
          <PaletteRow
            icon={<TextSearch size={14} aria-hidden="true" />}
            label={<Snippet snippet={item.result.snippet} />}
            detail={item.result.thread.title}
          />
        )
      }
    />
  )
}
