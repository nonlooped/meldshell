import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { Folder, Sparkles, SquareSlash } from "lucide-react"
import type { ComposerCommand } from "@meldshell/contracts"
import type { WorkspacePathMatch } from "@meldshell/contracts/ipc"
import { FileIcon } from "../ui/FileIcon"
import { useMotionPreference } from "../ui/motion"
import {
  applyCompletion,
  completionTrigger,
  filterCommands,
  pathMention,
  tokenRanges,
  type ComposerToken,
  type CompletionTrigger,
  type TokenRange,
} from "./composer-completion"

type CompletionItem =
  | { readonly kind: "path"; readonly match: WorkspacePathMatch }
  | { readonly kind: "command" | "skill"; readonly command: ComposerCommand }

const itemKey = (item: CompletionItem): string =>
  item.kind === "path" ? `path:${item.match.path}` : `${item.kind}:${item.command.name}`

function completionItems(
  trigger: CompletionTrigger | null,
  paths: readonly WorkspacePathMatch[] | undefined,
  commands: readonly ComposerCommand[] | undefined,
): CompletionItem[] {
  if (trigger === null) return []
  if (trigger.kind === "path") return (paths ?? []).map((match) => ({ kind: "path", match }))
  const kind = trigger.kind
  return filterCommands(
    (commands ?? []).filter((command) => command.kind === kind),
    trigger.query,
  ).map((command) => ({ kind, command }))
}

const STATUS = {
  path: { loading: "Searching files…", empty: "No matching files or folders" },
  command: { loading: "Loading commands…", empty: "No matching commands" },
  skill: { loading: "Loading skills…", empty: "No matching skills" },
} as const

function completionStatus(
  trigger: CompletionTrigger | null,
  source: { readonly isError: boolean; readonly error: unknown; readonly isPending: boolean },
): string {
  const copy = STATUS[trigger?.kind ?? "path"]
  if (source.isError)
    return source.error instanceof Error ? source.error.message : "Could not load suggestions."
  return source.isPending ? copy.loading : copy.empty
}

/** The text a completion inserts, and the pill that it leaves behind. */
function completionToken(item: CompletionItem): { token: ComposerToken; closes: boolean } {
  if (item.kind === "path")
    return {
      token: { kind: "path", text: pathMention(item.match.path) },
      // A folder stays open so its children can be completed next.
      closes: !item.match.directory,
    }
  if (item.kind === "skill")
    return {
      token: {
        kind: "skill",
        text: `$${item.command.name}`,
        skill: item.command.path ?? item.command.name,
      },
      closes: true,
    }
  return { token: { kind: "command", text: `/${item.command.name}` }, closes: true }
}

interface CompletionOptions {
  readonly draft: string
  readonly tokens: readonly ComposerToken[]
  readonly workspaceId: string | undefined
  readonly harness: string | undefined
  readonly textareaRef: React.RefObject<HTMLTextAreaElement | null>
  readonly onDraftChange: (draft: string) => void
  readonly onTokensChange: (tokens: readonly ComposerToken[]) => void
}

/**
 * `@` completes workspace files and folders, `$` skills, and a leading `/` harness commands.
 * Accepted completions render as pills and are deleted as a unit.
 */
export function useComposerCompletion({
  draft,
  tokens,
  workspaceId,
  harness,
  textareaRef,
  onDraftChange,
  onTokensChange,
}: CompletionOptions) {
  const listId = useId()
  const [caret, setCaret] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const pendingCaret = useRef<number | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const ranges = tokenRanges(draft, tokens)
  const found = caret === null || caret > draft.length ? null : completionTrigger(draft, caret)
  // A finished pill does not reopen the menu; a folder pill keeps offering its children.
  const settled =
    found !== null &&
    ranges.some(
      (range) =>
        range.start === found.start && range.end === found.end && !range.token.text.endsWith("/"),
    )
  const trigger = found !== null && found.start !== dismissed && !settled ? found : null

  const paths = useQuery({
    queryKey: ["workspace-paths", workspaceId, trigger?.query],
    queryFn: () =>
      window.meldshell.searchWorkspacePaths({
        workspaceId: workspaceId!,
        query: trigger!.query,
        limit: 50,
      }),
    enabled: trigger?.kind === "path" && workspaceId !== undefined,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })
  const commands = useQuery({
    queryKey: ["composer-commands", workspaceId, harness],
    queryFn: () =>
      window.meldshell.listComposerCommands({ workspaceId: workspaceId!, harness: harness! }),
    enabled:
      (trigger?.kind === "command" || trigger?.kind === "skill") &&
      workspaceId !== undefined &&
      harness !== undefined,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const items = completionItems(trigger, paths.data, commands.data)
  const open = trigger !== null
  const selected = Math.min(active, Math.max(items.length - 1, 0))

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new query starts at the first match.
  useEffect(() => setActive(0), [trigger?.kind, trigger?.query])
  // Escape dismisses one token; moving to another token or clearing it re-enables the menu.
  const foundStart = found?.start ?? null
  useEffect(() => {
    if (foundStart !== dismissed) setDismissed(null)
  }, [foundStart, dismissed])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Restore the caret after a completion edits the draft.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (textarea === null) return
    if (pendingCaret.current !== null) {
      textarea.setSelectionRange(pendingCaret.current, pendingCaret.current)
      setCaret(pendingCaret.current)
      pendingCaret.current = null
    }
    if (backdropRef.current !== null) backdropRef.current.scrollTop = textarea.scrollTop
  }, [draft])

  const edit = (text: string, nextCaret: number): void => {
    pendingCaret.current = nextCaret
    onDraftChange(text)
  }

  const accept = (item: CompletionItem, current: CompletionTrigger): void => {
    const { token, closes } = completionToken(item)
    const next = applyCompletion(draft, current, closes ? `${token.text} ` : token.text)
    if (!tokens.some((entry) => entry.kind === token.kind && entry.text === token.text))
      onTokensChange([...tokens, token])
    edit(next.text, next.caret)
  }

  const syncCaret = (event: React.SyntheticEvent<HTMLTextAreaElement>): void => {
    const { selectionStart, selectionEnd } = event.currentTarget
    setCaret(selectionStart === selectionEnd ? selectionStart : null)
  }

  /** Backspace and Delete remove a whole pill when the caret touches its edge. */
  const deletePill = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const { selectionStart, selectionEnd } = event.currentTarget
    if (selectionStart !== selectionEnd || event.altKey || event.ctrlKey || event.metaKey)
      return false
    const range =
      event.key === "Backspace"
        ? ranges.find((entry) => entry.end === selectionStart)
        : event.key === "Delete"
          ? ranges.find((entry) => entry.start === selectionStart)
          : undefined
    if (range === undefined) return false
    edit(draft.slice(0, range.start) + draft.slice(range.end), range.start)
    return true
  }

  /** Returns true when completion consumed the key. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (event.nativeEvent.isComposing) return false
    if (deletePill(event)) return true
    if (trigger === null) return false
    if (event.key === "Escape") {
      setDismissed(trigger.start)
      return true
    }
    if (items.length === 0) return false
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((selected + step + items.length) % items.length)
      return true
    }
    if ((event.key === "Enter" && !event.shiftKey && !event.altKey) || event.key === "Tab") {
      accept(items[selected]!, trigger)
      return true
    }
    return false
  }

  const inputProps = {
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": open && items.length > 0 ? `${listId}-${selected}` : undefined,
    onSelect: syncCaret,
    onBlur: () => setCaret(null),
    onScroll: (event: React.UIEvent<HTMLTextAreaElement>) => {
      if (backdropRef.current !== null)
        backdropRef.current.scrollTop = event.currentTarget.scrollTop
    },
  } as const

  const menu = (
    <CompletionMenu
      id={listId}
      trigger={trigger}
      items={items}
      selected={selected}
      status={completionStatus(trigger, trigger?.kind === "path" ? paths : commands)}
      onHover={setActive}
      onChoose={(index) => trigger !== null && accept(items[index]!, trigger)}
    />
  )
  const highlight = <ComposerHighlight ref={backdropRef} text={draft} ranges={ranges} />
  return { menu, highlight, inputProps, handleKeyDown, syncCaret }
}

/**
 * Draws the draft behind a transparent textarea so pills can be styled without changing text
 * metrics. It must match the textarea's padding, font, and wrapping exactly.
 */
function ComposerHighlight({
  ref,
  text,
  ranges,
}: {
  ref: React.Ref<HTMLDivElement>
  text: string
  ranges: readonly TokenRange[]
}): React.JSX.Element {
  const parts: React.ReactNode[] = []
  let position = 0
  for (const range of ranges) {
    if (range.start > position) parts.push(text.slice(position, range.start))
    parts.push(
      <span key={range.start} data-kind={range.token.kind} className={pillClasses}>
        {text.slice(range.start, range.end)}
      </span>,
    )
    position = range.end
  }
  // The trailing space keeps a final empty line as tall as the textarea's.
  parts.push(`${text.slice(position)} `)
  return (
    <div ref={ref} aria-hidden="true" className={highlightClasses}>
      {parts}
    </div>
  )
}

const highlightClasses = [
  "composer-highlight pointer-events-none absolute inset-0 overflow-hidden",
  "whitespace-pre-wrap [overflow-wrap:break-word] text-[var(--text-primary)]",
].join(" ")

const pillClasses = [
  "rounded-[4px] text-[var(--pill)]",
  "[background:color-mix(in_srgb,_var(--pill)_15%,_transparent)]",
  "[box-shadow:0_0_0_2px_color-mix(in_srgb,_var(--pill)_15%,_transparent)]",
  "[&[data-kind='path']]:[--pill:var(--accent)]",
  "[&[data-kind='command']]:[--pill:var(--color-info)]",
  "[&[data-kind='skill']]:[--pill:var(--color-renamed)]",
].join(" ")

function CompletionMenu({
  id,
  trigger,
  items,
  selected,
  status,
  onHover,
  onChoose,
}: {
  id: string
  trigger: CompletionTrigger | null
  items: readonly CompletionItem[]
  selected: number
  status: string
  onHover: (index: number) => void
  onChoose: (index: number) => void
}): React.JSX.Element {
  const reduced = useMotionPreference()
  const listRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [selected])
  return (
    <AnimatePresence>
      {trigger !== null && (
        <motion.div
          key="completion"
          className={menuClasses}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 4 }}
          transition={{ duration: reduced ? 0 : 0.14 }}
        >
          <div
            ref={listRef}
            id={id}
            role="listbox"
            aria-label={
              trigger.kind === "path"
                ? "Files and folders"
                : trigger.kind === "skill"
                  ? "Skills"
                  : "Commands"
            }
            className="max-h-[280px] overflow-y-auto p-[5px]"
          >
            {items.length === 0 ? (
              <div
                className="[padding:7px_9px] text-[var(--text-tertiary)] text-[12px]"
                role="status"
              >
                {status}
              </div>
            ) : (
              items.map((item, index) => (
                <div
                  key={itemKey(item)}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={index === selected}
                  data-index={index}
                  className={optionClasses}
                  // Keep focus in the textarea so typing continues after a click.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => index !== selected && onHover(index)}
                  onClick={() => onChoose(index)}
                >
                  <CompletionRow item={item} />
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CompletionRow({ item }: { item: CompletionItem }): React.JSX.Element {
  if (item.kind === "path") {
    const path = item.match.directory ? item.match.path.slice(0, -1) : item.match.path
    const slash = path.lastIndexOf("/")
    return (
      <>
        <span className="grid w-[14px] flex-[0_0_14px] place-items-center text-[var(--text-secondary)]">
          {item.match.directory ? (
            <Folder size={13} strokeWidth={1.75} />
          ) : (
            <FileIcon path={path} size={13} />
          )}
        </span>
        <span className="flex-none text-[var(--text-primary)]">
          {path.slice(slash + 1)}
          {item.match.directory ? "/" : ""}
        </span>
        {slash !== -1 && (
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap [direction:rtl] text-left text-[var(--text-tertiary)] text-[11px]">
            {path.slice(0, slash)}
          </span>
        )}
      </>
    )
  }
  const { command } = item
  return (
    <>
      <span className="grid w-[14px] flex-[0_0_14px] place-items-center text-[var(--text-secondary)]">
        {command.kind === "skill" ? (
          <Sparkles size={13} strokeWidth={1.75} />
        ) : (
          <SquareSlash size={13} strokeWidth={1.75} />
        )}
      </span>
      <span className="flex-none text-[var(--text-primary)]">
        {item.kind === "skill" ? "$" : "/"}
        {command.name}
      </span>
      {command.argumentHint && (
        <span className="flex-none text-[var(--text-tertiary)] [font-family:var(--font-mono)] text-[10.5px]">
          {command.argumentHint}
        </span>
      )}
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)] text-[11.5px]">
        {command.description}
      </span>
    </>
  )
}

const menuClasses = [
  "popup absolute z-[20] left-0 right-0 bottom-[calc(100%_+_6px)]",
  "border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-menu)]",
  "[backdrop-filter:blur(32px)]",
  "[box-shadow:var(--shadow-popup),_inset_0_1px_0_var(--edge-highlight)]",
  "text-[var(--text-primary)]",
  "[@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]",
  "[@media(prefers-reduced-transparency:_reduce)]:bg-[var(--surface-overlay)]",
].join(" ")

const optionClasses = [
  "motion-colors flex h-[30px] items-center gap-[9px] [padding:0_9px] rounded-[var(--radius-sm)]",
  "text-[var(--text-secondary)] cursor-default text-[12.5px] select-none",
  "[&[aria-selected='true']]:bg-[var(--surface-active)] [&[aria-selected='true']]:text-[var(--text-primary)]",
].join(" ")
