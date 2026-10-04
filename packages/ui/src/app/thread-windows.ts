import type { Thread } from "@meldshell/contracts"
import { create } from "zustand"
import { useThreadDrafts } from "./thread-drafts"

/*
 * Threads popped out into windows of their own, for a second monitor. A popped-out window runs this
 * same app with the thread in its address and shows only that thread. The main window hands such a
 * thread to its window: opening it there brings that window forward instead.
 */

const api = window.meldshell.desktop?.threadWindows

/** Whether this client can open windows, which only the desktop app can. */
export const threadWindowsSupported = api !== undefined

/** The thread this window was popped out for; null in the main window. */
export const windowThreadId: string | null =
  api === undefined ? null : new URLSearchParams(window.location.search).get("thread") || null

export const useThreadWindows = create<{ readonly detached: ReadonlySet<string> }>(() => ({
  detached: new Set(),
}))

/** Whether a thread belongs to another window, so this one should bring that window forward. */
export const shownElsewhere = (threadId: string): boolean =>
  threadId !== windowThreadId && useThreadWindows.getState().detached.has(threadId)

export const useShownElsewhere = (threadId: string): boolean =>
  useThreadWindows((state) => threadId !== windowThreadId && state.detached.has(threadId))

/*
 * An unsent draft follows its thread between windows. The window giving the thread up leaves the
 * draft in storage both windows share, and the window taking it over adopts it.
 */
const draftKey = (threadId: string) => `meldshell:thread-window-draft:${threadId}`

function handOffDraft(threadId: string): void {
  const draft = useThreadDrafts.getState().drafts[threadId]
  try {
    window.localStorage.setItem(
      draftKey(threadId),
      JSON.stringify({
        text: draft?.text ?? "",
        attachments: draft?.attachments ?? [],
        tokens: draft?.tokens ?? [],
      }),
    )
  } catch {
    // Storage can be unavailable; the draft then stays behind.
  }
}

/** Takes over the draft another window handed off with the thread, if it left one. */
export function adoptDraft(threadId: string): void {
  try {
    const stored = window.localStorage.getItem(draftKey(threadId))
    if (stored === null) return
    window.localStorage.removeItem(draftKey(threadId))
    const { text, attachments, tokens } = JSON.parse(stored)
    if (typeof text !== "string" || !Array.isArray(attachments) || !Array.isArray(tokens)) return
    useThreadDrafts.getState().update(threadId, { text, attachments, tokens, error: null })
  } catch {
    // A draft that cannot be read is left behind rather than blocking the thread.
  }
}

const threadKey = (threadId: string) => `meldshell:thread-window-thread:${threadId}`

/**
 * The thread as the main window knew it when popping it out. A thread outside the app's first page
 * of threads, such as an old archived one, is shown from this until fresher data arrives.
 */
export function takeHandedOffThread(threadId: string): Thread | null {
  try {
    // Left in place, as reading it must not change it. Only a window opening right after the
    // hand-off takes it; one reopened at a later launch finds the thread among the app's own.
    const stored = window.localStorage.getItem(threadKey(threadId))
    const { thread, at } = stored === null ? {} : JSON.parse(stored)
    return typeof at === "number" && Date.now() - at < 60_000 && thread?.id === threadId
      ? (thread as Thread)
      : null
  } catch {
    return null
  }
}

/** Moves a thread from this window into a window of its own, or brings that window forward. */
export function popOutThread(thread: Thread): void {
  if (api === undefined) return
  if (!useThreadWindows.getState().detached.has(thread.id)) {
    handOffDraft(thread.id)
    try {
      window.localStorage.setItem(threadKey(thread.id), JSON.stringify({ thread, at: Date.now() }))
    } catch {
      // The window then finds the thread among the app's own.
    }
  }
  void api.open(thread.id)
}

/** Pops a thread out, for menus that offer it only where windows can open. */
export const popOutAction = api === undefined ? undefined : popOutThread

/** Brings forward the window a thread was popped out into. */
export function showThreadWindow(threadId: string): void {
  void api?.open(threadId)
}

/** Closes this popped-out window and shows its thread in the main window again. */
export function dockThread(threadId: string): void {
  void api?.dock(threadId)
}

if (api !== undefined) {
  const apply = (ids: readonly string[]) => {
    const previous = useThreadWindows.getState().detached
    const detached = new Set(ids)
    // A thread coming back from its window brings the draft that window handed off.
    for (const id of previous) if (!detached.has(id) && windowThreadId === null) adoptDraft(id)
    useThreadWindows.setState({ detached })
  }
  void api.list().then(apply)
  api.onChange(apply)
  // A popped-out window hands its draft back however it closes: docked, closed, or at quit.
  if (windowThreadId !== null)
    window.addEventListener("pagehide", () => handOffDraft(windowThreadId))
}
