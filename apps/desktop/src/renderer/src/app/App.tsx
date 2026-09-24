import { centeredStateClasses, threadContentClasses } from "../ui/styles"
import { FadeDiv, MotionPreferences } from "../ui/motion"
import { useAppData } from "../data/queries"
import {
  useWorkspaceActions,
  useThreadActions,
  useCatalogActions,
  useAppSettingsMutation,
} from "../data/mutations"
import { useAppAppearance } from "./appearance"
import { Tabs } from "@base-ui-components/react/tabs"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Thread, TranscriptSearchResult } from "@meldshell/contracts"
import type { RunScript, WorkspaceScope } from "@meldshell/contracts/ipc"
import { workspaceScope } from "../data/workspace-scope"
import { Plus, Settings } from "lucide-react"
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels"
import { InteractionDialog } from "../threads/InteractionDialog"
import { FilePalette } from "./FilePalette"
import { ThreadPalette } from "./ThreadPalette"
import { Inbox } from "../threads/Inbox"
import { FilesSidebar } from "../files/FilesSidebar"
import { DiffViewer } from "../files/DiffViewer"
import { FileViewer } from "../files/FileViewer"
import { MeldMark } from "../ui/MeldMark"
import { WorkspaceManager } from "../workspaces/WorkspaceManager"
import { TitleBar } from "./TitleBar"
import { AppScale } from "./AppScale"
import { AppDialog, Button } from "../ui/controls"
import { ErrorToast } from "../ui/Notice"
import { handleAppShortcut } from "./app-shortcuts"
import { useKeybindings } from "./keybindings"
import { useTabStore, type FileTab } from "./tab-store"
import { visibleThreads } from "./thread-layout"
import { useViewStore } from "./view-store"
import { ThreadWorkbench } from "./ThreadWorkbench"
import { useThreadDrafts } from "./thread-drafts"
import { useThreadSignals, useWatchedThreadIds } from "./thread-signals"
import { terminalApi, useTerminalStore } from "../terminals/terminal-store"
import { useWorkspaceScripts } from "../terminals/workspace-scripts"
import { useOpenInEditor } from "./editors"

import { SettingsView } from "../settings/SettingsView"

// A freshly created thread stays out of the inbox until it carries work of its own.
const isDraftThread = (thread: Thread): boolean =>
  thread.turnCount === 0 && thread.queuedCount === 0

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

function ThreadPane({
  databaseError,
  hasThread,
  onNewThread,
  children,
}: {
  databaseError: boolean
  hasThread: boolean
  onNewThread: () => void
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
  if (!hasThread)
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
      </FadeDiv>
    )
  return <>{children}</>
}

function useRemotePhone() {
  const [phone, setPhone] = useState(
    () => window.meldshell.platform === "web" && window.innerWidth < 640,
  )
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)")
    const update = () => setPhone(window.meldshell.platform === "web" && query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return phone
}

function usePhonePanels(
  phone: boolean,
  inbox: ReturnType<typeof usePanelRef>,
  files: ReturnType<typeof usePanelRef>,
  animate: (change: () => void) => void,
) {
  useEffect(
    () =>
      useTabStore.subscribe((state, previous) => {
        if (
          phone &&
          (state.selectedThreadTabId !== previous.selectedThreadTabId ||
            state.selectedFileId !== previous.selectedFileId)
        ) {
          animate(() => {
            inbox.current?.collapse()
            files.current?.collapse()
          })
        }
      }),
    [phone, inbox, files, animate],
  )
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

function toggleSidebar(
  phone: boolean,
  other: ReturnType<typeof usePanelRef>,
  toggle: () => void,
  animate: (change: () => void) => void,
) {
  animate(() => {
    if (phone) other.current?.collapse()
    toggle()
  })
}

function remoteLayout(phone: boolean, inboxWidth: number, filesWidth: number) {
  return {
    orientation: phone ? ("vertical" as const) : ("horizontal" as const),
    inboxMin: phone ? "160px" : "252px",
    inboxMax: phone ? "45%" : "420px",
    threadMin: phone ? "0px" : "400px",
    inboxWidth: phone ? "100%" : inboxWidth,
    filesWidth: phone ? "100%" : filesWidth,
  }
}

function useSidebar(initialWidth: number, initiallyCollapsed = false) {
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
    defaultSize: collapsed ? 0 : `${width}px`,
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

function FileOrThread({ file, children }: { file?: FileTab; children: React.ReactNode }) {
  if (!file) return <>{children}</>
  return (
    <Tabs.Panel render={<FadeDiv />} value={file.id} className={threadContentClasses}>
      {file.diffSide ? (
        <DiffViewer key={file.id} file={file} side={file.diffSide} />
      ) : (
        <FileViewer key={file.id} file={file} />
      )}
    </Tabs.Panel>
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

/**
 * The title bar's terminal toggle and Run button for the thread on screen. `shown` is null without
 * one, and `runScripts` is empty unless its workspace has run scripts.
 */
const noRunScripts: readonly RunScript[] = []

function useTerminalToggle(
  closeSettings: () => void,
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
  const workspaceId = threads.find((thread) => thread.id === selectedThreadId)?.workspaceId
  const scripts = useWorkspaceScripts(terminalApi === undefined ? undefined : workspaceId)
  const withThread = useCallback(
    (action: (threadId: string) => void): void => {
      const { selectedThreadId: threadId, selectedThreadTabId } = useTabStore.getState()
      if (terminalApi === undefined || threadId === null || selectedThreadTabId === null) return
      closeSettings()
      selectTab(selectedThreadTabId)
      action(threadId)
    },
    [closeSettings, selectTab],
  )
  const toggle = useCallback(
    () => withThread((threadId) => useTerminalStore.getState().toggle(threadId)),
    [withThread],
  )
  const run = useCallback(
    (name: string) => withThread((threadId) => useTerminalStore.getState().run(threadId, name)),
    [withThread],
  )
  const shown = terminalApi === undefined || !threadOnScreen ? null : open
  return {
    shown,
    toggle,
    runScripts: shown === null ? noRunScripts : (scripts.data?.run ?? noRunScripts),
    run,
  }
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
  const removeThread = useTabStore((state) => state.removeThread)

  const settingsOpen = useViewStore((state) => state.settingsOpen)
  const openSettings = useViewStore((state) => state.openSettings)
  const closeSettings = useViewStore((state) => state.closeSettings)

  const [workspacesOpen, setWorkspacesOpen] = useState(false)
  const [threadPaletteOpen, setThreadPaletteOpen] = useState(false)
  const [searchTarget, setSearchTarget] = useState<TranscriptSearchResult | null>(null)
  const [searchThreads, setSearchThreads] = useState<ReadonlyArray<Thread>>([])
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null)
  const [filePaletteOpen, setFilePaletteOpen] = useState(false)
  const remotePhone = useRemotePhone()
  const inbox = useSidebar(304, remotePhone)
  // Source control opens on request: the thread pane owns the window until the operator asks.
  const sourceControl = useSidebar(300, true)
  const panelMotion = usePanelMotion()
  usePhonePanels(remotePhone, inbox.panelRef, sourceControl.panelRef, panelMotion.animate)
  const layout = remoteLayout(remotePhone, inbox.width, sourceControl.width)

  const { snapshotQuery, threadPagesQuery, snapshot } = useAppData()

  const {
    pinMutation,
    createThreadMutation,
    setStatusMutation,
    deleteThreadMutation,
    resolveApprovalMutation,
  } = useThreadActions(snapshot, {
    created: (threadId) => {
      if (threadId !== undefined) openThread(threadId)
    },
    deleted: (threadId) => {
      removeThread(threadId)
      useTerminalStore.getState().forget(threadId)
      useThreadDrafts.getState().forget(threadId)
      setSearchThreads((threads) => threads.filter((thread) => thread.id !== threadId))
      setDeleteTarget(null)
    },
    submitted: () => {
      // ThreadView handles submitted drafts.
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
        useThreadDrafts.getState().forget(id)
      }
      setSearchThreads((threads) => threads.filter((thread) => thread.workspaceId !== workspaceId))
      setSearchTarget(null)
    },
  })
  const { updateProviderMutation, upsertModelMutation, deleteModelMutation, resetCatalogMutation } =
    useCatalogActions()
  const appSettingsMutation = useAppSettingsMutation()

  useAppAppearance(snapshot.settings)

  useEffect(
    () =>
      window.meldshell.onOpenAttention((threadId) => {
        closeSettings()
        openThread(threadId)
      }),
    [closeSettings, openThread],
  )

  // Memoised because the Ctrl+N handler lists it as an effect dependency; without a stable identity
  // the keyboard listener would be torn down and re-registered on every render.
  const requestNewThread = useCallback((): void => {
    closeSettings()
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
    closeSettings,
    createThreadMutation,
    openThread,
    snapshot.threads,
    snapshot.workspaces,
  ])

  const terminal = useTerminalToggle(closeSettings, selectThread, snapshot.threads)

  const pagedThreads = threadPagesQuery.data?.pages.flatMap((page) => page.threads) ?? []
  const threadMap = new Map(
    [...searchThreads, ...pagedThreads].map((thread) => [thread.id, thread]),
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
  const unseenThreadIds = useThreadSignals(
    snapshot.threads,
    useWatchedThreadIds(),
    snapshot.settings.sounds ?? true,
  )
  const activeScope = tabScope(selectedFile, selectedThread)
  const activeWorkspaceId = activeScope?.workspaceId ?? ""
  const worktreeThread =
    activeScope?.threadId === undefined
      ? undefined
      : allThreads.find((thread) => thread.id === activeScope.threadId)
  const editor = useOpenInEditor(
    settingsOpen ? undefined : activeScope,
    snapshot.settings.editor,
    appSettingsMutation.mutate,
  )
  const toggleInbox = () =>
    toggleSidebar(remotePhone, sourceControl.panelRef, inbox.toggle, panelMotion.animate)
  const toggleSourceControl = () =>
    toggleSidebar(remotePhone, inbox.panelRef, sourceControl.toggle, panelMotion.animate)

  const keybindingOverrides = snapshot.settings.keybindings
  useEffect(() => {
    useKeybindings.getState().setOverrides(keybindingOverrides)
  }, [keybindingOverrides])
  // The listener stays registered; each render hands it the current actions.
  const shortcutActions = useRef<Parameters<typeof handleAppShortcut>[2] | null>(null)
  useEffect(() => {
    shortcutActions.current = {
      settingsOpen,
      closeSettings,
      requestNewThread,
      openThreadPalette: () => setThreadPaletteOpen(true),
      openFilePalette: () => setFilePaletteOpen(true),
      openSettings: () => openSettings(),
      selectedThreadId: selectedTabId,
      closeThread,
      cycleTabs,
      toggleInbox,
      toggleSourceControl,
      toggleTerminal: terminal.toggle,
      openInEditor: () => editor.open(),
    }
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (shortcutActions.current !== null)
        handleAppShortcut(event, useKeybindings.getState().bindings, shortcutActions.current)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
  const openThreads = openThreadIds.flatMap((id) => {
    const thread = allThreads.find((candidate) => candidate.id === id)
    return thread === undefined ? [] : [thread]
  })
  const selectedApproval =
    snapshot.approvals.find((approval) => approval.threadId === selectedThreadId) ?? null

  return (
    <MotionPreferences reduceMotion={snapshot.settings.reduceMotion ?? false}>
      <Tabs.Root
        className="w-full h-full grid grid-rows-[var(--titlebar-height)_minmax(0,_1fr)] text-[var(--text-primary)] bg-[var(--scrim)] text-[13px] leading-[1.45]"
        value={selectedTabId}
        onValueChange={(value) => {
          if (typeof value === "string") {
            closeSettings()
            selectThread(value)
          }
        }}
      >
        <AppScale />
        <TitleBar
          openThreads={openThreads}
          providersByThreadId={providersByThreadId}
          selectedTabId={selectedTabId}
          onCloseTab={closeThread}
          sidebarsVisible={!settingsOpen}
          inboxCollapsed={inbox.collapsed}
          sourceControlCollapsed={sourceControl.collapsed}
          onToggleInbox={toggleInbox}
          onToggleSourceControl={toggleSourceControl}
          terminalShown={terminal.shown}
          onToggleTerminal={terminal.toggle}
          runScripts={terminal.runScripts}
          onRun={terminal.run}
          editors={editor.editors}
          preferredEditor={snapshot.settings.editor}
          onOpenInEditor={editor.open}
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
          <Group
            elementRef={panelMotion.groupRef}
            className="motion-panels motion-duration-220 min-h-0"
            orientation={layout.orientation}
          >
            <SidebarPanel
              id="inbox"
              panelRef={inbox.panelRef}
              elementRef={inbox.elementRef}
              onTransitionEnd={inbox.onTransitionEnd}
              collapsible
              collapsedSize={0}
              defaultSize={inbox.defaultSize}
              minSize={layout.inboxMin}
              maxSize={layout.inboxMax}
              groupResizeBehavior="preserve-pixel-size"
              onResize={inbox.onResize}
            >
              <aside
                className={`motion-colors motion-duration-220 grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)_auto] [padding:10px_8px_8px] ${inbox.collapsed ? "opacity-0" : ""}`}
                inert={inbox.collapsed}
                style={{ width: layout.inboxWidth }}
              >
                <Inbox
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
                  onAddWorkspace={() => addWorkspaceMutation.mutate()}
                  onOpen={(threadId) => {
                    closeSettings()
                    openThread(threadId)
                  }}
                  onOpenBeside={(threadId, edge) => {
                    closeSettings()
                    openBeside(threadId, edge)
                  }}
                  onSetStatus={(thread) =>
                    setStatusMutation.mutate({
                      threadId: thread.id,
                      status: thread.status === "active" ? "settled" : "active",
                    })
                  }
                  onDelete={setDeleteTarget}
                  canLoadMore={threadPagesQuery.hasNextPage}
                  loadingMore={threadPagesQuery.isFetchingNextPage}
                  onLoadMore={() => void threadPagesQuery.fetchNextPage()}
                />

                <div className="flex [padding:8px_3px_0] mt-[4px] border-t-[1px] border-t-[color:var(--line-subtle)] [&_.button]:h-[42px] [&_.button]:pr-[12px] [&_.button]:pl-[12px]">
                  <Button
                    variant="ghost"
                    block
                    icon={<Settings size={15} strokeWidth={1.75} />}
                    className="justify-start!"
                    onClick={() => openSettings()}
                  >
                    Settings
                  </Button>
                </div>
              </aside>
            </SidebarPanel>

            <Separator className="motion-colors relative w-[1px] flex-[0_0_1px] bg-[var(--line-subtle)] outline-none [&::after]:absolute [&::after]:z-[2] [&::after]:[inset:0_-3px] [&::after]:[content:''] [&:hover]:bg-[var(--line-strong)] [&:focus-visible]:bg-[var(--line-strong)] [&[data-separator='active']]:bg-[var(--line-strong)]" />

            <Panel id="thread" minSize={layout.threadMin}>
              <main className="grid h-full min-w-0 min-h-0 grid-rows-[minmax(0,_1fr)_auto]">
                <FileOrThread file={selectedFile}>
                  <ThreadPane
                    databaseError={snapshotQuery.isError}
                    hasThread={selectedThread !== null}
                    onNewThread={requestNewThread}
                  >
                    <ThreadWorkbench
                      snapshot={snapshot}
                      threads={allThreads}
                      searchTarget={searchTarget}
                    />
                  </ThreadPane>
                </FileOrThread>
              </main>
            </Panel>
            <Separator className="motion-colors relative w-[1px] flex-[0_0_1px] bg-[var(--line-subtle)] outline-none [&::after]:absolute [&::after]:z-[2] [&::after]:[inset:0_-3px] [&::after]:[content:''] [&:hover]:bg-[var(--line-strong)] [&:focus-visible]:bg-[var(--line-strong)] [&[data-separator='active']]:bg-[var(--line-strong)]" />
            <SidebarPanel
              id="source-control"
              panelRef={sourceControl.panelRef}
              elementRef={sourceControl.elementRef}
              onTransitionEnd={sourceControl.onTransitionEnd}
              collapsible
              collapsedSize={0}
              inert={sourceControl.collapsed}
              defaultSize={sourceControl.defaultSize}
              minSize="240px"
              maxSize="480px"
              groupResizeBehavior="preserve-pixel-size"
              onResize={sourceControl.onResize}
            >
              <div
                className={`motion-colors motion-duration-220 h-full ${sourceControl.collapsed ? "opacity-0" : ""}`}
                style={{ width: layout.filesWidth }}
              >
                <FilesSidebar
                  threadId={selectedThread?.id}
                  key={`${activeWorkspaceId}:${activeScope?.threadId ?? ""}`}
                  workspace={workspaceById.get(activeWorkspaceId)}
                  scope={activeScope}
                  worktreeThread={worktreeThread}
                />
              </div>
            </SidebarPanel>
          </Group>
        )}

        <MutationErrors
          mutations={[
            pinMutation,
            setStatusMutation,
            deleteThreadMutation,
            addWorkspaceMutation,
            createThreadMutation,
            editor.mutation,
          ]}
        />
        <AppDialog
          open={workspacesOpen}
          onOpenChange={setWorkspacesOpen}
          title="Manage workspaces"
          actions={<Button onClick={() => setWorkspacesOpen(false)}>Done</Button>}
        >
          <div className="workspace-manager max-h-[60vh] [padding:0_20px] overflow-y-auto [scrollbar-gutter:stable]">
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
            closeSettings()
            openThread(threadId)
          }}
          onOpenMatch={(result) => {
            setSearchThreads((threads) => [
              ...threads.filter((thread) => thread.id !== result.thread.id),
              result.thread,
            ])
            setSearchTarget(result)
            closeSettings()
            openThread(result.thread.id)
          }}
        />
        <FilePalette
          open={filePaletteOpen}
          onOpenChange={setFilePaletteOpen}
          workspaces={snapshot.workspaces}
          activeScope={activeScope}
          onOpenFile={(scope, path) => {
            closeSettings()
            openFile(scope, path)
          }}
        />

        {selectedApproval !== null && (
          <InteractionDialog
            key={selectedApproval.id}
            request={selectedApproval}
            pending={resolveApprovalMutation.isPending}
            error={resolveApprovalMutation.error?.message ?? null}
            onResolve={(input) => resolveApprovalMutation.mutate(input)}
          />
        )}

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
                variant="primary"
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
            “{deleteTarget?.title}” and its complete history will be removed. This cannot be undone.
          </p>
          <DeleteWorktreeNote thread={deleteTarget} />
        </AppDialog>
      </Tabs.Root>
    </MotionPreferences>
  )
}
