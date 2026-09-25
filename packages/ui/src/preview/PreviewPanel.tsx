import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { Thread } from "@meldshell/contracts"
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Globe,
  RotateCw,
  Server,
  SquareArrowOutUpRight,
  SquareCode,
  X,
} from "lucide-react"
import { Button, DropdownMenu, IconButton, MenuGroup, MenuAction } from "../ui/controls"
import { Pressable } from "../ui/motion"
import { centeredStateClasses } from "../ui/styles"
import { useKeybindings, withShortcut } from "../app/keybindings"
import { type ThreadPreview, usePreviewStore } from "./preview-store"
import { previewAddress } from "./server-urls"

/** The `<webview>` methods and events the preview uses. */
interface WebviewElement extends HTMLElement {
  src: string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  isDevToolsOpened(): boolean
  openDevTools(): void
  closeDevTools(): void
}

type WebviewEvent = Event & {
  readonly url?: string
  readonly isMainFrame?: boolean
  readonly errorCode?: number
  readonly errorDescription?: string
  readonly validatedURL?: string
}

interface PageFailure {
  readonly url: string
  readonly code: number
  readonly description: string
}

interface PageState {
  readonly loading: boolean
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly devTools: boolean
  readonly failure: PageFailure | null
}

const idle: PageState = {
  loading: false,
  canGoBack: false,
  canGoForward: false,
  devTools: false,
  failure: null,
}

// Chromium reports a navigation replaced by another one as aborted; that is not a failure.
const ABORTED = -3

const desktopApi = window.meldshell.desktop

/** An address the preview can offer, and where MeldShell learned it. */
interface Suggestion {
  readonly url: string
  readonly source: string
}

function useThreadPort(threadId: string) {
  return useQuery({
    queryKey: ["thread-port", threadId],
    queryFn: () => desktopApi!.threadPort(threadId),
    enabled: desktopApi !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/** Servers the thread's terminals announced, newest first, then the thread's own port. */
function useSuggestions(threadId: string, servers: readonly string[]): readonly Suggestion[] {
  const port = useThreadPort(threadId).data
  const own =
    port === undefined ? [] : [{ url: `http://localhost:${port}/`, source: "Thread port" }]
  return [...servers.map((url) => ({ url, source: "From terminal" })), ...own].filter(
    (suggestion, index, all) => all.findIndex((other) => other.url === suggestion.url) === index,
  )
}

/** Follows the page a `<webview>` shows and records where it navigates. */
function usePage(view: React.RefObject<WebviewElement | null>, threadId: string): PageState {
  const [page, setPage] = useState(idle)
  useEffect(() => {
    const element = view.current
    if (element === null) return
    const history = () => ({
      canGoBack: element.canGoBack(),
      canGoForward: element.canGoForward(),
    })
    const onStart = () => setPage((current) => ({ ...current, loading: true, failure: null }))
    const onStop = () => setPage((current) => ({ ...current, loading: false, ...history() }))
    const onNavigate = (event: WebviewEvent) => {
      if (event.isMainFrame === false || event.url === undefined) return
      usePreviewStore.getState().show(threadId, event.url)
      setPage((current) => ({ ...current, ...history() }))
    }
    const onFail = (event: WebviewEvent) => {
      if (event.isMainFrame === false || event.errorCode === ABORTED) return
      setPage((current) => ({
        ...current,
        loading: false,
        failure: {
          url: event.validatedURL ?? "",
          code: event.errorCode ?? 0,
          description: event.errorDescription || "The page could not be loaded.",
        },
      }))
    }
    const onDevTools = (open: boolean) => () =>
      setPage((current) => ({ ...current, devTools: open }))
    const listeners: [string, (event: WebviewEvent) => void][] = [
      ["did-start-loading", onStart],
      ["did-stop-loading", onStop],
      ["did-navigate", onNavigate],
      ["did-navigate-in-page", onNavigate],
      ["did-fail-load", onFail],
      ["devtools-opened", onDevTools(true)],
      ["devtools-closed", onDevTools(false)],
    ]
    for (const [name, listener] of listeners)
      element.addEventListener(name, listener as EventListener)
    return () => {
      for (const [name, listener] of listeners)
        element.removeEventListener(name, listener as EventListener)
    }
  }, [view, threadId])
  return page
}

/** The address field, with a menu of the local servers this thread can show. */
function AddressBar({
  url,
  suggestions,
  onSubmit,
}: {
  url: string
  suggestions: readonly Suggestion[]
  onSubmit: (url: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(url)
  const [invalid, setInvalid] = useState(false)
  // Navigation inside the page moves the address along unless the field is being edited.
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current) setDraft(url)
  }, [url])
  return (
    <form
      className={`motion-colors flex h-[28px] min-w-0 flex-1 items-center border-[1px] rounded-[var(--radius)] [background:rgba(0,_0,_0,_0.16)] [:root[data-theme='light']_&]:bg-[var(--surface-raised)] ${
        invalid
          ? "border-[color:var(--color-deleted)]"
          : "border-[color:var(--line-subtle)] [&:focus-within]:[border-color:var(--line-strong)]"
      }`}
      onSubmit={(event) => {
        event.preventDefault()
        const next = previewAddress(draft)
        setInvalid(next === null)
        if (next !== null) {
          editing.current = false
          onSubmit(next)
        }
      }}
    >
      <Globe
        size={13}
        strokeWidth={1.75}
        aria-hidden="true"
        className="flex-none ml-[8px] text-[var(--text-tertiary)]"
      />
      <input
        className="h-full w-full min-w-0 [padding:0_8px] border-0 bg-transparent text-[var(--text-primary)] text-[12px] outline-none [font-family:var(--font-mono)] [&::placeholder]:text-[var(--text-tertiary)] [&::placeholder]:[font-family:var(--font-text)]"
        aria-label="Page address"
        aria-invalid={invalid}
        placeholder="Enter a local address, such as localhost:3000"
        title={invalid ? "Enter an http or https address." : undefined}
        spellCheck={false}
        value={draft}
        onFocus={(event) => {
          editing.current = true
          event.currentTarget.select()
        }}
        onBlur={() => {
          editing.current = false
        }}
        onChange={(event) => {
          setInvalid(false)
          setDraft(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            editing.current = false
            setInvalid(false)
            setDraft(url)
            event.currentTarget.blur()
          }
        }}
      />
      {suggestions.length > 0 && (
        <DropdownMenu
          align="end"
          trigger={
            <BaseButton
              render={<Pressable />}
              type="button"
              className="motion-colors grid flex-none w-[24px] h-[24px] mr-[1px] place-items-center border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)] [&[data-popup-open]]:bg-[var(--surface-hover)] [&[data-popup-open]]:text-[var(--text-primary)]"
              aria-label="Local servers"
              title="Local servers"
            >
              <ChevronDown size={13} />
            </BaseButton>
          }
        >
          <MenuGroup label="Local servers">
            {suggestions.map((suggestion) => (
              <MenuAction
                key={suggestion.url}
                icon={<Server size={13} strokeWidth={1.75} />}
                onClick={() => {
                  setInvalid(false)
                  onSubmit(suggestion.url)
                }}
              >
                <span className="flex min-w-[240px] max-w-[380px] flex-1 items-baseline justify-between gap-[16px]">
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-primary)] [font:11.5px_var(--font-mono)]">
                    {suggestion.url}
                  </span>
                  <span className="flex-none text-[var(--text-tertiary)] text-[11px]">
                    {suggestion.source}
                  </span>
                </span>
              </MenuAction>
            ))}
          </MenuGroup>
        </DropdownMenu>
      )}
    </form>
  )
}

/**
 * Back, forward, reload, the address, and page tools. Without a page the navigation buttons stay in
 * place, disabled, so the bar does not shift when the first page opens.
 */
function PreviewToolbar({
  thread,
  url,
  page,
  view,
  suggestions,
  onNavigate,
}: {
  thread: Thread
  url: string
  page: PageState | null
  view: React.RefObject<WebviewElement | null> | null
  suggestions: readonly Suggestion[]
  onNavigate: (url: string) => void
}): React.JSX.Element {
  const closeChord = useKeybindings((state) => state.bindings.togglePreview)
  const element = () => view?.current ?? null
  return (
    <div className="relative flex min-w-0 items-center gap-[2px] [padding:4px_6px] border-b-[1px] border-b-[color:var(--line-subtle)] text-[var(--text-tertiary)]">
      <IconButton label="Back" disabled={!page?.canGoBack} onClick={() => element()?.goBack()}>
        <ArrowLeft size={14} />
      </IconButton>
      <IconButton
        label="Forward"
        disabled={!page?.canGoForward}
        onClick={() => element()?.goForward()}
      >
        <ArrowRight size={14} />
      </IconButton>
      <IconButton
        label={page?.loading ? "Stop loading" : "Reload"}
        disabled={page === null}
        onClick={() => (page?.loading ? element()?.stop() : element()?.reload())}
      >
        {page?.loading ? <X size={14} /> : <RotateCw size={14} />}
      </IconButton>
      <span className="w-[4px] flex-none" aria-hidden="true" />
      <AddressBar url={url} suggestions={suggestions} onSubmit={onNavigate} />
      <span className="w-[4px] flex-none" aria-hidden="true" />
      <IconButton
        label={page?.devTools ? "Close developer tools" : "Developer tools"}
        aria-pressed={page?.devTools ?? false}
        className="[&[aria-pressed='true']]:bg-[var(--surface-selected)] [&[aria-pressed='true']]:text-[var(--text-primary)]"
        disabled={page === null}
        onClick={() => {
          const current = element()
          if (current === null) return
          if (current.isDevToolsOpened()) current.closeDevTools()
          else current.openDevTools()
        }}
      >
        <SquareCode size={14} />
      </IconButton>
      <IconButton
        label="Open in browser"
        disabled={url === ""}
        onClick={() => void desktopApi?.openExternal(url)}
      >
        <SquareArrowOutUpRight size={14} />
      </IconButton>
      <IconButton
        label={withShortcut("Hide preview", closeChord)}
        onClick={() => usePreviewStore.getState().toggle(thread.id)}
      >
        <X size={15} />
      </IconButton>
      {page?.loading && (
        <span
          aria-hidden="true"
          className="absolute left-[0] right-[0] bottom-[-1px] h-[2px] overflow-hidden"
        >
          <span className="block h-full w-full animate-shimmer [background:linear-gradient(90deg,_transparent_0%,_var(--accent)_40%,_var(--accent)_60%,_transparent_100%)] [background-size:50%_100%] [background-repeat:no-repeat]" />
        </span>
      )}
    </div>
  )
}

/** Where a preview without a page can start: announced servers, then the thread's own port. */
function PreviewStart({
  thread,
  suggestions,
}: {
  thread: Thread
  suggestions: readonly Suggestion[]
}): React.JSX.Element {
  const show = (url: string) => usePreviewStore.getState().show(thread.id, url)
  return (
    <div className={centeredStateClasses}>
      <Globe size={20} strokeWidth={1.5} className="mb-[12px] text-[var(--text-tertiary)]" />
      <h2>Preview a page</h2>
      <p>
        Open a server this thread started, or type an address above. Pages printed in the thread's
        terminals appear here as they start, and run scripts receive this thread's port in{" "}
        <code>MELDSHELL_PORT</code>.
      </p>
      {suggestions.length > 0 && (
        <ul className="flex w-[min(360px,_100%)] flex-col m-0 p-[4px] list-none border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] text-left">
          {suggestions.map((suggestion) => (
            <li key={suggestion.url}>
              <BaseButton
                type="button"
                className="motion-colors flex w-full min-w-0 items-center gap-[10px] h-[34px] [padding:0_10px] border-0 rounded-[var(--radius)] bg-transparent text-[var(--text-secondary)] cursor-default text-left [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]"
                onClick={() => show(suggestion.url)}
              >
                <Server
                  size={14}
                  strokeWidth={1.75}
                  className="flex-none text-[var(--text-tertiary)]"
                />
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap [font:12px_var(--font-mono)]">
                  {suggestion.url}
                </span>
                <span className="flex-none text-[var(--text-tertiary)] text-[11px]">
                  {suggestion.source}
                </span>
              </BaseButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A heading and advice for the common ways a page fails to load, by Chromium network error. */
function failureCopy(code: number): { title: string; advice: string } {
  if (code === -102 || code === -101 || code === -324 || code === -100)
    return {
      title: "Nothing is answering at this address",
      advice:
        "Start the thread's server, then try again. The preview switches to a server as soon as a terminal announces one.",
    }
  if (code === -105 || code === -137)
    return {
      title: "This address could not be found",
      advice: "Check the host name, then try again.",
    }
  if (code === -118 || code === -7)
    return {
      title: "The page took too long to answer",
      advice: "The server may be busy starting. Try again in a moment.",
    }
  if (code === -106 || code === -21 || code === -109)
    return {
      title: "The network is unavailable",
      advice: "Check this computer's connection, then try again.",
    }
  if (code <= -200 && code > -300)
    return {
      title: "This page's certificate is not trusted",
      advice: "Open it in your browser to review the certificate.",
    }
  return { title: "The page could not be loaded", advice: "Try again, or open it in your browser." }
}

function PreviewFailure({
  failure,
  onRetry,
}: {
  failure: PageFailure
  onRetry: () => void
}): React.JSX.Element {
  const copy = failureCopy(failure.code)
  return (
    <div className={`absolute [inset:0] bg-[var(--scrim)] ${centeredStateClasses}`} role="alert">
      <h2>{copy.title}</h2>
      <p>{copy.advice}</p>
      <code className="block max-w-[420px] mb-[18px] [padding:6px_10px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] bg-[var(--surface-hover)] text-[var(--text-secondary)] text-[11.5px] [overflow-wrap:anywhere]">
        {failure.url}
        <span className="text-[var(--text-tertiary)]"> · {failure.description}</span>
      </code>
      <Button variant="primary" icon={<RotateCw size={14} />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function PreviewPage({
  thread,
  url,
  servers,
  suggestions,
}: {
  thread: Thread
  url: string
  servers: readonly string[]
  suggestions: readonly Suggestion[]
}): React.JSX.Element {
  const view = useRef<WebviewElement>(null)
  // The element navigates itself after mounting; `src` only chooses its first page.
  const [initialUrl] = useState(url)
  const page = usePage(view, thread.id)
  const navigate = (next: string) => {
    const element = view.current
    if (element === null) return
    if (element.src === next) element.reload()
    else element.src = next
  }
  // A server announced while the page is failing is almost always the one to show.
  const newestServer = servers[0]
  const failing = page.failure !== null
  useEffect(() => {
    if (failing && newestServer !== undefined && view.current?.src !== newestServer)
      view.current!.src = newestServer
  }, [failing, newestServer])
  return (
    <section
      className="grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)]"
      aria-label={`Preview for ${thread.title}`}
    >
      <PreviewToolbar
        thread={thread}
        url={url}
        page={page}
        view={view}
        suggestions={suggestions}
        onNavigate={navigate}
      />
      <div className="relative min-w-0 min-h-0 bg-white">
        <webview
          ref={view}
          // The session is fixed when the page attaches, so it is named before the address.
          // biome-ignore lint/suspicious/noUnknownAttribute: an Electron `<webview>` attribute.
          partition="persist:meldshell-preview"
          src={initialUrl}
          className="preview-webview absolute [inset:0] flex"
        />
        {page.failure !== null && (
          <PreviewFailure failure={page.failure} onRetry={() => view.current?.reload()} />
        )}
      </div>
    </section>
  )
}

export function PreviewPanel({
  thread,
  preview,
}: {
  thread: Thread
  preview: ThreadPreview
}): React.JSX.Element {
  const servers = usePreviewStore((state) => state.servers[thread.id]) ?? noServers
  const suggestions = useSuggestions(thread.id, servers)
  const newestServer = servers[0]
  // Opening an empty preview goes straight to a server the thread already started.
  useEffect(() => {
    if (preview.url === null && newestServer !== undefined)
      usePreviewStore.getState().show(thread.id, newestServer)
  }, [preview.url, newestServer, thread.id])
  if (preview.url === null)
    return (
      <section
        className="grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)]"
        aria-label={`Preview for ${thread.title}`}
      >
        <PreviewToolbar
          thread={thread}
          url=""
          page={null}
          view={null}
          suggestions={suggestions}
          onNavigate={(url) => usePreviewStore.getState().show(thread.id, url)}
        />
        <PreviewStart thread={thread} suggestions={suggestions} />
      </section>
    )
  return (
    <PreviewPage
      key={thread.id}
      thread={thread}
      url={preview.url}
      servers={servers}
      suggestions={suggestions}
    />
  )
}

const noServers: readonly string[] = []
