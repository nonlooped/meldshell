import {
  centeredStateClasses,
  paneSeparatorClasses,
  railControlClasses,
  railLabelClasses,
  threadContentClasses,
} from "../ui/styles"
import { FadeDiv, MotionPreferences } from "../ui/motion"
import { useAppData } from "../data/queries"
import {
  useWorkspaceActions,
  useThreadManagementActions,
  useImportSessionMutation,
  useCatalogActions,
  useAppSettingsMutation,
} from "../data/mutations"
import { useAppAppearance } from "./appearance"
import { Tabs } from "@base-ui-components/react/tabs"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  cliLabel,
  isCliHarness,
  type AppSnapshot,
  type Provider,
  type Thread,
  type TranscriptSearchResult,
  type Workspace,
} from "@meldshell/contracts"
import type { RunScript, WorkspaceScope } from "@meldshell/contracts/ipc"
import { workspaceScope } from "../data/workspace-scope"
import { AlarmClock, Plus, Settings } from "lucide-react"
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels"
import { FilePalette } from "./FilePalette"
import { IssuePalette } from "./IssuePalette"
import { SessionPalette } from "./SessionPalette"
import { ThreadPalette } from "./ThreadPalette"
import { Inbox } from "../threads/Inbox"
import { FilesSidebar } from "../files/FilesSidebar"
import { selectedSearchText, useContentSearch } from "../files/content-search-store"
import { DiffViewer } from "../files/DiffViewer"
import { FileViewer } from "../files/FileViewer"
import { MeldMark } from "../ui/MeldMark"
import { ProviderIcon } from "../ui/ProviderIcon"
import { relativeAge } from "../ui/relative-age"
import { WorkspaceManager } from "../workspaces/WorkspaceManager"
import { TitleBar } from "./TitleBar"
import { AppScale } from "./AppScale"
import { AppDialog, Button, TextField } from "../ui/controls"
import { ActionToast, ErrorToast } from "../ui/Notice"
import { handleAppShortcut } from "./app-shortcuts"
import { useKeybindings } from "./keybindings"
import { useDictationRequests } from "../threads/dictation-recorder"
import { useLoadoutSwitch } from "../threads/loadout-switch"
import { useTabStore, type FileTab } from "./tab-store"
import { visibleThreads } from "./thread-layout"
import { useViewportTier, type ViewportTier } from "./viewport"
import { useViewStore } from "./view-store"
import { usePhoneNav, usePhoneNavigation, type PhoneScreen } from "./phone-nav"
import { PhoneScreens } from "./PhoneScreens"
import { ThreadWorkbench } from "./ThreadWorkbench"
import { LaunchReveal, LaunchScreen, useLaunch } from "./LaunchScreen"
import { RemoteConnectionNotice } from "./RemoteClientChrome"
import { useThreadDrafts } from "./thread-drafts"
import { useThreadSignals, useWatchedThreadIds } from "./thread-signals"
import { terminalApi, useRunningScripts, useTerminalStore } from "../terminals/terminal-store"
import { useWorkspaceScripts } from "../terminals/workspace-scripts"
import { useOpenInEditor } from "./editors"
import { previewSupported, usePreviewStore } from "../preview/preview-store"
import {
  adoptDraft,
  dockThread,
  popOutAction,
  popOutThread,
  takeHandedOffThread,
  threadWindowsSupported,
  useThreadWindows,
  windowThreadId,
} from "./thread-windows"

import { SchedulesView } from "../schedules/SchedulesView"
import { SettingsView } from "../settings/SettingsView"
import { OnboardingLayer } from "../onboarding/Onboarding"
import { needsOnboarding } from "../onboarding/onboarding-model"

// A freshly created thread stays out of the inbox until it carries work of its own; an issue is
// work of its own, so a thread started from one is never reused as a blank draft.
const isDraftThread = (thread: Thread): boolean =>
  thread.turnCount === 0 && thread.queuedCount === 0 && thread.issue === undefined

/** An issue thread starts with a message ready to send; the issue itself travels with it. */
const prefillIssueDraft = (threadId: string, issue: number | undefined): void => {
  if (issue !== undefined)
    useThreadDrafts.getState().update(threadId, { text: `Resolve issue #${issue}.` })
}

/** The issue picker lists the workspace it was opened for, else the active one, else the latest. */
const pickerWorkspace = (
  workspaces: readonly Workspace[],
  picker: { readonly workspaceId?: string } | null,
  activeWorkspaceId: string,
) =>
  workspaces.find((workspace) => workspace.id === (picker?.workspaceId ?? activeWorkspaceId)) ??
  workspaces[0]

function MutationErrors({
  mutations,
}: {
  mutations: ReadonlyArray<{ error: Error | null; reset: () => void }>
}): React.JSX.Element | null {
  const error = mutations.find((mutation) => mutation.error !== null)?.error
  if (!error) return null
  return (
    <ErrorToast
      message={error.message}
      onDismiss={() => {
        for (const mutation of mutations) mutation.reset()
      }}
    />
  )
}

/** The shortcuts that act on the thread in front, or none of them when no thread is. */
function threadShortcuts(
  thread: Thread | null,
  toggleArchived: (thread: Thread) => void,
  applyLoadout: (threadId: string, slot: number) => void,
): Pick<Parameters<typeof handleAppShortcut>[2], "toggleArchived" | "dictate" | "applyLoadout"> {
  if (thread === null) return { toggleArchived: null, dictate: null, applyLoadout: null }
  return {
    toggleArchived: () => toggleArchived(thread),
    dictate: () => useDictationRequests.getState().toggle(thread.id),
    applyLoadout: (slot) => applyLoadout(thread.id, slot),
  }
}

/** Content only the main window shows; a popped-out window has its one thread instead. */
function MainWindowOnly({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  return windowThreadId === null ? <>{children}</> : null
}

/** An action a popped-out window leaves to the main window, doing nothing there. */
const inMainWindow = (action: () => void): (() => void) =>
  windowThreadId === null ? action : () => undefined

/** The app is already running when a thread pops out, so its window skips the launch screen. */
const windowLaunch = <Launch extends { readonly loading: boolean }>(launch: Launch): Launch =>
  windowThreadId === null ? launch : { ...launch, loading: false }

/** The thread a thread action acts on: none while settings or a file is in front. */
const frontThreadOf = (covered: boolean, file: FileTab | undefined, thread: Thread | null) =>
  covered || file !== undefined ? null : thread

/** Pops the thread in front out, or a popped-out window's thread back into the main window. */
function popOutShortcut(thread: Thread | null): (() => void) | null {
  if (thread === null || !threadWindowsSupported) return null
  const own = windowThreadId
  return own === null ? () => popOutThread(thread) : () => dockThread(own)
}

function ThreadPane({
  databaseError,
  hasThread,
  recent,
  providersByThreadId,
  onNewThread,
  onOpenThread,
  children,
}: {
  databaseError: boolean
  hasThread: boolean
  /** The threads worked on most recently, so the first click lands in one of them. */
  recent: ReadonlyArray<Thread>
  providersByThreadId: ReadonlyMap<string, Provider>
  onNewThread: () => void
  onOpenThread: (threadId: string) => void
  children: React.ReactNode
}): React.JSX.Element {
  if (databaseError)
    return (
      <FadeDiv className={centeredStateClasses}>
        <MeldMark className="brand-mark w-[17px] h-[17px] flex-[0_0_17px] text-[var(--text-primary)]" />
        <h2>MeldShell could not open its local thread database</h2>
        <p>Your threads are still on disk. Restarting the application usually clears this.</p>
      </FadeDiv>
    )
  // A popped-out window holds its thread's place while the thread loads.
  if (!hasThread && windowThreadId === null)
    return (
      <FadeDiv className={centeredStateClasses}>
        <MeldMark className="brand-mark w-[17px] h-[17px] flex-[0_0_17px] text-[var(--text-primary)]" />
        <h2>Choose a thread from the inbox</h2>
        <p>Or start a new conversation in any workspace folder.</p>
        <Button
          variant="primary"
          icon={<Plus size={14} strokeWidth={2.25} />}
          onClick={onNewThread}
        >
          New thread
        </Button>
        {recent.length > 0 && (
          <ul
            className="flex w-[min(360px,_100%)] flex-col m-0 mt-[24px] p-[4px] list-none border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] text-left"
            aria-label="Recent threads"
          >
            {recent.map((thread) => (
              <li key={thread.id}>
                <Button
                  variant="ghost"
                  block
                  className="justify-start! h-[34px]! gap-[10px]! [padding:0_10px]! font-normal!"
                  icon={<ProviderIcon provider={providersByThreadId.get(thread.id)} size={14} />}
                  onClick={() => onOpenThread(thread.id)}
                >
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                    {thread.title}
                  </span>
                  <span className="flex-none text-[var(--text-tertiary)] text-[11px] tabular-nums">
                    {relativeAge(thread.updatedAt)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </FadeDiv>
    )
  return <>{children}</>
}

/**
 * A compact window cannot hold both sidebars beside the thread. Entering one folds the files
 * sidebar away, so the thread keeps the room. A phone shows one screen at a time instead.
 */
function useNarrowPanels(
  tier: ViewportTier,
  files: ReturnType<typeof usePanelRef>,
  animate: (change: () => void) => void,
) {
  useEffect(() => {
    if (tier === "compact") animate(() => files.current?.collapse())
  }, [tier, files, animate])
}

/** Sidebar toggles animate the group's layout; drags and window resizes still apply instantly. */
function usePanelMotion() {
  const groupRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number | undefined>(undefined)
  const animate = useCallback((change: () => void) => {
    const group = groupRef.current
    if (group) {
      group.dataset.panelMotion = ""
      window.clearTimeout(settleTimer.current)
      // Outlasts the transition, which is skipped entirely when motion is reduced.
      settleTimer.current = window.setTimeout(() => delete group.dataset.panelMotion, 400)
    }
    change()
  }, [])
  return { groupRef, animate }
}

/** Where the sidebars cannot share the window, opening one folds the other away. */
function toggleSidebar(
  tier: ViewportTier,
  other: ReturnType<typeof usePanelRef>,
  toggle: () => void,
  animate: (change: () => void) => void,
) {
  animate(() => {
    if (tier !== "regular") other.current?.collapse()
    toggle()
  })
}

/** A sidebar's shortcut on a phone moves to its screen, or back to the tab from there. */
function togglePhoneScreen(current: PhoneScreen, screen: "inbox" | "files"): void {
  usePhoneNav.getState().go(current === screen ? "main" : screen)
}

/** The inbox and files toggles: sidebars beside the thread, or a phone's screens. */
function useSidebarToggles(
  tier: ViewportTier,
  phone: boolean,
  inbox: { panelRef: ReturnType<typeof usePanelRef>; toggle: () => void },
  files: { panelRef: ReturnType<typeof usePanelRef>; toggle: () => void; collapsed: boolean },
  animate: (change: () => void) => void,
) {
  const screen = usePhoneNav((state) => state.screen)
  return {
    toggleInbox: () =>
      phone
        ? togglePhoneScreen(screen, "inbox")
        : toggleSidebar(tier, files.panelRef, inbox.toggle, animate),
    toggleSourceControl: () =>
      phone
        ? togglePhoneScreen(screen, "files")
        : toggleSidebar(tier, inbox.panelRef, files.toggle, animate),
    filesShown: phone ? screen === "files" : !files.collapsed,
  }
}

/** A popped-out thread's window keeps its one thread, even as narrow as a phone. */
const showsPhoneScreens = (tier: ViewportTier): boolean =>
  tier === "phone" && windowThreadId === null

/** On a phone, settings and scheduled prompts carry their own header with the way back. */
const useTitleBarShown = (phone: boolean): boolean =>
  useViewStore((state) => !phone || !(state.settingsOpen || state.schedulesOpen))

/** The app's frame: the title bar's row, unless a phone's settings bring their own header. */
const appFrameClasses = (titleBarShown: boolean): string =>
  [
    "w-full h-full grid text-[var(--text-primary)] text-[13px] leading-[1.45]",
    titleBarShown
      ? "grid-rows-[var(--titlebar-height)_minmax(0,_1fr)]"
      : "grid-rows-[minmax(0,_1fr)]",
    safeAreaClasses,
  ].join(" ")

/** Whether a thread waits on the operator: an approval, a failure, or finished work not yet seen. */
const waitsOnOperator = (thread: Thread, unseenThreadIds: ReadonlySet<string>): boolean =>
  thread.status === "active" &&
  (thread.activity === "approval" || thread.activity === "failed" || unseenThreadIds.has(thread.id))

/** Panel bounds for a window wide enough to show the sidebars beside the thread. */
function panelLayout(tier: ViewportTier, inboxWidth: number, filesWidth: number) {
  switch (tier) {
    case "phone":
    case "compact":
      return {
        inboxMin: "208px",
        inboxMax: "320px",
        filesMin: "220px",
        filesMax: "360px",
        threadMin: "320px",
        inboxWidth: Math.min(inboxWidth, 320),
        filesWidth: Math.min(filesWidth, 360),
      }
    case "regular":
      return {
        inboxMin: "252px",
        inboxMax: "420px",
        filesMin: "240px",
        filesMax: "480px",
        threadMin: "400px",
        inboxWidth,
        filesWidth,
      }
  }
}

/** The collapsed inbox keeps an icon rail: two 8px gutters around the 33px square controls. */
const INBOX_RAIL_WIDTH = "49px"

function useSidebar(
  initialWidth: number,
  initiallyCollapsed = false,
  collapsedSize: string | 0 = 0,
) {
  const panelRef = usePanelRef()
  const elementRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(initialWidth)
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const onResize = (size: { inPixels: number }) => {
    const isCollapsed = panelRef.current?.isCollapsed() ?? size.inPixels === 0
    setCollapsed(isCollapsed)
    // ResizeObserver also reports intermediate animation frames. Only remember settled widths.
    if (!isCollapsed && size.inPixels > 0 && !elementRef.current?.getAnimations().length)
      setWidth(size.inPixels)
  }
  return {
    panelRef,
    elementRef,
    width,
    collapsed,
    defaultSize: collapsed ? collapsedSize : `${width}px`,
    onResize,
    onTransitionEnd: (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && event.propertyName === "flex-grow") {
        const size = panelRef.current?.getSize()
        if (size) onResize(size)
      }
    },
    toggle: () => {
      if (panelRef.current?.isCollapsed()) panelRef.current.resize(width)
      else panelRef.current?.collapse()
    },
  }
}

/** The collapsed inbox narrows to its icon rail. */
function useInboxSidebar() {
  const sidebar = useSidebar(304, false, INBOX_RAIL_WIDTH)
  return {
    ...sidebar,
    collapsedSize: INBOX_RAIL_WIDTH,
    rail: sidebar.collapsed,
    asideProps: {
      className:
        "motion-colors motion-duration-220 group/inbox grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)_auto_auto] [padding:10px_8px_8px]",
      "data-rail": sidebar.collapsed ? "" : undefined,
    },
  }
}

/**
 * A phone's notch and rounded corners keep clear of the app's controls. Each screen keeps its own
 * bottom controls above the home indicator, so lists can still scroll beneath it.
 */
const safeAreaClasses =
  "[padding:env(safe-area-inset-top,_0px)_env(safe-area-inset-right,_0px)_0_env(safe-area-inset-left,_0px)]"

/** On a phone the inbox is a screen of its own, with room to breathe around its rows. */
const phoneInboxClasses =
  "group/inbox grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)_auto_auto] [padding:12px_12px_max(8px,_env(safe-area-inset-bottom))]"

function InboxFooter({
  rail,
  onOpenSettings,
  onOpenSchedules,
}: {
  rail: boolean
  onOpenSettings: () => void
  onOpenSchedules: () => void
}) {
  return (
    <div className="flex flex-col [padding:8px_0_0] mt-[4px] border-t-[1px] border-t-[color:var(--line-subtle)] [&_.button]:h-[42px] [&_.button]:pr-[12px] [&_.button]:pl-[8px]">
      <Button
        variant="ghost"
        block
        icon={<AlarmClock size={15} strokeWidth={1.75} className="shrink-0" />}
        className={`justify-start! overflow-hidden ${railControlClasses}`}
        title={rail ? "Scheduled prompts" : undefined}
        onClick={onOpenSchedules}
      >
        <span className={railLabelClasses}>Scheduled prompts</span>
      </Button>
      <Button
        variant="ghost"
        block
        icon={<Settings size={15} strokeWidth={1.75} className="shrink-0" />}
        className={`justify-start! overflow-hidden ${railControlClasses}`}
        title={rail ? "Settings" : undefined}
        onClick={onOpenSettings}
      >
        <span className={railLabelClasses}>Settings</span>
      </Button>
    </div>
  )
}

function WorkspaceView({
  snapshot,
  schedulesOpen,
  children,
}: {
  readonly snapshot: AppSnapshot
  readonly schedulesOpen: boolean
  readonly children: React.ReactNode
}): React.JSX.Element {
  return schedulesOpen ? <SchedulesView snapshot={snapshot} /> : <>{children}</>
}

function SidebarPanel({ defaultSize, ...props }: React.ComponentProps<typeof Panel>) {
  // Changing defaultSize re-registers the panel and interrupts an active drag.
  // Capture it on mount so returning from Settings still restores the remembered width.
  const [initialSize] = useState(defaultSize)
  // The library's inline `overflow: auto` outranks classes; content keeps its width while the panel
  // animates, so clip it instead of letting a scrollbar appear.
  return <Panel {...props} defaultSize={initialSize} style={{ overflow: "hidden" }} />
}

function tabScope(file: FileTab | undefined, thread: Thread | null): WorkspaceScope | undefined {
  if (file) return { workspaceId: file.workspaceId, threadId: file.threadId }
  return thread === null ? undefined : workspaceScope(thread)
}

/** The thread a diff's line notes go to: its worktree's thread, or the open thread sharing its folder. */
function reviewThreadId(file: FileTab, thread: Thread | null): string | undefined {
  if (file.threadId !== undefined) return file.threadId
  return thread?.workspaceId === file.workspaceId && thread.worktree === undefined
    ? thread.id
    : undefined
}

function FileContent({ file, thread }: { file: FileTab; thread: Thread | null }) {
  return file.diffSide ? (
    <DiffViewer
      key={file.id}
      file={file}
      side={file.diffSide}
      reviewThreadId={reviewThreadId(file, thread)}
    />
  ) : (
    <FileViewer key={file.id} file={file} />
  )
}

function FileOrThread({
  file,
  thread,
  children,
}: {
  file?: FileTab
  thread: Thread | null
  children: React.ReactNode
}) {
  if (!file) return <>{children}</>
  return (
    <Tabs.Panel render={<FadeDiv />} value={file.id} className={threadContentClasses}>
      <FileContent file={file} thread={thread} />
    </Tabs.Panel>
  )
}

/** A phone's open file, which stays on screen while it slides away after the file is left. */
function PhoneFile({ file, thread }: { file?: FileTab; thread: Thread | null }) {
  const [shown, setShown] = useState(file)
  if (file !== undefined && file !== shown) setShown(file)
  if (shown === undefined) return null
  return (
    <main className={threadContentClasses}>
      <FileContent file={shown} thread={thread} />
    </main>
  )
}

function useSelectedTab() {
  const selectedThreadTabId = useTabStore((state) => state.selectedThreadTabId)
  const files = useTabStore((state) => state.files)
  const selectedFileId = useTabStore((state) => state.selectedFileId)
  return {
    selectedFile: files.find((file) => file.id === selectedFileId),
    selectedTabId: selectedFileId ?? selectedThreadTabId,
  }
}

function DeleteWorktreeNote({ thread }: { thread: Thread | null }): React.JSX.Element | null {
  const worktree = thread?.worktree
  if (worktree === undefined || worktree.state === "removed") return null
  return (
    <p>
      Its worktree folder is removed too. The branch <code>{worktree.branch}</code> and its commits
      are kept.
    </p>
  )
}

/** The CLI that can continue a thread's latest harness session, or null when it has none. */
const threadCli = (thread: Thread | undefined): string | null =>
  thread !== undefined && thread.lastHarness !== undefined && isCliHarness(thread.lastHarness)
    ? cliLabel(thread.lastHarness)
    : null

/**
 * The title bar's terminal toggle and Run button for the thread on screen. `shown` is null without
 * one, and `runScripts` is empty unless its workspace has run scripts.
 */
const noRunScripts: readonly RunScript[] = []

function useTerminalToggle(
  closeWorkbenchViews: () => void,
  selectTab: (id: string) => void,
  threads: readonly Thread[],
) {
  const threadOnScreen = useTabStore(
    (state) => state.selectedFileId === null && state.selectedThreadId !== null,
  )
  const selectedThreadId = useTabStore((state) => state.selectedThreadId)
  const open = useTerminalStore((state) =>
    selectedThreadId === null ? false : state.threads[selectedThreadId]?.open === true,
  )
  const thread = threads.find((candidate) => candidate.id === selectedThreadId)
  const workspaceId = thread?.workspaceId
  const scripts = useWorkspaceScripts(terminalApi === undefined ? undefined : workspaceId)
  const withThread = useCallback(
    (action: (threadId: string) => void): void => {
      const { selectedThreadId: threadId, selectedThreadTabId } = useTabStore.getState()
      if (terminalApi === undefined || threadId === null || selectedThreadTabId === null) return
      closeWorkbenchViews()
      selectTab(selectedThreadTabId)
      action(threadId)
    },
    [closeWorkbenchViews, selectTab],
  )
  const toggle = useCallback(
    () => withThread((threadId) => useTerminalStore.getState().toggle(threadId)),
    [withThread],
  )
  const run = useCallback(
    (name: string) => withThread((threadId) => useTerminalStore.getState().run(threadId, name)),
    [withThread],
  )
  const stopRun = useCallback((name: string) => {
    const { selectedThreadId: threadId } = useTabStore.getState()
    if (threadId !== null) useTerminalStore.getState().stopRun(threadId, name)
  }, [])
  const continueInCli = useCallback(
    () => withThread((threadId) => useTerminalStore.getState().continueInCli(threadId)),
    [withThread],
  )
  const shown = terminalApi === undefined || !threadOnScreen ? null : open
  const running = useRunningScripts(shown === null ? null : selectedThreadId)
  return {
    shown,
    toggle,
    runScripts: shown === null ? noRunScripts : (scripts.data?.run ?? noRunScripts),
    running,
    run,
    stopRun,
    /** The CLI that can continue the thread on screen in its terminal. */
    cli: shown === null ? null : threadCli(thread),
    continueInCli,
  }
}

/** Whether the editor opens the thread's own worktree or the shared workspace folder. */
const editorFolder = (thread: Thread | undefined): "worktree" | "workspace" =>
  thread?.worktree !== undefined && thread.worktree.state !== "removed" ? "worktree" : "workspace"

/** The title bar's preview toggle for the thread on screen; `shown` is null without one. */
function usePreviewToggle(closeWorkbenchViews: () => void, selectTab: (id: string) => void) {
  const threadOnScreen = useTabStore(
    (state) => state.selectedFileId === null && state.selectedThreadId !== null,
  )
  const selectedThreadId = useTabStore((state) => state.selectedThreadId)
  const open = usePreviewStore((state) =>
    selectedThreadId === null ? false : state.threads[selectedThreadId]?.open === true,
  )
  const toggle = useCallback(() => {
    const { selectedThreadId: threadId, selectedThreadTabId } = useTabStore.getState()
    if (!previewSupported || threadId === null || selectedThreadTabId === null) return
    closeWorkbenchViews()
    selectTab(selectedThreadTabId)
    usePreviewStore.getState().toggle(threadId)
  }, [closeWorkbenchViews, selectTab])
  return { shown: !previewSupported || !threadOnScreen ? null : open, toggle }
}

/**
 * A fresh install opens the first-run guide once, as the launch screen gives way. Returns whether
 * the app stays hidden behind the launch screen or the guide.
 */
function useFirstRun(launching: boolean, loaded: boolean, snapshot: AppSnapshot): boolean {
  const open = useViewStore((state) => state.onboardingOpen)
  const decided = useRef(false)
  // A popped-out thread's window leaves the guide to the main window.
  const firstRun = loaded && windowThreadId === null && needsOnboarding(snapshot)
  useEffect(() => {
    if (launching || !loaded || decided.current) return
    decided.current = true
    if (firstRun) useViewStore.getState().openOnboarding()
  }, [launching, loaded, firstRun])
  return launching || open
}

/** A thread popped out from this window leaves its tabs; its own window shows it now. */
function useDetachedThreadsLeave(closeThread: (threadId: string) => void): void {
  useEffect(
    () =>
      useThreadWindows.subscribe(({ detached }) => {
        for (const id of detached) if (id !== windowThreadId) closeThread(id)
      }),
    [closeThread],
  )
}

/**
 * The threads whose chimes this window plays: a popped-out window plays its own thread's, and the
 * main window every other thread's.
 */
function useSignalThreads(threads: readonly Thread[]): readonly Thread[] {
  const detached = useThreadWindows((state) => state.detached)
  return useMemo(
    () =>
      threads.filter((thread) =>
        windowThreadId === null ? !detached.has(thread.id) : thread.id === windowThreadId,
      ),
    [threads, detached],
  )
}

/**
 * A popped-out window shows its one thread: it opens the thread with the draft the main window
 * handed off, and closes once its last pane closes or the thread is deleted.
 */
function usePoppedOutThread(
  threads: readonly Thread[],
  queriesLoaded: readonly boolean[],
): readonly Thread[] {
  const loaded = queriesLoaded.every(Boolean)
  const [seed] = useState(() =>
    windowThreadId === null ? null : takeHandedOffThread(windowThreadId),
  )
  useEffect(() => {
    if (windowThreadId === null) return
    adoptDraft(windowThreadId)
    useTabStore.getState().openThread(windowThreadId)
    return useTabStore.subscribe((state) => {
      if (state.threadTabs.length === 0) window.close()
    })
  }, [])
  const thread = threads.find((candidate) => candidate.id === windowThreadId) ?? null
  const seen = useRef(false)
  useEffect(() => {
    if (windowThreadId === null || !loaded) return
    if (thread !== null) seen.current = true
    // Gone after it was listed, or never there to begin with: the thread was deleted.
    else if (seen.current || seed === null) window.close()
  }, [thread, loaded, seed])
  useEffect(() => {
    if (thread !== null) document.title = `${thread.title} · MeldShell`
  }, [thread])
  return useMemo(() => (seed === null ? [] : [seed]), [seed])
}

export function App(): React.JSX.Element {
  const openThreadIds = useTabStore((state) => state.openThreadIds)
  const selectedThreadId = useTabStore((state) => state.selectedThreadId)
  const openThread = useTabStore((state) => state.openThread)
  const openFile = useTabStore((state) => state.openFile)
  const closeThread = useTabStore((state) => state.closeTab)
  const openBeside = useTabStore((state) => state.openBeside)
  const { selectedFile, selectedTabId } = useSelectedTab()
  const selectThread = useTabStore((state) => state.selectTab)
  const cycleTabs = useTabStore((state) => state.cycle)
  const removeThread = useTabStore((state) => state.closeThread)

  const settingsOpen = useViewStore((state) => state.settingsOpen)
  const openSettings = useViewStore((state) => state.openSettings)
  const closeWorkbenchViews = useViewStore((state) => state.closeWorkbenchViews)
  const schedulesOpen = useViewStore((state) => state.schedulesOpen)
  const openSchedules = useViewStore((state) => state.openSchedules)
  const workbenchCovered = useViewStore((state) => state.settingsOpen || state.schedulesOpen)
  const issuePicker = useViewStore((state) => state.issuePicker)
  const sessionPicker = useViewStore((state) => state.sessionPicker)

  const [workspacesOpen, setWorkspacesOpen] = useState(false)
  const [threadPaletteOpen, setThreadPaletteOpen] = useState(false)
  const [searchTarget, setSearchTarget] = useState<TranscriptSearchResult | null>(null)
  const [searchThreads, setSearchThreads] = useState<ReadonlyArray<Thread>>([])
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null)
  const [renameTarget, setRenameTarget] = useState<Thread | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [filePaletteOpen, setFilePaletteOpen] = useState(false)
  const tier = useViewportTier()
  const phone = showsPhoneScreens(tier)
  const titleBarShown = useTitleBarShown(phone)
  const inbox = useInboxSidebar()
  // Source control opens on request: the thread pane owns the window until the operator asks.
  const sourceControl = useSidebar(300, true)
  const panelMotion = usePanelMotion()
  useNarrowPanels(tier, sourceControl.panelRef, panelMotion.animate)
  usePhoneNavigation(phone)
  const layout = panelLayout(tier, inbox.width, sourceControl.width)

  const { snapshotQuery, threadPagesQuery, snapshot } = useAppData()
  const launch = windowLaunch(useLaunch(!snapshotQuery.isPending, snapshot.providers))
  const appHidden = useFirstRun(launch.loading, snapshotQuery.isSuccess, snapshot)

  const {
    pinMutation,
    createThreadMutation,
    setStatusMutation,
    renameThreadMutation,
    deleteThreadMutation,
  } = useThreadManagementActions(snapshot, {
    created: (threadId, input) => {
      if (threadId === undefined) return
      prefillIssueDraft(threadId, input.issue)
      openThread(threadId)
    },
    deleted: (threadId) => {
      removeThread(threadId)
      useTerminalStore.getState().forget(threadId)
      usePreviewStore.getState().forget(threadId)
      useThreadDrafts.getState().forget(threadId)
      setSearchThreads((threads) => threads.filter((thread) => thread.id !== threadId))
      setDeleteTarget(null)
    },
  })
  const {
    addWorkspaceMutation,
    manageAddWorkspaceMutation,
    renameWorkspaceMutation,
    removeWorkspaceMutation,
  } = useWorkspaceActions(snapshot, {
    added: (workspaceId) => createThreadMutation.mutate({ workspaceId }),
    removed: (workspaceId, threadIds) => {
      for (const id of threadIds) {
        removeThread(id)
        useTerminalStore.getState().forget(id)
        usePreviewStore.getState().forget(id)
        useThreadDrafts.getState().forget(id)
      }
      setSearchThreads((threads) => threads.filter((thread) => thread.workspaceId !== workspaceId))
      setSearchTarget(null)
    },
  })
  const importSessionMutation = useImportSessionMutation((threadId) => {
    closeWorkbenchViews()
    openThread(threadId)
  })
  const { updateProviderMutation, upsertModelMutation, deleteModelMutation, resetCatalogMutation } =
    useCatalogActions()
  const appSettingsMutation = useAppSettingsMutation()
  const loadoutSwitch = useLoadoutSwitch(snapshot)

  useAppAppearance(snapshot.settings)

  useEffect(
    () =>
      window.meldshell.onOpenAttention((threadId) => {
        closeWorkbenchViews()
        openThread(threadId)
      }),
    [closeWorkbenchViews, openThread],
  )
  useDetachedThreadsLeave(removeThread)

  // Memoised because the Ctrl+N handler lists it as an effect dependency; without a stable identity
  // the keyboard listener would be torn down and re-registered on every render.
  const requestNewThread = useCallback((): void => {
    closeWorkbenchViews()
    // Reuse an empty solo draft, but leave drafts inside shared layouts in place.
    const sharedThreadIds = new Set(
      useTabStore
        .getState()
        .threadTabs.flatMap((tab) =>
          tab.layout.kind === "split" ? visibleThreads(tab.layout) : [],
        ),
    )
    const draftThread = snapshot.threads.find(
      (thread) =>
        isDraftThread(thread) &&
        !sharedThreadIds.has(thread.id) &&
        thread.status === "active" &&
        snapshot.workspaces.some((workspace) => workspace.id === thread.workspaceId),
    )
    if (draftThread !== undefined) {
      openThread(draftThread.id)
      return
    }
    // The draft's workspace line can move it, so it starts in the most recently used workspace.
    const workspace = snapshot.workspaces[0]
    if (workspace === undefined) addWorkspaceMutation.mutate()
    else createThreadMutation.mutate({ workspaceId: workspace.id })
  }, [
    addWorkspaceMutation,
    closeWorkbenchViews,
    createThreadMutation,
    openThread,
    snapshot.threads,
    snapshot.workspaces,
  ])

  const terminal = useTerminalToggle(closeWorkbenchViews, selectThread, snapshot.threads)
  const preview = usePreviewToggle(closeWorkbenchViews, selectThread)

  const pagedThreads = threadPagesQuery.data?.pages.flatMap((page) => page.threads) ?? []
  const poppedOutSeeds = usePoppedOutThread(
    [...snapshot.threads, ...pagedThreads],
    [snapshotQuery.isSuccess, threadPagesQuery.isSuccess],
  )
  const threadMap = new Map(
    [...poppedOutSeeds, ...searchThreads, ...pagedThreads].map((thread) => [thread.id, thread]),
  )
  for (const thread of snapshot.threads) threadMap.set(thread.id, thread)
  const allThreads = [...threadMap.values()]
    .filter((thread) =>
      snapshot.workspaces.some((workspace) => workspace.id === thread.workspaceId),
    )
    .sort((left, right) => {
      if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1
      if (left.status !== right.status) return left.status === "active" ? -1 : 1
      return right.updatedAt.localeCompare(left.updatedAt)
    })
  const inboxThreads = allThreads.filter((thread) => !isDraftThread(thread))
  const workspaceById = new Map(snapshot.workspaces.map((workspace) => [workspace.id, workspace]))
  const providerById = new Map(snapshot.providers.map((provider) => [provider.id, provider]))
  const providersByThreadId = new Map(
    snapshot.threadSettings.flatMap((settings) => {
      const provider = providerById.get(settings.providerId)
      return provider === undefined ? [] : ([[settings.threadId, provider]] as const)
    }),
  )
  const workspaceNames = new Map(
    snapshot.workspaces.map((workspace) => [workspace.id, workspace.name]),
  )
  const selectedThread = allThreads.find((thread) => thread.id === selectedThreadId) ?? null
  const frontThread = frontThreadOf(workbenchCovered, selectedFile, selectedThread)
  const unseenThreadIds = useThreadSignals(
    useSignalThreads(snapshot.threads),
    useWatchedThreadIds(),
    snapshot.settings.sounds ?? true,
  )
  // The taskbar counts the threads waiting on the operator: approvals, failures, and finished work
  // they have not looked at. The main window owns the badge.
  const waitingThreads = snapshot.threads.filter((thread) =>
    waitsOnOperator(thread, unseenThreadIds),
  )
  const attentionCount = windowThreadId === null ? waitingThreads.length : null
  useEffect(() => {
    if (attentionCount !== null) window.meldshell.desktop?.setAttention?.(attentionCount)
  }, [attentionCount])
  const activeScope = tabScope(selectedFile, selectedThread)
  const activeWorkspaceId = activeScope?.workspaceId ?? ""
  const worktreeThread =
    activeScope?.threadId === undefined
      ? undefined
      : allThreads.find((thread) => thread.id === activeScope.threadId)
  const editor = useOpenInEditor(
    workbenchCovered ? undefined : activeScope,
    snapshot.settings.editor,
    appSettingsMutation.mutate,
  )
  const [archivedThread, setArchivedThread] = useState<Thread | null>(null)
  const dismissArchived = useCallback(() => setArchivedThread(null), [])
  const toggleArchived = (thread: Thread) => {
    const archiving = thread.status === "active"
    setStatusMutation.mutate(
      { threadId: thread.id, status: archiving ? "settled" : "active" },
      {
        onSuccess: () => {
          if (archiving) removeThread(thread.id)
          setArchivedThread(archiving ? thread : null)
        },
      },
    )
  }
  // A phone has no sidebars to fold: the same toggles move between its screens.
  const { toggleInbox, toggleSourceControl, filesShown } = useSidebarToggles(
    tier,
    phone,
    inbox,
    sourceControl,
    panelMotion.animate,
  )

  const keybindingOverrides = snapshot.settings.keybindings
  useEffect(() => {
    useKeybindings.getState().setOverrides(keybindingOverrides)
  }, [keybindingOverrides])
  // The listener stays registered; each render hands it the current actions.
  const shortcutActions = useRef<Parameters<typeof handleAppShortcut>[2] | null>(null)
  useEffect(() => {
    // A popped-out window shows its own thread only; the main window starts and finds threads.
    const inMain = inMainWindow
    shortcutActions.current = {
      settingsOpen: workbenchCovered,
      closeSettings: closeWorkbenchViews,
      requestNewThread: inMain(requestNewThread),
      openThreadPalette: inMain(() => setThreadPaletteOpen(true)),
      openFilePalette: () => setFilePaletteOpen(true),
      searchFiles: () => {
        closeWorkbenchViews()
        if (!filesShown) toggleSourceControl()
        useContentSearch.getState().openSearch(selectedSearchText())
      },
      openIssuePicker: inMain(() => useViewStore.getState().openIssuePicker()),
      openSettings: inMain(() => openSettings()),
      selectedThreadId: selectedTabId,
      closeThread,
      cycleTabs: (direction) => {
        closeWorkbenchViews()
        cycleTabs(direction)
      },
      toggleInbox: inMain(toggleInbox),
      toggleSourceControl,
      toggleTerminal: terminal.toggle,
      togglePreview: preview.toggle,
      openInEditor: () => editor.open(),
      ...threadShortcuts(frontThread, toggleArchived, loadoutSwitch.apply),
      popOutThread: popOutShortcut(frontThread),
      focusComposer:
        frontThread === null ? null : () => useViewStore.getState().focusComposer(frontThread.id),
      nextPane:
        useTabStore.getState().layout?.kind === "split" ? useTabStore.getState().cyclePane : null,

      loadoutCount: loadoutSwitch.count,
    }
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // The first-run guide owns the window; shortcuts would act on the app hidden behind it.
      if (shortcutActions.current !== null && !useViewStore.getState().onboardingOpen)
        handleAppShortcut(event, useKeybindings.getState().bindings, shortcutActions.current)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
  const openThreads = openThreadIds.flatMap((id) => {
    const thread = allThreads.find((candidate) => candidate.id === id)
    return thread === undefined ? [] : [thread]
  })

  // The inbox, the tab area, and the files sidebar sit side by side, or on a phone one at a time.
  const inboxContent = (rail: boolean) => (
    <>
      <Inbox
        rail={rail}
        showSettled={snapshot.settings.showSettled ?? true}
        onSearch={() => setThreadPaletteOpen(true)}
        onManageWorkspaces={() => setWorkspacesOpen(true)}
        onPin={(thread) => pinMutation.mutate(thread)}
        threads={inboxThreads}
        workspaces={snapshot.workspaces}
        workspaceNames={workspaceNames}
        providersByThreadId={providersByThreadId}
        selectedThreadId={selectedThreadId}
        unseenThreadIds={unseenThreadIds}
        onNewThread={requestNewThread}
        onNewThreadInWorkspace={(workspaceId) => createThreadMutation.mutate({ workspaceId })}
        onRename={(thread) => {
          setRenameTarget(thread)
          setRenameTitle(thread.title)
        }}
        onAddWorkspace={() => addWorkspaceMutation.mutate()}
        onOpen={(threadId) => {
          closeWorkbenchViews()
          openThread(threadId)
        }}
        onOpenBeside={(threadId, edge) => {
          closeWorkbenchViews()
          openBeside(threadId, edge)
        }}
        onPopOut={popOutAction}
        onSetStatus={toggleArchived}
        onDelete={setDeleteTarget}
        canLoadMore={threadPagesQuery.hasNextPage}
        loadingMore={threadPagesQuery.isFetchingNextPage}
        onLoadMore={() => void threadPagesQuery.fetchNextPage()}
      />

      <InboxFooter
        rail={rail}
        onOpenSettings={() => openSettings()}
        onOpenSchedules={openSchedules}
      />
    </>
  )
  const threadContent = (
    <ThreadPane
      databaseError={snapshotQuery.isError}
      hasThread={selectedThread !== null}
      recent={inboxThreads.filter((thread) => thread.status === "active").slice(0, 3)}
      providersByThreadId={providersByThreadId}
      onNewThread={requestNewThread}
      onOpenThread={openThread}
    >
      <ThreadWorkbench snapshot={snapshot} threads={allThreads} searchTarget={searchTarget} />
    </ThreadPane>
  )
  const mainClasses = "grid h-full min-w-0 min-h-0 grid-rows-[minmax(0,_1fr)_auto]"
  const filesContent = (
    <FilesSidebar
      threadId={selectedThread?.id}
      key={`${activeWorkspaceId}:${activeScope?.threadId ?? ""}`}
      workspace={workspaceById.get(activeWorkspaceId)}
      scope={activeScope}
      worktreeThread={worktreeThread}
    />
  )

  return (
    <MotionPreferences reduceMotion={snapshot.settings.reduceMotion ?? false}>
      {/* The app and the launch screen crossfade over one shared backdrop. */}
      <div className="relative w-full h-full bg-[var(--scrim)]">
        <LaunchReveal loading={appHidden}>
          <Tabs.Root
            className={appFrameClasses(titleBarShown)}
            value={selectedTabId}
            onValueChange={(value) => {
              if (typeof value === "string") {
                closeWorkbenchViews()
                selectThread(value)
              }
            }}
          >
            <AppScale />
            <TitleBar
              shown={titleBarShown}
              openThreads={openThreads}
              providersByThreadId={providersByThreadId}
              selectedTabId={selectedTabId}
              onCloseTab={closeThread}
              onSelectTab={(tabId) => {
                closeWorkbenchViews()
                selectThread(tabId)
              }}
              sidebarsVisible={!workbenchCovered}
              onPopOutThread={popOutThread}
              onThreadWindow={popOutShortcut(frontThread)}
              inboxCollapsed={inbox.collapsed}
              sourceControlCollapsed={sourceControl.collapsed}
              onToggleInbox={toggleInbox}
              onToggleSourceControl={toggleSourceControl}
              terminalShown={terminal.shown}
              onToggleTerminal={terminal.toggle}
              runScripts={terminal.runScripts}
              runningScripts={terminal.running}
              onRun={terminal.run}
              onStopRun={terminal.stopRun}
              previewShown={preview.shown}
              onTogglePreview={preview.toggle}
              editors={editor.editors}
              editorFolder={editorFolder(worktreeThread)}
              onOpenInEditor={editor.open}
              cli={terminal.cli}
              onOpenInCli={terminal.continueInCli}
              waitingCount={
                waitingThreads.filter((thread) => thread.id !== selectedThreadId).length
              }
            />

            {settingsOpen ? (
              <SettingsView
                snapshot={snapshot}
                settingsPending={appSettingsMutation.isPending}
                settingsError={appSettingsMutation.error?.message ?? null}
                sidebarWidth={inbox.width}
                onUpdateProvider={(providerId, patch) =>
                  updateProviderMutation.mutate({ providerId, ...patch })
                }
                onUpsertModel={(input) => upsertModelMutation.mutate(input)}
                onDeleteModel={(modelId) => deleteModelMutation.mutate(modelId)}
                onResetCatalog={(providerId) => resetCatalogMutation.mutate(providerId)}
                onChangeAppSettings={(input) => appSettingsMutation.mutate(input)}
              />
            ) : (
              <WorkspaceView snapshot={snapshot} schedulesOpen={schedulesOpen}>
                {phone ? (
                  <PhoneScreens
                    screens={{
                      inbox: <aside className={phoneInboxClasses}>{inboxContent(false)}</aside>,
                      main: <main className={mainClasses}>{threadContent}</main>,
                      files: filesContent,
                      file: <PhoneFile file={selectedFile} thread={selectedThread} />,
                    }}
                  />
                ) : (
                  <Group
                    elementRef={panelMotion.groupRef}
                    className="motion-panels motion-duration-220 min-h-0"
                    orientation="horizontal"
                  >
                    <MainWindowOnly>
                      <SidebarPanel
                        id="inbox"
                        panelRef={inbox.panelRef}
                        elementRef={inbox.elementRef}
                        onTransitionEnd={inbox.onTransitionEnd}
                        collapsible
                        collapsedSize={inbox.collapsedSize}
                        // The rail's controls size against the panel's live width, so they track its edge.
                        className="@container"
                        defaultSize={inbox.defaultSize}
                        minSize={layout.inboxMin}
                        maxSize={layout.inboxMax}
                        groupResizeBehavior="preserve-pixel-size"
                        onResize={inbox.onResize}
                      >
                        <aside {...inbox.asideProps} style={{ width: layout.inboxWidth }}>
                          {inboxContent(inbox.rail)}
                        </aside>
                      </SidebarPanel>
                      <Separator className={`motion-colors ${paneSeparatorClasses}`} />
                    </MainWindowOnly>

                    <Panel id="thread" minSize={layout.threadMin}>
                      <main className={mainClasses}>
                        <FileOrThread file={selectedFile} thread={selectedThread}>
                          {threadContent}
                        </FileOrThread>
                      </main>
                    </Panel>
                    <Separator className={`motion-colors ${paneSeparatorClasses}`} />
                    <SidebarPanel
                      id="source-control"
                      panelRef={sourceControl.panelRef}
                      elementRef={sourceControl.elementRef}
                      onTransitionEnd={sourceControl.onTransitionEnd}
                      collapsible
                      collapsedSize={0}
                      inert={sourceControl.collapsed}
                      defaultSize={sourceControl.defaultSize}
                      minSize={layout.filesMin}
                      maxSize={layout.filesMax}
                      groupResizeBehavior="preserve-pixel-size"
                      onResize={sourceControl.onResize}
                    >
                      <div
                        className={`motion-colors motion-duration-220 h-full ${sourceControl.collapsed ? "opacity-0" : ""}`}
                        style={{ width: layout.filesWidth }}
                      >
                        {filesContent}
                      </div>
                    </SidebarPanel>
                  </Group>
                )}
              </WorkspaceView>
            )}

            {archivedThread !== null && (
              <ActionToast
                key={archivedThread.id}
                message={`Archived “${archivedThread.title}”`}
                actionLabel="Undo"
                onAction={() => {
                  setStatusMutation.mutate({ threadId: archivedThread.id, status: "active" })
                  setArchivedThread(null)
                }}
                onDismiss={dismissArchived}
              />
            )}
            <MutationErrors
              mutations={[
                pinMutation,
                setStatusMutation,
                deleteThreadMutation,
                addWorkspaceMutation,
                createThreadMutation,
                editor.mutation,
                ...loadoutSwitch.errors,
              ]}
            />
            <AppDialog
              open={workspacesOpen}
              onOpenChange={setWorkspacesOpen}
              title="Manage workspaces"
              actions={<Button onClick={() => setWorkspacesOpen(false)}>Done</Button>}
            >
              <div className="workspace-manager max-h-[calc(var(--viewport-h)_*_0.6)] [padding:0_20px] overflow-y-auto [scrollbar-gutter:stable]">
                <WorkspaceManager
                  workspaces={snapshot.workspaces}
                  onAdd={() => manageAddWorkspaceMutation.mutateAsync()}
                  onRename={(workspaceId, name) =>
                    renameWorkspaceMutation.mutateAsync({ workspaceId, name })
                  }
                  onRemove={(workspaceId) => removeWorkspaceMutation.mutateAsync(workspaceId)}
                />
              </div>
            </AppDialog>
            <ThreadPalette
              open={threadPaletteOpen}
              onOpenChange={setThreadPaletteOpen}
              threads={allThreads}
              workspaces={snapshot.workspaces}
              onOpenThread={(threadId) => {
                closeWorkbenchViews()
                openThread(threadId)
              }}
              onOpenMatch={(result) => {
                setSearchThreads((threads) => [
                  ...threads.filter((thread) => thread.id !== result.thread.id),
                  result.thread,
                ])
                setSearchTarget(result)
                closeWorkbenchViews()
                openThread(result.thread.id)
              }}
            />
            <FilePalette
              open={filePaletteOpen}
              onOpenChange={setFilePaletteOpen}
              workspaces={snapshot.workspaces}
              activeScope={activeScope}
              onOpenFile={(scope, path) => {
                closeWorkbenchViews()
                openFile(scope, path)
              }}
            />

            <IssuePalette
              open={issuePicker !== null}
              onOpenChange={(open) => {
                if (!open) useViewStore.getState().closeIssuePicker()
              }}
              workspace={pickerWorkspace(snapshot.workspaces, issuePicker, activeWorkspaceId)}
              onStart={(workspaceId, issue) =>
                createThreadMutation
                  .mutateAsync({ workspaceId, issue: issue.number })
                  .then(closeWorkbenchViews, (error: unknown) => {
                    // The picker shows the error itself, so the app-wide toast stays away.
                    createThreadMutation.reset()
                    throw error
                  })
              }
            />
            <SessionPalette
              open={sessionPicker !== null}
              onOpenChange={(open) => {
                if (!open) useViewStore.getState().closeSessionPicker()
              }}
              workspace={pickerWorkspace(snapshot.workspaces, sessionPicker, activeWorkspaceId)}
              onImport={(workspaceId, session) =>
                importSessionMutation.mutateAsync({
                  workspaceId,
                  harness: session.harness,
                  nativeThreadId: session.nativeThreadId,
                })
              }
            />

            <AppDialog
              open={renameTarget !== null}
              onOpenChange={(open) => {
                if (!open && !renameThreadMutation.isPending) setRenameTarget(null)
              }}
              title="Rename thread"
              actions={
                <>
                  <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
                  <Button
                    variant="primary"
                    disabled={!renameTitle.trim() || renameThreadMutation.isPending}
                    onClick={() => {
                      if (renameTarget)
                        renameThreadMutation.mutate(
                          { threadId: renameTarget.id, title: renameTitle.trim() },
                          { onSuccess: () => setRenameTarget(null) },
                        )
                    }}
                  >
                    Save name
                  </Button>
                </>
              }
            >
              <TextField
                autoFocus
                label="Thread name"
                value={renameTitle}
                maxLength={100}
                onValueChange={setRenameTitle}
              />
              {renameThreadMutation.isError && (
                <p role="alert">{renameThreadMutation.error.message}</p>
              )}
            </AppDialog>
            <AppDialog
              alert
              open={deleteTarget !== null}
              onOpenChange={(open) => {
                if (!open) setDeleteTarget(null)
              }}
              title="Delete this thread permanently?"
              actions={
                <>
                  <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
                  <Button
                    variant="danger"
                    disabled={deleteThreadMutation.isPending}
                    onClick={() => {
                      if (deleteTarget !== null) deleteThreadMutation.mutate(deleteTarget.id)
                    }}
                  >
                    Delete permanently
                  </Button>
                </>
              }
            >
              <p>
                “{deleteTarget?.title}” and its complete history will be removed. This cannot be
                undone.
              </p>
              <DeleteWorktreeNote thread={deleteTarget} />
            </AppDialog>
          </Tabs.Root>
        </LaunchReveal>
        <LaunchScreen launch={launch} />
        <RemoteConnectionNotice />
        <MainWindowOnly>
          <OnboardingLayer
            launching={launch.loading}
            snapshot={snapshot}
            onOpenThread={(threadId) => {
              closeWorkbenchViews()
              openThread(threadId)
            }}
          />
        </MainWindowOnly>
      </div>
    </MotionPreferences>
  )
}
