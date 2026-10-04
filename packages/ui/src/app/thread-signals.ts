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
function threadTransitions(
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

const finished = new Set<Activity>(["completed", "idle", "interrupted"])

/**
 * A thread whose latest work the operator has not had on screen: it finished after it was last
 * seen. The host keeps `seenAt`, so the mark survives a restart.
 */
const isUnseen = (thread: Thread): boolean =>
  thread.status === "active" &&
  thread.turnCount > 0 &&
  finished.has(thread.activity) &&
  (thread.seenAt === undefined || thread.seenAt < thread.updatedAt)

/**
 * Chimes for threads that change out of view and marks finished threads the operator has not
 * looked at yet. Threads on screen in a focused window are stamped as seen on the host.
 */
export function useThreadSignals(
  threads: ReadonlyArray<Thread>,
  watchedIds: ReadonlyArray<string>,
  sounds: boolean,
): ReadonlySet<string> {
  const previous = useRef(new Map<string, Activity>())
  const [focused, setFocused] = useState(() => document.hasFocus())
  const unseen = useMemo(
    () => new Set(threads.filter(isUnseen).map((thread) => thread.id)),
    [threads],
  )

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
    const chime = priority.find((candidate) =>
      transitions.some((entry) => entry.chime === candidate),
    )
    if (sounds && chime !== undefined) playChime(chime)
  }, [threads, watchedIds, focused, sounds])

  // A watched thread in a focused window is being read, so its latest work is seen. One request
  // per thread revision keeps a slow host from being asked twice.
  const stamped = useRef(new Map<string, string>())
  useEffect(() => {
    if (!focused) return
    for (const id of watchedIds) {
      const thread = threads.find((candidate) => candidate.id === id)
      if (thread === undefined || !isUnseen(thread)) continue
      if (stamped.current.get(id) === thread.updatedAt) continue
      stamped.current.set(id, thread.updatedAt)
      void window.meldshell.markThreadSeen({ threadId: id }).catch(() => undefined)
    }
  }, [watchedIds, focused, threads])

  return unseen
}

/** Threads on screen: the selected tab's panes, unless a file or Settings covers them. */
export function useWatchedThreadIds(): ReadonlyArray<string> {
  const layout = useTabStore((state) => state.layout)
  const fileSelected = useTabStore((state) => state.selectedFileId !== null)
  const settingsOpen = useViewStore((state) => state.settingsOpen || state.schedulesOpen)
  return useMemo(
    () => (fileSelected || settingsOpen ? [] : visibleThreads(layout)),
    [layout, fileSelected, settingsOpen],
  )
}
