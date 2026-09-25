import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { Unicode11Addon } from "@xterm/addon-unicode11"
import { WebLinksAddon } from "@xterm/addon-web-links"
import type { RunScript, WorkspaceScope } from "@meldshell/contracts/ipc"
import {
  removeTerminal,
  resizeTerminalSplit,
  splitTerminal,
  terminalIds,
  type TerminalLayout,
} from "./terminal-layout"
import {
  terminalFontFamily,
  terminalFontSize,
  terminalTheme,
  watchAppearance,
} from "./terminal-theme"
import { actionForEvent, useKeybindings } from "../app/keybindings"
import { usePreviewStore } from "../preview/preview-store"
import { detectServerUrls } from "../preview/server-urls"
import { errorMessage } from "@meldshell/contracts"

/*
 * Thread terminals outlive their views. The store keeps each thread's pane tree; the xterm
 * instances below keep scrollback and screen state while no pane shows them, and the shells keep
 * running in the main process. Leaving a thread only detaches its terminal elements; they are
 * reattached, unchanged, when the thread is shown again.
 */

export interface ThreadTerminals {
  readonly layout: TerminalLayout
  readonly focusedId: string
  /** Hidden panels keep their shells running. */
  readonly open: boolean
  /** Percentage of the thread pane taken by the terminal panel. */
  readonly size: number
}

export type TerminalInfo =
  | { readonly state: "starting" }
  | {
      readonly state: "running"
      readonly shell: string
      readonly cwd: string
      readonly run?: RunScript
    }
  | {
      readonly state: "exited"
      readonly shell: string
      readonly cwd: string
      readonly run?: RunScript
      readonly code: number
    }
  | { readonly state: "failed"; readonly message: string }

interface TerminalStore {
  readonly threads: Readonly<Record<string, ThreadTerminals>>
  readonly info: Readonly<Record<string, TerminalInfo>>
  /** Shows or hides a thread's terminal panel, starting its first shell when it has none. */
  readonly toggle: (threadId: string) => void
  /** Starts another shell beside the focused one. */
  readonly split: (threadId: string, orientation: "horizontal" | "vertical") => void
  /**
   * Starts the named workspace run script in a new shell, or shows the one already running it, so
   * a thread never runs two copies of the same servers.
   */
  readonly run: (threadId: string, name: string) => void
  /** Ends the shell running the named run script, stopping its servers. */
  readonly stopRun: (threadId: string, name: string) => void
  readonly close: (threadId: string, terminalId: string) => void
  readonly focus: (threadId: string, terminalId: string) => void
  readonly resizeSplit: (threadId: string, splitId: string, ratio: number) => void
  readonly resizePanel: (threadId: string, size: number) => void
  /** Ends every shell of a thread that no longer exists. */
  readonly forget: (threadId: string) => void
}

export const terminalApi = window.meldshell.terminal

function without<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Record<string, Value> {
  const { [key]: _removed, ...rest } = record
  return rest
}

const newTerminalId = () => `terminal:${crypto.randomUUID()}`

interface Instance {
  readonly term: Terminal
  readonly fit: FitAddon
  readonly element: HTMLDivElement
  exited: boolean
}

const instances = new Map<string, Instance>()
let pendingFocus: string | null = null
// The run script each run shell starts, and the open shell for each thread's run script.
const runShells = new Map<string, string>()
const runShellByScript = new Map<string, string>()
// The end of each shell's output, so an address split across two chunks is still found.
const outputTails = new Map<string, string>()

const runKey = (threadId: string, name: string) => `${threadId}\n${name}`

function forgetRunShell(id: string): void {
  for (const [key, runId] of runShellByScript) if (runId === id) runShellByScript.delete(key)
}

function setInfo(id: string, info: TerminalInfo): void {
  useTerminalStore.setState((state) =>
    id in state.info || info.state === "starting" ? { info: { ...state.info, [id]: info } } : state,
  )
}

function focusTerminal(id: string): void {
  const instance = instances.get(id)
  if (instance?.element.isConnected) {
    pendingFocus = null
    instance.term.focus()
  } else pendingFocus = id
}

function disposeTerminal(id: string): void {
  outputTails.delete(id)
  runShells.delete(id)
  forgetRunShell(id)
  terminalApi?.close(id)
  instances.get(id)?.term.dispose()
  instances.delete(id)
}

function threadOf(terminalId: string): string | undefined {
  const { threads } = useTerminalStore.getState()
  return Object.keys(threads).find((threadId) =>
    terminalIds(threads[threadId]!.layout).includes(terminalId),
  )
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  threads: {},
  info: {},
  toggle: (threadId) => {
    const current = get().threads[threadId]
    if (current === undefined) {
      const id = newTerminalId()
      pendingFocus = id
      set((state) => ({
        threads: {
          ...state.threads,
          [threadId]: { layout: { kind: "terminal", id }, focusedId: id, open: true, size: 38 },
        },
        info: { ...state.info, [id]: { state: "starting" } },
      }))
      return
    }
    if (!current.open) focusTerminal(current.focusedId)
    set((state) => ({
      threads: { ...state.threads, [threadId]: { ...current, open: !current.open } },
    }))
  },
  split: (threadId, orientation) => {
    const current = get().threads[threadId]
    if (current === undefined) return
    const id = newTerminalId()
    pendingFocus = id
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: {
          ...current,
          open: true,
          focusedId: id,
          layout: splitTerminal(
            current.layout,
            current.focusedId,
            id,
            orientation,
            `split:${crypto.randomUUID()}`,
          ),
        },
      },
      info: { ...state.info, [id]: { state: "starting" } },
    }))
  },
  run: (threadId, name) => {
    const previous = runShellByScript.get(runKey(threadId, name))
    // A run shell that ended with an error stays open to show why; running again replaces it.
    const ended = previous === undefined ? undefined : get().info[previous]?.state
    if (previous !== undefined && (ended === "exited" || ended === "failed"))
      get().close(threadId, previous)
    const existing = runShellByScript.get(runKey(threadId, name))
    const current = get().threads[threadId]
    if (existing !== undefined && current !== undefined) {
      set((state) => ({
        threads: { ...state.threads, [threadId]: { ...current, open: true, focusedId: existing } },
      }))
      focusTerminal(existing)
      return
    }
    const id = newTerminalId()
    runShells.set(id, name)
    runShellByScript.set(runKey(threadId, name), id)
    pendingFocus = id
    const layout: TerminalLayout =
      current === undefined
        ? { kind: "terminal", id }
        : splitTerminal(
            current.layout,
            current.focusedId,
            id,
            "horizontal",
            `split:${crypto.randomUUID()}`,
          )
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: { size: current?.size ?? 38, layout, focusedId: id, open: true },
      },
      info: { ...state.info, [id]: { state: "starting" } },
    }))
  },
  stopRun: (threadId, name) => {
    const id = runShellByScript.get(runKey(threadId, name))
    if (id !== undefined) get().close(threadId, id)
  },
  close: (threadId, terminalId) => {
    disposeTerminal(terminalId)
    const state = get()
    const current = state.threads[threadId]
    const info = without(state.info, terminalId)
    const layout = current === undefined ? null : removeTerminal(current.layout, terminalId)
    if (current === undefined || layout === null) {
      set({ threads: without(state.threads, threadId), info })
      return
    }
    const focusedId = current.focusedId === terminalId ? terminalIds(layout)[0]! : current.focusedId
    set({ threads: { ...state.threads, [threadId]: { ...current, layout, focusedId } }, info })
    if (focusedId !== current.focusedId) focusTerminal(focusedId)
  },
  focus: (threadId, terminalId) =>
    set((state) => {
      const current = state.threads[threadId]
      return current === undefined || current.focusedId === terminalId
        ? state
        : { threads: { ...state.threads, [threadId]: { ...current, focusedId: terminalId } } }
    }),
  resizeSplit: (threadId, splitId, ratio) =>
    set((state) => {
      const current = state.threads[threadId]
      if (current === undefined) return state
      const layout = resizeTerminalSplit(current.layout, splitId, ratio)
      return { threads: { ...state.threads, [threadId]: { ...current, layout } } }
    }),
  resizePanel: (threadId, size) =>
    set((state) => {
      const current = state.threads[threadId]
      if (current === undefined) return state
      const bounded = Math.max(10, Math.min(90, size))
      return { threads: { ...state.threads, [threadId]: { ...current, size: bounded } } }
    }),
  forget: (threadId) => {
    const current = get().threads[threadId]
    if (current === undefined) return
    for (const id of terminalIds(current.layout)) get().close(threadId, id)
  },
}))

const noScripts: readonly string[] = []

/** The names of the run scripts whose shells are running in a thread's terminal. */
export function useRunningScripts(threadId: string | null): readonly string[] {
  return useTerminalStore(
    useShallow((state) => {
      const layout = threadId === null ? undefined : state.threads[threadId]?.layout
      if (layout === undefined) return noScripts
      return terminalIds(layout).flatMap((id) => {
        const info = state.info[id]
        return info?.state === "running" && info.run !== undefined ? [info.run.name] : []
      })
    }),
  )
}

let listening = false
function watchForServers(id: string, data: string): void {
  const text = (outputTails.get(id) ?? "") + data
  outputTails.set(id, text.slice(-160))
  // Cheap test first: most output never names a web address.
  if (!text.includes("://")) return
  const urls = detectServerUrls(text)
  const threadId = urls.length === 0 ? undefined : threadOf(id)
  if (threadId !== undefined) usePreviewStore.getState().noteServers(threadId, urls)
}

function listen(): void {
  if (listening || terminalApi === undefined) return
  listening = true
  terminalApi.onData((id, data) => {
    instances.get(id)?.term.write(data)
    watchForServers(id, data)
  })
  terminalApi.onExit((id, code) => {
    const instance = instances.get(id)
    if (instance === undefined) return
    instance.exited = true
    const threadId = threadOf(id)
    // A shell that ends cleanly, as after `exit`, closes its pane. Otherwise the pane stays so the
    // last output and the exit code can be read.
    if (code === 0 && threadId !== undefined) {
      useTerminalStore.getState().close(threadId, id)
      return
    }
    instance.term.write(
      `\r\n\x1b[2mProcess exited with code ${code}. Press any key to close.\x1b[0m`,
    )
    const info = useTerminalStore.getState().info[id]
    if (info?.state === "running") setInfo(id, { ...info, state: "exited", code })
  })
  watchAppearance(() => {
    const theme = terminalTheme()
    const fontSize = terminalFontSize()
    for (const { term, fit, element } of instances.values()) {
      term.options.theme = theme
      term.options.fontSize = fontSize
      if (element.isConnected) fit.fit()
    }
  })
}

/** Keys the app keeps while a shell has focus, and the terminal's clipboard keys. */
function handleKey(event: KeyboardEvent, term: Terminal): boolean {
  const action = actionForEvent(event, useKeybindings.getState().bindings)
  if (action === "nextTab" || action === "previousTab" || action === "toggleTerminal") return false
  const key = event.key.toLowerCase()
  const windows = window.meldshell.platform === "win32"
  const copy =
    event.ctrlKey &&
    !event.altKey &&
    key === "c" &&
    (event.shiftKey || (windows && term.hasSelection()))
  if (copy) {
    if (event.type === "keydown") {
      event.preventDefault()
      const selection = term.getSelection()
      if (selection !== "") void navigator.clipboard.writeText(selection)
      if (!event.shiftKey) term.clearSelection()
    }
    return false
  }
  // Returning false leaves paste to the browser, whose paste event xterm already handles.
  return !(event.ctrlKey && !event.altKey && key === "v" && (event.shiftKey || windows))
}

function createInstance(id: string): Instance {
  listen()
  const term = new Terminal({
    allowProposedApi: true,
    allowTransparency: true,
    cursorBlink: true,
    cursorStyle: "bar",
    cursorInactiveStyle: "outline",
    drawBoldTextInBrightColors: false,
    fontFamily: terminalFontFamily(),
    fontSize: terminalFontSize(),
    fontWeight: 400,
    fontWeightBold: 600,
    lineHeight: 1.25,
    macOptionIsMeta: true,
    scrollback: 5000,
    theme: terminalTheme(),
    ...(window.meldshell.platform === "win32" ? { windowsPty: { backend: "conpty" } } : {}),
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new Unicode11Addon())
  term.unicode.activeVersion = "11"
  // Links open with Ctrl or Cmd held, so a plain click can still place a selection.
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      if (event.ctrlKey || event.metaKey) window.open(uri)
    }),
  )
  term.attachCustomKeyEventHandler((event) => handleKey(event, term))
  const element = document.createElement("div")
  element.className = "h-full w-full"
  const instance: Instance = { term, fit, element, exited: false }
  term.onData((data) => {
    if (!instance.exited) terminalApi?.write(id, data)
    else {
      const threadId = threadOf(id)
      if (threadId !== undefined) useTerminalStore.getState().close(threadId, id)
    }
  })
  term.onResize(({ cols, rows }) => terminalApi?.resize(id, cols, rows))
  instances.set(id, instance)
  return instance
}

function startShell(id: string, scope: Required<WorkspaceScope>, instance: Instance): void {
  const { term } = instance
  const run = runShells.get(id)
  terminalApi
    ?.open({ id, ...scope, cols: term.cols, rows: term.rows, ...(run ? { run } : {}) })
    .then(
      ({ shell, cwd, run }) => {
        setInfo(id, { state: "running", shell, cwd, ...(run === undefined ? {} : { run }) })
        // The pane may have been fitted while the shell was starting.
        terminalApi?.resize(id, term.cols, term.rows)
      },
      (error: unknown) => {
        instance.exited = true
        // A failed run shell stays to show why; the next Run starts a fresh one.
        forgetRunShell(id)
        const message = errorMessage(error)
        setInfo(id, { state: "failed", message })
        term.write(
          `\x1b[31m${message.replace(/^Error invoking remote method '[^']+': /, "")}\x1b[0m`,
        )
      },
    )
}

// The bundled monospace face must be ready before xterm measures its cells.
let fontReady: Promise<unknown> | undefined
const loadFont = () =>
  (fontReady ??= document.fonts
    .load(`${terminalFontSize()}px ${terminalFontFamily()}`)
    .catch(() => undefined))

/**
 * Shows a thread's terminal inside `host`, starting its shell the first time. The returned function
 * detaches the view; the shell and its screen are kept for the next attach.
 */
export function attachTerminal(
  id: string,
  scope: Required<WorkspaceScope>,
  host: HTMLElement,
): () => void {
  let attached = true
  let frame = 0
  const fitToHost = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const instance = instances.get(id)
      if (attached && instance && host.clientWidth > 0 && host.clientHeight > 0) instance.fit.fit()
    })
  }
  const observer = new ResizeObserver(fitToHost)
  void loadFont().then(() => {
    if (!attached) return
    const existing = instances.get(id)
    const instance = existing ?? createInstance(id)
    host.append(instance.element)
    if (existing === undefined) {
      instance.term.open(instance.element)
      if (host.clientWidth > 0 && host.clientHeight > 0) instance.fit.fit()
      startShell(id, scope, instance)
    } else {
      instance.fit.fit()
      instance.term.refresh(0, instance.term.rows - 1)
    }
    observer.observe(host)
    if (pendingFocus === id) focusTerminal(id)
  })
  return () => {
    attached = false
    cancelAnimationFrame(frame)
    observer.disconnect()
    const element = instances.get(id)?.element
    // A remount elsewhere may already have adopted the element.
    if (element?.parentElement !== host) return
    // A pane remounts when the tree around it changes; typing should carry on where it was.
    if (element.contains(document.activeElement)) pendingFocus = id
    element.remove()
  }
}
