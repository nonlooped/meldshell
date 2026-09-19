import { textInputClasses } from "../ui/styles"
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
        <div className="search-controls grid grid-cols-[1fr_170px] gap-[10px] m-[20px]">
          <Combobox.Input
            data-motion="background-color border-color box-shadow"
            data-motion-duration="0.2"
            className={textInputClasses}
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
        <div className={searchResultsClasses} aria-busy={waiting}>
          {query.trim() === "" ? (
            <p className="settings-empty [padding:28px_0] text-[var(--text-tertiary)] text-[12.5px] text-center">
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
              <p
                className="m-0 [padding:0_10px_14px] text-[12px] text-[var(--text-secondary)]"
                role="status"
              >
                {search.data?.results.length === 0
                  ? "No matches. Try different words or another workspace."
                  : `Results ${offset + 1}–${offset + (search.data?.results.length ?? 0)}`}
              </p>
              <Combobox.List aria-label="Transcript matches">
                {(result: TranscriptSearchResult) => (
                  <Combobox.Item
                    data-motion="background-color border-color color box-shadow"
                    value={result}
                    className={searchResultClasses}
                    key={`${result.thread.id}:${result.turnId}:${result.eventId}`}
                  >
                    <span className="text-[10.5px] text-[var(--text-tertiary)]">
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
                    <span className="[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden text-[12px] leading-[1.6] text-[var(--text-secondary)] whitespace-normal [overflow-wrap:anywhere] [&_mark]:text-[var(--text-primary)] [&_mark]:bg-[var(--surface-active)] [&_mark]:font-semibold [&_mark]:rounded-[2px]">
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

const searchResultsClasses = [
  "h-[min(420px,_50vh)] overflow-y-auto [padding:0_12px] [&:has(>_.settings-empty)]:grid",
  "[&:has(>_.settings-empty)]:place-items-center [&_>_.settings-empty]:max-w-[320px]",
  "[&_>_.settings-empty]:p-[24px] [&_>_.settings-empty]:leading-[1.7] [&_>_p]:m-0",
  "[&_>_p]:[padding:0_10px_14px] [&_>_p]:text-[12px] [&_>_p]:text-[var(--text-secondary)]",
  "overflow-y-auto [scrollbar-gutter:stable]",
].join(" ")

const searchResultClasses = [
  "grid w-full gap-[5px] p-[12px] border-0 border-b-[1px] border-b-[color:var(--line-subtle)] bg-transparent",
  "text-left rounded-[var(--radius)] cursor-pointer [&:hover]:bg-[var(--surface-hover)]",
  "[&:focus-visible]:bg-[var(--surface-hover)] [&_strong]:text-[13px] [&_strong]:font-medium",
  "[&[data-highlighted]]:[outline:1px_solid_currentColor] [&[data-highlighted]]:[outline-offset:-1px]",
].join(" ")
