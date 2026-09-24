import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { Thread } from "@meldshell/contracts"
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Globe,
  RotateCw,
  SquareArrowOutUpRight,
  SquareCode,
  X,
} from "lucide-react"
import { Button, IconButton } from "../ui/controls"
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

interface PageState {
  readonly loading: boolean
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly failure: { readonly url: string; readonly description: string } | null
}

const idle: PageState = { loading: false, canGoBack: false, canGoForward: false, failure: null }

// Chromium reports a navigation replaced by another one as aborted; that is not a failure.
const ABORTED = -3

const desktopApi = window.meldshell.desktop

function useThreadPort(threadId: string) {
  return useQuery({
    queryKey: ["thread-port", threadId],
    queryFn: () => desktopApi!.threadPort(threadId),
    enabled: desktopApi !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  })
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
          description: event.errorDescription || "The page could not be loaded.",
        },
      }))
    }
    const listeners: [string, (event: WebviewEvent) => void][] = [
      ["did-start-loading", onStart],
      ["did-stop-loading", onStop],
      ["did-navigate", onNavigate],
      ["did-navigate-in-page", onNavigate],
      ["did-fail-load", onFail],
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

function AddressBar({
  url,
  onSubmit,
}: {
  url: string
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
      className="flex min-w-0 flex-1"
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
      <input
        className={`motion-colors h-[26px] w-full min-w-0 [padding:0_8px] border-[1px] rounded-[var(--radius-sm)] bg-transparent text-[var(--text-primary)] text-[12px] outline-none [font-family:var(--font-mono)] ${
          invalid
            ? "border-[color:var(--color-deleted)]"
            : "border-[color:var(--line-subtle)] [&:focus]:[border-color:var(--line-strong)]"
        }`}
        aria-label="Page address"
        aria-invalid={invalid}
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
    </form>
  )
}

/** Where a preview without a page can start: announced servers, then the thread's own port. */
function PreviewStart({
  thread,
  servers,
  port,
}: {
  thread: Thread
  servers: readonly string[]
  port: number | undefined
}): React.JSX.Element {
  const show = (url: string) => usePreviewStore.getState().show(thread.id, url)
  const suggestions = [
    ...servers,
    ...(port === undefined ? [] : [`http://localhost:${port}/`]),
  ].filter((url, index, all) => all.indexOf(url) === index)
  return (
    <div className={centeredStateClasses}>
      <Globe size={20} strokeWidth={1.5} className="text-[var(--text-tertiary)]" />
      <h2>Preview a page</h2>
      <p>
        Type an address above, or open a server this thread started. Run scripts receive their port
        in <code>MELDSHELL_PORT</code>.
      </p>
      <div className="flex w-[min(320px,_100%)] flex-col gap-[4px]">
        {suggestions.map((url) => (
          <Button
            key={url}
            variant="ghost"
            block
            icon={<ChevronRight size={14} />}
            className="justify-start! [font-family:var(--font-mono)] text-[12px]"
            onClick={() => show(url)}
          >
            {url}
          </Button>
        ))}
      </div>
    </div>
  )
}

function PreviewFailure({
  failure,
  onRetry,
}: {
  failure: NonNullable<PageState["failure"]>
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className={`absolute [inset:0] bg-[var(--scrim)] ${centeredStateClasses}`} role="alert">
      <h2>Nothing is answering at this address</h2>
      <p>
        <code>{failure.url}</code> could not be loaded: {failure.description}. Start the thread's
        server, then try again. The preview switches to a server as soon as a terminal announces
        one.
      </p>
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
}: {
  thread: Thread
  url: string
  servers: readonly string[]
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
  const closeChord = useKeybindings((state) => state.bindings.togglePreview)
  return (
    <section
      className="grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)]"
      aria-label={`Preview for ${thread.title}`}
    >
      <div className="flex min-w-0 items-center gap-[2px] [padding:3px_6px] border-b-[1px] border-b-[color:var(--line-subtle)] text-[var(--text-tertiary)]">
        <IconButton label="Back" disabled={!page.canGoBack} onClick={() => view.current?.goBack()}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton
          label="Forward"
          disabled={!page.canGoForward}
          onClick={() => view.current?.goForward()}
        >
          <ArrowRight size={14} />
        </IconButton>
        <IconButton
          label={page.loading ? "Stop loading" : "Reload"}
          onClick={() => (page.loading ? view.current?.stop() : view.current?.reload())}
        >
          {page.loading ? <X size={14} /> : <RotateCw size={14} />}
        </IconButton>
        <AddressBar url={url} onSubmit={navigate} />
        <IconButton
          label="Developer tools"
          onClick={() => {
            const element = view.current
            if (element === null) return
            if (element.isDevToolsOpened()) element.closeDevTools()
            else element.openDevTools()
          }}
        >
          <SquareCode size={14} />
        </IconButton>
        <IconButton label="Open in browser" onClick={() => void desktopApi?.openExternal(url)}>
          <SquareArrowOutUpRight size={14} />
        </IconButton>
        <IconButton
          label={withShortcut("Hide preview", closeChord)}
          onClick={() => usePreviewStore.getState().toggle(thread.id)}
        >
          <X size={15} />
        </IconButton>
      </div>
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
  const port = useThreadPort(thread.id).data
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
        <div className="flex min-w-0 items-center gap-[2px] [padding:3px_6px] border-b-[1px] border-b-[color:var(--line-subtle)] text-[var(--text-tertiary)]">
          <AddressBar url="" onSubmit={(url) => usePreviewStore.getState().show(thread.id, url)} />
          <IconButton
            label="Hide preview"
            onClick={() => usePreviewStore.getState().toggle(thread.id)}
          >
            <X size={15} />
          </IconButton>
        </div>
        <PreviewStart thread={thread} servers={servers} port={port} />
      </section>
    )
  return <PreviewPage key={thread.id} thread={thread} url={preview.url} servers={servers} />
}

const noServers: readonly string[] = []
