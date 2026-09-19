import { queryKeys } from "../data/cache"
import { Combobox } from "@base-ui-components/react/combobox"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { TranscriptSearchResult, Workspace } from "@meldshell/contracts"
import { AppDialog, Button, SelectField } from "../ui/controls"

export function SearchDialog({
  workspaces,
  onClose,
  onOpen,
}: {
  readonly workspaces: ReadonlyArray<Workspace>
  readonly onClose: () => void
  readonly onOpen: (result: TranscriptSearchResult) => void
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [workspaceId, setWorkspaceId] = useState("")
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => clearTimeout(timer)
  }, [query])
  const search = useQuery({
    queryKey: [...queryKeys.search, debouncedQuery, workspaceId, offset],
    queryFn: () =>
      window.meldshell.searchTranscripts({
        query: debouncedQuery,
        workspaceId: workspaceId || undefined,
        offset,
      }),
    enabled: debouncedQuery !== "",
    staleTime: 0,
  })
  const waiting = query.trim() !== debouncedQuery || search.isFetching
  const results =
    waiting || search.isError || query.trim() === "" ? [] : (search.data?.results ?? [])
  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Search transcripts"
      actions={
        <>
          {offset > 0 && (
            <Button onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</Button>
          )}
          {search.data?.hasMore && (
            <Button disabled={waiting} onClick={() => setOffset(offset + 50)}>
              Next results
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <Combobox.Root<TranscriptSearchResult>
        inline
        defaultOpen
        autoHighlight
        items={results}
        filter={null}
        inputValue={query}
        onInputValueChange={(value) => {
          setQuery(value)
          setOffset(0)
        }}
        itemToStringLabel={(result) => result.thread.title}
        onValueChange={(result) => {
          if (result !== null) onOpen(result)
        }}
      >
        <div className="search-controls">
          <Combobox.Input
            className="text-input"
            autoFocus
            aria-label="Search transcripts"
            placeholder="Search messages, replies, and tool output…"
            maxLength={500}
          />
          <SelectField
            label="Search workspace"
            value={workspaceId}
            options={[
              { value: "", label: "All workspaces" },
              ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name })),
            ]}
            onValueChange={(value) => {
              setWorkspaceId(value)
              setOffset(0)
            }}
          />
        </div>
        <div className="search-results scrollable" aria-busy={waiting}>
          {query.trim() === "" ? (
            <p className="settings-empty">
              Search the full history of active, pinned, and archived threads.
            </p>
          ) : waiting ? (
            <p role="status">Searching…</p>
          ) : search.isError ? (
            <div role="alert">
              <p>Could not search transcripts.</p>
              <Button onClick={() => void search.refetch()}>Try again</Button>
            </div>
          ) : (
            <>
              <p className="search-count" role="status">
                {search.data?.results.length === 0
                  ? "No matches. Try different words or another workspace."
                  : `Results ${offset + 1}–${offset + (search.data?.results.length ?? 0)}`}
              </p>
              <Combobox.List aria-label="Transcript matches">
                {(result: TranscriptSearchResult) => (
                  <Combobox.Item
                    value={result}
                    className="search-result"
                    key={`${result.thread.id}:${result.turnId}:${result.eventId}`}
                  >
                    <span className="search-result-context">
                      {
                        workspaces.find((workspace) => workspace.id === result.thread.workspaceId)
                          ?.name
                      }{" "}
                      ·{" "}
                      {result.thread.pinned
                        ? "Pinned"
                        : result.thread.status === "settled"
                          ? "Archived"
                          : "Active"}
                    </span>
                    <strong>{result.thread.title}</strong>
                    <span className="search-snippet">
                      {result.snippet
                        .replace(/\s+/g, " ")
                        .split(/(\[match\].*?\[\/match\])/gs)
                        .map((part, index) =>
                          part.startsWith("[match]") ? (
                            <mark key={index}>{part.slice(7, -8)}</mark>
                          ) : (
                            part
                          ),
                        )}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </>
          )}
        </div>
      </Combobox.Root>
    </AppDialog>
  )
}
