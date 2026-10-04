import { Collapsible } from "@base-ui-components/react/collapsible"
import { Toggle } from "@base-ui-components/react/toggle"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type {
  ContentSearchFile,
  ContentSearchLine,
  ContentSearchResult,
  WorkspaceScope,
} from "@meldshell/contracts/ipc"
import { CaseSensitive, ChevronRight, Regex, RefreshCw, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTabStore } from "../app/tab-store"
import { scopeKey } from "../data/workspace-scope"
import { ContextMenu, IconButton, MenuAction, PanelNote, QueryError } from "../ui/controls"
import { CopyAbsolutePathAction, RevealFileAction } from "../ui/FileContextActions"
import { FileIcon } from "../ui/FileIcon"
import { ActivitySpinner, CollapsiblePanel } from "../ui/motion"
import { disclosureChevronClasses } from "../ui/styles"
import { regexError, useContentSearch } from "./content-search-store"

/** A burst of typing runs one search; clearing the field applies at once. */
const DEBOUNCE_MS = 200

/** Unlike the palettes this keeps surrounding spaces, which can be what a search is for. */
function useDebounced(query: string): string {
  const [debounced, setDebounced] = useState(query)
  useEffect(() => {
    if (query === "") {
      setDebounced(query)
      return
    }
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])
  return debounced
}

const plural = (count: number, noun: string): string =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`

/** Up and Down move between result rows; Up from the first row returns to the field. */
function moveBetweenRows(event: React.KeyboardEvent<HTMLElement>, input: HTMLInputElement | null) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-search-row]"),
  ).filter((row) => row.closest("[data-ending-style], [hidden]") === null)
  const index = rows.indexOf(document.activeElement as HTMLElement)
  const next = event.key === "ArrowDown" ? rows[index + 1] : index <= 0 ? input : rows[index - 1]
  if (next) {
    event.preventDefault()
    next.focus()
  }
}

/** The search for the current field, run once typing pauses and the expression is valid. */
function useSearchResults(scope: WorkspaceScope | undefined) {
  const query = useContentSearch((state) => state.query)
  const caseSensitive = useContentSearch((state) => state.caseSensitive)
  const regex = useContentSearch((state) => state.regex)
  const debounced = useDebounced(query)
  const invalid = regex && debounced !== "" ? regexError(debounced) : null
  const search = useQuery({
    queryKey: [
      "workspace-contents",
      ...(scope ? scopeKey(scope) : []),
      debounced,
      caseSensitive,
      regex,
    ],
    queryFn: () =>
      window.meldshell.searchWorkspaceContents({
        ...scope!,
        query: debounced,
        caseSensitive,
        regex,
      }),
    enabled: scope !== undefined && debounced !== "" && invalid === null,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    retry: false,
  })
  const idle = debounced === "" || invalid !== null
  return { search, invalid, idle, result: idle ? undefined : search.data }
}

/** The workspace-wide text search in the files sidebar, opened with Ctrl+Shift+F. */
export function ContentSearch({
  scope,
}: {
  readonly scope: WorkspaceScope | undefined
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const { search, invalid, idle, result } = useSearchResults(scope)
  let body: React.ReactNode = null
  if (invalid !== null) body = <PanelNote role="alert">{invalid}</PanelNote>
  else if (idle) body = null
  else if (search.isError) body = <QueryError query={search} />
  else if (result === undefined)
    body = search.isFetching && <PanelNote role="status">Searching…</PanelNote>
  else
    body = (
      <>
        <SearchSummary
          result={result}
          fetching={search.isFetching}
          onRefresh={() => void search.refetch()}
        />
        <div
          ref={resultsRef}
          className={`motion-colors flex-1 min-h-0 overflow-y-auto pb-[8px] [scrollbar-gutter:stable] ${search.isPlaceholderData ? "opacity-[0.6]" : ""}`}
          onKeyDown={(event) => moveBetweenRows(event, inputRef.current)}
        >
          {result.files.map((file) => (
            <FileResults key={file.path} scope={scope!} file={file} />
          ))}
        </div>
      </>
    )
  return (
    <div className="flex flex-col h-full min-h-0">
      <SearchField
        inputRef={inputRef}
        disabled={scope === undefined}
        invalid={invalid !== null}
        onArrowDown={() =>
          resultsRef.current?.querySelector<HTMLElement>("[data-search-row]")?.focus()
        }
      />
      {body}
    </div>
  )
}

function SearchField({
  inputRef,
  disabled,
  invalid,
  onArrowDown,
}: {
  readonly inputRef: React.RefObject<HTMLInputElement | null>
  readonly disabled: boolean
  readonly invalid: boolean
  readonly onArrowDown: () => void
}): React.JSX.Element {
  const query = useContentSearch((state) => state.query)
  const caseSensitive = useContentSearch((state) => state.caseSensitive)
  const regex = useContentSearch((state) => state.regex)
  const focusRequest = useContentSearch((state) => state.focusRequest)
  const { setQuery, setCaseSensitive, setRegex } = useContentSearch.getState()
  // biome-ignore lint/correctness/useExhaustiveDependencies: Each request focuses the field again.
  useEffect(() => {
    // A sidebar that is still sliding open is inert until it settles, so keep trying briefly.
    let frame = 0
    let tries = 0
    const focus = () => {
      const input = inputRef.current
      if (input === null) return
      input.focus()
      input.select()
      if (document.activeElement !== input && ++tries < 60) frame = requestAnimationFrame(focus)
    }
    focus()
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])
  return (
    <div className="shrink-0 [padding:8px_8px_6px]">
      <div
        data-invalid={invalid || undefined}
        className="motion-colors flex items-center gap-[2px] h-[30px] pl-[8px] pr-[2px] border-[1px] border-[color:var(--line)] rounded-[var(--radius)] bg-[var(--surface-input)] [&:focus-within]:[border-color:var(--line-strong)] [&:focus-within]:[box-shadow:0_0_0_3px_var(--focus-glow)] [&[data-invalid]]:[border-color:var(--color-deleted)]"
      >
        <Search
          size={13}
          aria-hidden="true"
          className="flex-none mr-[4px] text-[var(--text-tertiary)]"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              onArrowDown()
            } else if (event.key === "Escape" && query !== "") {
              event.preventDefault()
              setQuery("")
            }
          }}
          placeholder={disabled ? "Open a workspace to search" : "Search in files"}
          aria-label="Search in files"
          aria-invalid={invalid}
          disabled={disabled}
          spellCheck={false}
          className="min-w-0 flex-1 h-full p-0 border-0 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <Toggle
          aria-label="Match case"
          title="Match case"
          pressed={caseSensitive}
          onPressedChange={setCaseSensitive}
          className={toggleClasses}
        >
          <CaseSensitive size={15} strokeWidth={1.75} aria-hidden="true" />
        </Toggle>
        <Toggle
          aria-label="Use regular expression"
          title="Use regular expression"
          pressed={regex}
          onPressedChange={setRegex}
          className={toggleClasses}
        >
          <Regex size={14} strokeWidth={1.75} aria-hidden="true" />
        </Toggle>
      </div>
    </div>
  )
}

function SearchSummary({
  result,
  fetching,
  onRefresh,
}: {
  readonly result: ContentSearchResult
  readonly fetching: boolean
  readonly onRefresh: () => void
}): React.JSX.Element {
  const files = result.files.length
  return (
    <div
      className="flex items-center shrink-0 min-h-[26px] [padding:0_6px_0_12px] text-[11px] text-[var(--text-tertiary)]"
      role="status"
    >
      <span className="flex-1 min-w-0 truncate">
        {files === 0
          ? "No results"
          : `${plural(result.lineCount, "result")}${result.truncated ? "+" : ""} in ${plural(files, "file")}`}
      </span>
      <IconButton label="Search again" disabled={fetching} onClick={onRefresh}>
        {fetching ? <ActivitySpinner /> : <RefreshCw size={12} />}
      </IconButton>
    </div>
  )
}

function FileResults({
  scope,
  file,
}: {
  readonly scope: WorkspaceScope
  readonly file: ContentSearchFile
}): React.JSX.Element {
  const openFile = useTabStore((state) => state.openFile)
  const [open, setOpen] = useState(true)
  const slash = file.path.lastIndexOf("/")
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <ContextMenu
        trigger={
          <Collapsible.Trigger
            data-search-row=""
            title={file.path}
            className="flex items-center gap-[6px] w-full h-[24px] [padding:0_10px_0_6px] border-0 bg-transparent text-left cursor-default [&:hover]:bg-[var(--surface-hover)] [&:focus-visible]:bg-[var(--surface-active)] outline-none"
          >
            <ChevronRight
              size={12}
              aria-hidden="true"
              className={`${disclosureChevronClasses} text-[var(--text-tertiary)]`}
            />
            <FileIcon path={file.path} size={15} />
            <span className="shrink-0 max-w-[60%] truncate text-[var(--text-primary)]">
              {file.path.slice(slash + 1)}
            </span>
            <span className="flex-1 min-w-0 truncate text-[11px] text-[var(--text-tertiary)]">
              {file.path.slice(0, Math.max(0, slash))}
            </span>
            <span className="shrink-0 min-w-[18px] [padding:0_5px] rounded-full bg-[var(--surface-selected)] text-center text-[10px] leading-[16px] text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]">
              {file.lines.length}
            </span>
          </Collapsible.Trigger>
        }
      >
        <MenuAction onClick={() => openFile(scope, file.path)}>Open file</MenuAction>
        <MenuAction onClick={() => setOpen(!open)}>
          {open ? "Collapse results" : "Expand results"}
        </MenuAction>
        <MenuAction onClick={() => void navigator.clipboard.writeText(file.path)}>
          Copy relative path
        </MenuAction>
        <CopyAbsolutePathAction scope={scope} path={file.path} />
        <RevealFileAction scope={scope} path={file.path} />
      </ContextMenu>
      <CollapsiblePanel>
        <ul className="[list-style:none] m-0 p-0" aria-label={`Matches in ${file.path}`}>
          {file.lines.map((line) => (
            <li key={line.line}>
              <button
                type="button"
                data-search-row=""
                title={`${file.path}:${line.line}`}
                onClick={() => openFile(scope, file.path, line.line)}
                className="flex items-baseline gap-[8px] w-full min-h-[22px] [padding:3px_10px_3px_38px] border-0 bg-transparent text-left cursor-default [&:hover]:bg-[var(--surface-hover)] [&:focus-visible]:bg-[var(--surface-active)] outline-none"
              >
                <MatchText line={line} />
                <span className="shrink-0 ml-auto [font:11px_var(--font-mono)] text-[var(--text-tertiary)] [font-variant-numeric:tabular-nums]">
                  {line.line}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

/** The matching line with each match highlighted. */
function MatchText({ line }: { readonly line: ContentSearchLine }): React.JSX.Element {
  const parts: React.ReactNode[] = []
  let position = 0
  for (const [start, end] of line.ranges) {
    if (start < position) continue
    if (start > position) parts.push(line.text.slice(position, start))
    parts.push(
      <mark
        key={start}
        className="rounded-[2px] [padding:0_1px] bg-[color-mix(in_srgb,_var(--accent)_28%,_transparent)] text-[var(--text-primary)]"
      >
        {line.text.slice(start, end)}
      </mark>,
    )
    position = end
  }
  parts.push(line.text.slice(position))
  return (
    <span className="min-w-0 truncate whitespace-pre [font:12px/1.5_var(--font-mono)] text-[var(--text-secondary)]">
      {line.clipped && <span className="text-[var(--text-tertiary)]">…</span>}
      {parts}
    </span>
  )
}

const toggleClasses = [
  "motion-colors grid w-[24px] h-[24px] shrink-0 place-items-center border-[1px] border-[color:transparent]",
  "rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]",
  "[&[data-pressed]]:[border-color:color-mix(in_srgb,_var(--accent)_45%,_transparent)]",
  "[&[data-pressed]]:bg-[color-mix(in_srgb,_var(--accent)_16%,_transparent)] [&[data-pressed]]:text-[var(--text-primary)]",
].join(" ")
