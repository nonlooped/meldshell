import { useEffect } from "react"
import { create } from "zustand"
import { useTabStore } from "./tab-store"
import { useViewStore } from "./view-store"

/**
 * A phone shows one screen at a time: the inbox, the thread in front, its files and changes, or a
 * file opened from either. Settings and scheduled prompts cover whichever is showing.
 */
export type PhoneScreen = "inbox" | "main" | "files" | "file"

type Entry = Exclude<PhoneScreen, "inbox"> | "views"

/** How far each screen is from the inbox, which is the page's own history entry. */
const depth: Readonly<Record<PhoneScreen, number>> = { inbox: 0, main: 1, files: 2, file: 3 }

const trailOf = (state: unknown): readonly Entry[] =>
  (state as { meldshellPhone?: { trail?: readonly Entry[] } } | null)?.meldshellPhone?.trail ?? []

const screenOf = (trail: readonly Entry[]): PhoneScreen =>
  trail.findLast((entry): entry is Exclude<Entry, "views"> => entry !== "views") ?? "inbox"

/*
 * History traversal is asynchronous while pushing is not, so an entry pushed straight after a
 * programmatic back would land before the traversal does. Pushes wait for it instead.
 */
let traversing: number | undefined
const queued: Array<() => void> = []

function settle() {
  window.clearTimeout(traversing)
  traversing = undefined
  for (const run of queued.splice(0)) run()
}

function unwind(count: number) {
  if (count <= 0) return
  history.go(-count)
  window.clearTimeout(traversing)
  // A traversal the browser drops never reports back; stop waiting for it.
  traversing = window.setTimeout(settle, 400)
}

function push(trail: readonly Entry[]) {
  const run = () => history.pushState({ ...history.state, meldshellPhone: { trail } }, "")
  if (traversing === undefined) run()
  else queued.push(run)
}

interface PhoneNav {
  readonly screen: PhoneScreen
  /** The history entries the phone pushed above the page's own, deepest last. */
  readonly trail: readonly Entry[]
  readonly go: (screen: PhoneScreen) => void
  /** Steps out of the screen in front, as the system back gesture does. */
  readonly back: () => void
}

/**
 * The phone's screens follow the browser history, so the back button, the edge swipe, and the
 * header's back arrow all step out the same way instead of leaving the page.
 */
export const usePhoneNav = create<PhoneNav>((set, get) => ({
  screen: "inbox",
  trail: [],
  go: (screen) => {
    const { trail } = get()
    const next: Entry[] = trail.filter(
      (entry): entry is Exclude<Entry, "views"> =>
        entry !== "views" && depth[entry] < depth[screen],
    )
    if (screen !== "inbox") next.push(screen)
    let common = 0
    while (common < next.length && trail[common] === next[common]) common += 1
    set({ screen, trail: next })
    unwind(trail.length - common)
    for (let index = common; index < next.length; index += 1) push(next.slice(0, index + 1))
    // Leaving settings for a screen beneath them closes them.
    const view = useViewStore.getState()
    if (trail.includes("views") && (view.settingsOpen || view.schedulesOpen))
      view.closeWorkbenchViews()
  },
  back: () => {
    if (get().trail.length > 0) history.back()
    else set({ screen: "inbox" })
  },
}))

/** Settings and scheduled prompts get a history entry of their own, so back closes them. */
function coverViews(covered: boolean) {
  const { trail } = usePhoneNav.getState()
  const shown = trail.at(-1) === "views"
  if (covered && !shown) {
    const next = [...trail, "views" as const]
    usePhoneNav.setState({ trail: next })
    push(next)
  } else if (!covered && shown) {
    usePhoneNav.setState({ trail: trail.slice(0, -1) })
    unwind(1)
  }
}

/**
 * Wires the phone's screens to the browser history and to what the app opens: a thread or file
 * opened from anywhere comes on screen, and closing the last tab returns to the inbox.
 */
export function usePhoneNavigation(phone: boolean): void {
  useEffect(() => {
    if (!phone) return
    // A reload keeps the entries pushed before it; return to the page's own entry first.
    usePhoneNav.setState({ screen: "inbox", trail: [] })
    unwind(trailOf(history.state).length)
    const tabs = useTabStore.getState()
    if (tabs.selectedThreadTabId !== null) usePhoneNav.getState().go("main")
    if (tabs.selectedFileId !== null) usePhoneNav.getState().go("file")
    const view = useViewStore.getState()
    if (view.settingsOpen || view.schedulesOpen) coverViews(true)

    const onPopState = (event: PopStateEvent) => {
      // The phone's own traversal has already set where it lands.
      if (traversing !== undefined) return settle()
      const trail = trailOf(event.state)
      usePhoneNav.setState({ trail, screen: screenOf(trail) })
      // Stepping back from a file puts its thread in front again.
      if (!trail.includes("file") && useTabStore.getState().selectedFileId !== null)
        useTabStore.setState({ selectedFileId: null })
      const views = useViewStore.getState()
      if (!trail.includes("views") && (views.settingsOpen || views.schedulesOpen))
        views.closeWorkbenchViews()
    }
    window.addEventListener("popstate", onPopState)
    const stopTabs = useTabStore.subscribe((state, previous) => {
      const { screen, go } = usePhoneNav.getState()
      if (state.revealed !== previous.revealed) go(state.selectedFileId === null ? "main" : "file")
      // A closed file returns to its thread; with no thread left, to the inbox.
      else if (screen === "file" && state.selectedFileId === null)
        go(state.selectedThreadTabId === null ? "inbox" : "main")
      else if (screen === "main" && state.selectedThreadTabId === null) go("inbox")
    })
    const stopViews = useViewStore.subscribe((state, previous) => {
      const covered = state.settingsOpen || state.schedulesOpen
      if (covered !== (previous.settingsOpen || previous.schedulesOpen)) coverViews(covered)
    })
    return () => {
      window.removeEventListener("popstate", onPopState)
      stopTabs()
      stopViews()
    }
  }, [phone])
}
