import { useAppData } from "../data/queries"
import {
  useWorkspaceActions,
  useThreadActions,
  useCatalogActions,
  useAppSettingsMutation,
} from "../data/mutations"
import { useAppAppearance } from "./appearance"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { Tabs } from "@base-ui-components/react/tabs"
import { Combobox } from "@base-ui-components/react/combobox"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Thread, TranscriptSearchResult } from "@meldshell/contracts"
import { ChevronDown, Plus, Settings } from "lucide-react"
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels"
import { InteractionDialog } from "../threads/InteractionDialog"
import { SearchDialog } from "../threads/SearchDialog"
import { Inbox } from "../threads/Inbox"
import { FilesSidebar } from "../files/FilesSidebar"
import { FileViewer } from "../files/FileViewer"
import { MeldMark } from "../ui/MeldMark"
import { WorkspaceManager } from "../workspaces/WorkspaceManager"
import { TitleBar } from "./TitleBar"
import { AppScale } from "./AppScale"
import { AppDialog, Button, DropdownMenu, MenuChoice, MenuRadioGroup } from "../ui/controls"
import { handleAppShortcut } from "./app-shortcuts"
import { useTabStore, type FileTab } from "./tab-store"
import { visibleThreads } from "./thread-layout"
import { useViewStore } from "./view-store"
import { ThreadWorkbench } from "./ThreadWorkbench"
import { useThreadDrafts } from "./thread-drafts"

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
    <div className="app-error" role="alert">
      {error.message}
      <Button
        size="sm"
        onClick={() => {
          for (const mutation of mutations) mutation.reset()
        }}
      >
        Dismiss
      </Button>
    </div>
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
      <div className="centered-state">
        <MeldMark className="brand-mark" />
        <h2>MeldShell could not open its local thread database</h2>
        <p>Your threads are still on disk. Restarting the application usually clears this.</p>
      </div>
    )
  if (!hasThread)
    return (
      <div className="centered-state">
        <MeldMark className="brand-mark" />
        <h2>Choose a thread from the inbox</h2>
        <p>Or start a new conversation in any workspace folder.</p>
        <Button
          variant="primary"
          icon={<Plus size={14} strokeWidth={2.25} />}
          onClick={onNewThread}
        >
          New thread
        </Button>
      </div>
    )
  return <>{children}</>
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
  return <Panel {...props} defaultSize={initialSize} />
}

function tabWorkspaceId(file: FileTab | undefined, thread: Thread | null) {
  return file?.workspaceId ?? thread?.workspaceId ?? ""
}

function FileOrThread({ file, children }: { file?: FileTab; children: React.ReactNode }) {
  if (!file) return <>{children}</>
  return (
    <Tabs.Panel value={file.id} className="thread-content">
      <FileViewer key={file.id} file={file} />
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

export function App(): React.JSX.Element {
  const openThreadIds = useTabStore((state) => state.openThreadIds)
  const selectedThreadId = useTabStore((state) => state.selectedThreadId)
  const openThread = useTabStore((state) => state.openThread)
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTarget, setSearchTarget] = useState<TranscriptSearchResult | null>(null)
  const [searchThreads, setSearchThreads] = useState<ReadonlyArray<Thread>>([])
  const [newThreadOpen, setNewThreadOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null)
  const [newThreadWorkspaceId, setNewThreadWorkspaceId] = useState("")
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switcherQuery, setSwitcherQuery] = useState("")
  const inbox = useSidebar(304)
  // Source control opens on request: the thread pane owns the window until the operator asks.
  const sourceControl = useSidebar(300, true)

  const { snapshotQuery, threadPagesQuery, snapshot } = useAppData()

  const {
    addWorkspaceMutation,
    manageAddWorkspaceMutation,
    renameWorkspaceMutation,
    removeWorkspaceMutation,
  } = useWorkspaceActions(snapshot, {
    added: (workspaceId) => {
      setNewThreadWorkspaceId(workspaceId)
      setNewThreadOpen(true)
    },
    removed: (workspaceId, threadIds) => {
      for (const id of threadIds) {
        removeThread(id)
        useThreadDrafts.getState().forget(id)
      }
      setSearchThreads((threads) => threads.filter((thread) => thread.workspaceId !== workspaceId))
      setSearchTarget(null)
    },
  })
  const {
    pinMutation,
    createThreadMutation,
    setStatusMutation,
    deleteThreadMutation,
    resolveApprovalMutation,
  } = useThreadActions(snapshot, {
    created: (threadId) => {
      if (threadId !== undefined) openThread(threadId)
      setNewThreadOpen(false)
    },
    deleted: (threadId) => {
      removeThread(threadId)
      useThreadDrafts.getState().forget(threadId)
      setSearchThreads((threads) => threads.filter((thread) => thread.id !== threadId))
      setDeleteTarget(null)
    },
    submitted: () => {
      // ThreadView handles submitted drafts.
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
    if (snapshot.workspaces.length === 0) addWorkspaceMutation.mutate()
    else {
      setNewThreadWorkspaceId(snapshot.workspaces[0]?.id ?? "")
      setNewThreadOpen(true)
    }
  }, [addWorkspaceMutation, closeSettings, openThread, snapshot.threads, snapshot.workspaces])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void =>
      handleAppShortcut(event, {
        settingsOpen,
        closeSettings,
        requestNewThread,
        setSearchOpen,
        setSwitcherQuery,
        setSwitcherOpen,
        openSettings,
        selectedThreadId: selectedTabId,
        closeThread,
        cycleTabs,
      })
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    closeSettings,
    closeThread,
    cycleTabs,
    openSettings,
    requestNewThread,
    selectedTabId,
    settingsOpen,
  ])

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
  const activeWorkspaceId = tabWorkspaceId(selectedFile, selectedThread)
  const openThreads = openThreadIds.flatMap((id) => {
    const thread = allThreads.find((candidate) => candidate.id === id)
    return thread === undefined ? [] : [thread]
  })
  const selectedApproval =
    snapshot.approvals.find((approval) => approval.threadId === selectedThreadId) ?? null

  return (
    <Tabs.Root
      className="app-shell"
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
        onToggleInbox={inbox.toggle}
        onToggleSourceControl={sourceControl.toggle}
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
          onResetCatalog={() => resetCatalogMutation.mutate()}
          onChangeAppSettings={(input) => appSettingsMutation.mutate(input)}
        />
      ) : (
        <Group className="workbench" orientation="horizontal">
          <SidebarPanel
            id="inbox"
            panelRef={inbox.panelRef}
            elementRef={inbox.elementRef}
            onTransitionEnd={inbox.onTransitionEnd}
            style={{ overflow: "hidden" }}
            collapsible
            collapsedSize={0}
            defaultSize={inbox.defaultSize}
            minSize="252px"
            maxSize="420px"
            groupResizeBehavior="preserve-pixel-size"
            onResize={inbox.onResize}
          >
            <aside className="inbox" inert={inbox.collapsed} style={{ width: inbox.width }}>
              <Inbox
                showSettled={snapshot.settings.showSettled ?? true}
                onSearch={() => setSearchOpen(true)}
                onManageWorkspaces={() => setWorkspacesOpen(true)}
                onPin={(thread) => pinMutation.mutate(thread)}
                threads={inboxThreads}
                workspaces={snapshot.workspaces}
                workspaceNames={workspaceNames}
                providersByThreadId={providersByThreadId}
                selectedThreadId={selectedThreadId}
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

              <div className="inbox-footer">
                <Button
                  variant="ghost"
                  block
                  icon={<Settings size={15} strokeWidth={1.75} />}
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => openSettings()}
                >
                  Settings
                </Button>
              </div>
            </aside>
          </SidebarPanel>

          <Separator className="pane-separator" />

          <Panel id="thread" minSize="400px">
            <main className="thread-pane">
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
          <Separator className="pane-separator" />
          <SidebarPanel
            id="source-control"
            panelRef={sourceControl.panelRef}
            elementRef={sourceControl.elementRef}
            onTransitionEnd={sourceControl.onTransitionEnd}
            style={{ overflow: "hidden" }}
            collapsible
            collapsedSize={0}
            inert={sourceControl.collapsed}
            defaultSize={sourceControl.defaultSize}
            minSize="240px"
            maxSize="480px"
            groupResizeBehavior="preserve-pixel-size"
            onResize={sourceControl.onResize}
          >
            <div style={{ width: sourceControl.width, height: "100%" }}>
              <FilesSidebar
                threadId={selectedThread?.id}
                key={activeWorkspaceId}
                workspace={workspaceById.get(activeWorkspaceId)}
              />
            </div>
          </SidebarPanel>
        </Group>
      )}

      <MutationErrors
        mutations={[pinMutation, setStatusMutation, deleteThreadMutation, addWorkspaceMutation]}
      />
      <AppDialog
        open={workspacesOpen}
        onOpenChange={setWorkspacesOpen}
        title="Manage workspaces"
        actions={<Button onClick={() => setWorkspacesOpen(false)}>Done</Button>}
      >
        <div className="workspace-manager scrollable">
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
      {searchOpen && (
        <SearchDialog
          workspaces={snapshot.workspaces}
          onClose={() => setSearchOpen(false)}
          onOpen={(result) => {
            setSearchThreads((threads) => [
              ...threads.filter((thread) => thread.id !== result.thread.id),
              result.thread,
            ])
            setSearchTarget(result)
            closeSettings()
            openThread(result.thread.id)
            setSearchOpen(false)
          }}
        />
      )}

      <AppDialog
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        title="Open thread"
        actions={<Button onClick={() => setSwitcherOpen(false)}>Cancel</Button>}
      >
        <Combobox.Root<Thread>
          inline
          defaultOpen
          autoHighlight
          items={allThreads}
          limit={50}
          filter={(thread, query) =>
            thread.title.toLowerCase().includes(query.trim().toLowerCase())
          }
          inputValue={switcherQuery}
          onInputValueChange={setSwitcherQuery}
          itemToStringLabel={(thread) => thread.title}
          onValueChange={(thread) => {
            if (thread === null) return
            closeSettings()
            openThread(thread.id)
            setSwitcherOpen(false)
          }}
        >
          <Combobox.Input
            className="text-input"
            autoFocus
            placeholder="Search threads…"
            aria-label="Search threads"
          />
          <Combobox.Empty className="thread-switcher-empty">
            {switcherQuery.trim() === ""
              ? "No threads yet. Create one with Ctrl+N."
              : "No matching threads. Try a different search."}
          </Combobox.Empty>
          <Combobox.List className="thread-switcher-list" aria-label="Matching threads">
            {(thread: Thread) => (
              <Combobox.Item className="thread-switcher-item" key={thread.id} value={thread}>
                <span className="thread-switcher-copy">
                  <span>{thread.title}</span>
                  <small>{workspaceById.get(thread.workspaceId)?.name}</small>
                </span>
                {thread.id === selectedThreadId && (
                  <span className="thread-switcher-current">Current</span>
                )}
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Root>
      </AppDialog>

      <AppDialog
        open={newThreadOpen}
        onOpenChange={setNewThreadOpen}
        title="New thread"
        actions={
          <>
            <Button onClick={() => setNewThreadOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={newThreadWorkspaceId === "" || createThreadMutation.isPending}
              onClick={() => createThreadMutation.mutate(newThreadWorkspaceId)}
            >
              Create thread
            </Button>
          </>
        }
      >
        <p>Choose the workspace folder this conversation belongs to.</p>
        <div className="dialog-field">
          <span className="field-label">Workspace</span>
          <DropdownMenu
            align="start"
            trigger={
              <BaseButton
                type="button"
                className="button dialog-select"
                data-block="true"
                aria-label="Workspace"
              >
                <span className="dialog-select-value">
                  {workspaceById.get(newThreadWorkspaceId)?.name ?? "Select a workspace"}
                </span>
                <ChevronDown size={14} strokeWidth={2} className="dialog-select-chevron" />
              </BaseButton>
            }
          >
            <MenuRadioGroup
              value={newThreadWorkspaceId}
              onValueChange={(value) => setNewThreadWorkspaceId(String(value))}
            >
              {snapshot.workspaces.map((workspace) => (
                <MenuChoice key={workspace.id} value={workspace.id} className="model-item">
                  <span className="model-item-body">
                    <span className="model-item-name">{workspace.name}</span>
                    <span className="model-item-slug">{workspace.path}</span>
                  </span>
                </MenuChoice>
              ))}
            </MenuRadioGroup>
          </DropdownMenu>
        </div>
      </AppDialog>

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
      </AppDialog>
    </Tabs.Root>
  )
}
