import { useEffect, useMemo, useRef, useState } from "react"
import type { Thread } from "@meldshell/contracts"
import { playChime, type Chime } from "../ui/chime"
import { useTabStore } from "./tab-store"
import { visibleThreads } from "./thread-layout"
import { useViewStore } from "./view-store"

type Activity = Thread["activity"]
const busy = new Set<Activity>(["running", "queued", "approval"])

function chimeFor(before: Activity, activity: Activity): Chime | null {
  if (activity === "approval") return "attention"
  if (!busy.has(before)) return null
  if (activity === "failed") return "failed"
  return activity === "completed" || activity === "idle" ? "done" : null
}

/** Activity changes worth a signal. The first observation of a thread only seeds its state. */
export function threadTransitions(
  previous: ReadonlyMap<string, Activity>,
  threads: ReadonlyArray<Pick<Thread, "id" | "activity">>,
): ReadonlyArray<{ readonly threadId: string; readonly chime: Chime }> {
  return threads.flatMap(({ id, activity }) => {
    const before = previous.get(id)
    if (before === undefined || before === activity) return []
    const chime = chimeFor(before, activity)
    return chime === null ? [] : [{ threadId: id, chime }]
  })
}

const priority: ReadonlyArray<Chime> = ["attention", "failed", "done"]

/**
 * Chimes for threads that change out of view and remembers finished threads the operator has not
 * looked at yet. The unseen set lives for this session only.
 */
export function useThreadSignals(
  threads: ReadonlyArray<Thread>,
  watchedIds: ReadonlyArray<string>,
  sounds: boolean,
): ReadonlySet<string> {
  const previous = useRef(new Map<string, Activity>())
  const [unseen, setUnseen] = useState<ReadonlySet<string>>(() => new Set())
  const [focused, setFocused] = useState(() => document.hasFocus())

  useEffect(() => {
    const update = () => setFocused(document.hasFocus())
    window.addEventListener("focus", update)
    window.addEventListener("blur", update)
    return () => {
      window.removeEventListener("focus", update)
      window.removeEventListener("blur", update)
    }
  }, [])

  useEffect(() => {
    const transitions = threadTransitions(previous.current, threads).filter(
      ({ threadId }) => !focused || !watchedIds.includes(threadId),
    )
    previous.current = new Map(threads.map((thread) => [thread.id, thread.activity]))
    if (transitions.length === 0) return
    const finished = transitions.filter(({ chime }) => chime !== "attention")
    if (finished.length > 0)
      setUnseen((current) => new Set([...current, ...finished.map(({ threadId }) => threadId)]))
    const chime = priority.find((candidate) =>
      transitions.some((entry) => entry.chime === candidate),
    )
    if (sounds && chime !== undefined) playChime(chime)
  }, [threads, watchedIds, focused, sounds])

  useEffect(() => {
    if (!focused) return
    setUnseen((current) =>
      watchedIds.some((id) => current.has(id))
        ? new Set([...current].filter((id) => !watchedIds.includes(id)))
        : current,
    )
  }, [watchedIds, focused])

  return unseen
}

/** Threads on screen: the selected tab's panes, unless a file or Settings covers them. */
export function useWatchedThreadIds(): ReadonlyArray<string> {
  const layout = useTabStore((state) => state.layout)
  const fileSelected = useTabStore((state) => state.selectedFileId !== null)
  const settingsOpen = useViewStore((state) => state.settingsOpen)
  return useMemo(
    () => (fileSelected || settingsOpen ? [] : visibleThreads(layout)),
    [layout, fileSelected, settingsOpen],
  )
}
