import { FileIcon } from "../ui/FileIcon"
import { useTabStore, type ThreadTab } from "./tab-store"
import { Tabs } from "@base-ui-components/react/tabs"
import { Separator } from "@base-ui-components/react/separator"
import type { Provider, Thread } from "@meldshell/contracts"
import {
  ChevronDown,
  Columns2,
  FolderCode,
  Globe,
  MoreHorizontal,
  Rows2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Square,
  SquareArrowDownLeft,
  SquareArrowOutUpRight,
  SquareTerminal,
  X,
} from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { ExternalEditor, RunScript } from "@meldshell/contracts/ipc"
import {
  ContextMenu,
  DropdownMenu,
  IconButton,
  MenuAction,
  MenuChoice,
  MenuGroup,
  MenuRadioGroup,
  MenuSeparator,
} from "../ui/controls"
import { Pressable, TextSwap, useMotionPreference } from "../ui/motion"
import { iconButtonClasses } from "../ui/styles"
import { RevealFileAction } from "../ui/FileContextActions"
import { MeldMark } from "../ui/MeldMark"
import { ProviderIcon } from "../ui/ProviderIcon"
import { useKeybindings, withShortcut } from "./keybindings"
import { useThreadDraggable } from "./thread-drag"
import { type ThreadLayout, visibleThreads } from "./thread-layout"
import { useViewportTier } from "./viewport"
import { threadWindowsSupported, windowThreadId } from "./thread-windows"

interface TitleBarProps {
  readonly openThreads: ReadonlyArray<Thread>
  readonly providersByThreadId: ReadonlyMap<string, Provider>
  readonly selectedTabId: string | null
  readonly onCloseTab: (tabId: string) => void
  readonly onSelectTab: (tabId: string) => void
  readonly sidebarsVisible: boolean
  readonly inboxCollapsed: boolean
  readonly sourceControlCollapsed: boolean
  readonly onToggleInbox: () => void
  readonly onToggleSourceControl: () => void
  /** Null while no thread is on screen or this client cannot run shells. */
  readonly terminalShown: boolean | null
  readonly onToggleTerminal: () => void
  /** The workspace run scripts for the thread on screen. */
  readonly runScripts: readonly RunScript[]
  /** Names of the run scripts running in the thread's terminal. */
  readonly runningScripts: readonly string[]
  readonly onRun: (name: string) => void
  readonly onStopRun: (name: string) => void
  /** Null while no thread is on screen or this client cannot show previews. */
  readonly previewShown: boolean | null
  readonly onTogglePreview: () => void
  /** Null while nothing is on screen or this client cannot start editors; the preferred is first. */
  readonly editors: readonly ExternalEditor[] | null
  /** What the editor opens: the thread's own worktree or the shared workspace folder. */
  readonly editorFolder: "worktree" | "workspace"
  readonly onOpenInEditor: (editorId: string) => void
  /** Pops a tab's thread out into its own window. */
  readonly onPopOutThread: (thread: Thread) => void
  /**
   * Moves the thread on screen into its own window, or a popped-out window's thread back; null while
   * no thread is on screen or this client cannot open windows.
   */
  readonly onThreadWindow: (() => void) | null
}

const noDrag = "[-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag]"

/** What the window button does here: a popped-out window sends its thread back. */
const threadWindowLabel =
  windowThreadId === null ? "Open in new window" : "Move back to main window"

function ThreadWindowIcon({ size }: { size: number }): React.JSX.Element {
  return windowThreadId === null ? (
    <SquareArrowOutUpRight size={size} />
  ) : (
    <SquareArrowDownLeft size={size} />
  )
}

/** Marks a title bar button whose work is running, like a server started by a run script. */
function RunningDot(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="absolute top-[5px] right-[5px] w-[6px] h-[6px] rounded-full bg-[var(--color-added)] [box-shadow:0_0_0_2px_var(--scrim)]"
    />
  )
}

/** The run scripts, marking those that are running, and a way to stop each running one. */
function RunMenuItems({
  scripts,
  running,
  onRun,
  onStop,
}: {
  scripts: readonly RunScript[]
  running: readonly string[]
  onRun: (name: string) => void
  onStop: (name: string) => void
}): React.JSX.Element {
  return (
    <>
      <MenuGroup label="Run scripts">
        {scripts.map((script) => {
          const isRunning = running.includes(script.name)
          return (
            <MenuAction
              key={script.name}
              icon={
                isRunning ? (
                  <span className="block w-[7px] h-[7px] rounded-full bg-[var(--color-added)]" />
                ) : (
                  <Play size={13} strokeWidth={1.75} />
                )
              }
              onClick={() => onRun(script.name)}
            >
              <span
                className="flex min-w-0 max-w-[360px] flex-1 items-baseline gap-[10px]"
                title={isRunning ? `Show ${script.command}` : script.command}
              >
                <span className="flex-none text-[var(--text-primary)]">{script.name}</span>
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)] [font:11px_var(--font-mono)]">
                  {script.command}
                </span>
                {isRunning && (
                  <span className="flex-none text-[var(--color-added)] text-[11px]">Running</span>
                )}
              </span>
            </MenuAction>
          )
        })}
      </MenuGroup>
      {running.length > 0 && <MenuSeparator />}
      {running.map((name) => (
        <MenuAction
          key={name}
          icon={<Square size={11} strokeWidth={2} />}
          onClick={() => onStop(name)}
        >
          Stop {name}
        </MenuAction>
      ))}
    </>
  )
}

/**
 * Starts a lone run script directly. Several scripts, or any that are running, are chosen from a
 * menu that shows which are running and can stop them.
 */
function RunButton({
  scripts,
  running,
  onRun,
  onStop,
}: {
  scripts: readonly RunScript[]
  running: readonly string[]
  onRun: (name: string) => void
  onStop: (name: string) => void
}): React.JSX.Element | null {
  const only = scripts.length === 1 ? scripts[0] : undefined
  if (only !== undefined && running.length === 0)
    return (
      <IconButton className={noDrag} label={`Run ${only.command}`} onClick={() => onRun(only.name)}>
        <Play size={15} />
      </IconButton>
    )
  if (scripts.length === 0) return null
  const label =
    running.length === 0
      ? "Run a script"
      : `${running.length === 1 ? running[0] : `${running.length} scripts`} running`
  return (
    <DropdownMenu
      align="end"
      trigger={
        <BaseButton
          render={<Pressable />}
          type="button"
          className={`motion-colors relative ${iconButtonClasses} ${noDrag} ${
            running.length > 0 ? "text-[var(--text-primary)]" : ""
          }`}
          aria-label={label}
          title={label}
        >
          <Play size={15} />
          {running.length > 0 && <RunningDot />}
        </BaseButton>
      }
    >
      <RunMenuItems scripts={scripts} running={running} onRun={onRun} onStop={onStop} />
    </DropdownMenu>
  )
}

function EditorMenuItems({
  editors,
  folder,
  onOpen,
}: {
  editors: readonly ExternalEditor[]
  folder: "worktree" | "workspace"
  onOpen: (editorId: string) => void
}): React.JSX.Element {
  const shortcut = useKeybindings((state) => state.bindings.openInEditor)
  // The file manager is always last; editors come before it. The first entry, the one used last,
  // is what the shortcut opens.
  const apps = editors.filter((editor) => editor.id !== "file-manager")
  const fileManager = editors.find((editor) => editor.id === "file-manager")
  const item = (editor: ExternalEditor, first: boolean) => (
    <MenuAction key={editor.id} onClick={() => onOpen(editor.id)}>
      <span className="flex min-w-[200px] flex-1 items-baseline justify-between gap-[16px]">
        <span className="text-[var(--text-primary)]">{editor.name}</span>
        {first && shortcut !== "" && (
          <span className="text-[var(--text-tertiary)] [font:10.5px_var(--font-mono)]">
            {shortcut}
          </span>
        )}
      </span>
    </MenuAction>
  )
  return (
    <>
      <MenuGroup label={folder === "worktree" ? "Open this worktree in" : "Open this workspace in"}>
        {apps.map((editor) => item(editor, editor.id === editors[0]?.id))}
        {fileManager !== undefined && apps.length > 0 && <MenuSeparator />}
        {fileManager !== undefined && item(fileManager, fileManager.id === editors[0]?.id)}
      </MenuGroup>
    </>
  )
}

/** Lists the editors found on this computer; the one used last comes first. */
function OpenInEditorButton({
  editors,
  folder,
  onOpen,
}: {
  editors: readonly ExternalEditor[]
  folder: "worktree" | "workspace"
  onOpen: (editorId: string) => void
}): React.JSX.Element {
  const shortcut = useKeybindings((state) => state.bindings.openInEditor)
  return (
    <DropdownMenu
      align="end"
      trigger={
        <BaseButton
          render={<Pressable />}
          type="button"
          className={`motion-colors ${iconButtonClasses} ${noDrag}`}
          aria-label="Open in editor"
          title={withShortcut("Open in editor", shortcut)}
        >
          <FolderCode size={15} />
        </BaseButton>
      }
    >
      <EditorMenuItems editors={editors} folder={folder} onOpen={onOpen} />
    </DropdownMenu>
  )
}

type ThreadToolsProps = Pick<
  TitleBarProps,
  | "editors"
  | "editorFolder"
  | "onOpenInEditor"
  | "runScripts"
  | "runningScripts"
  | "onRun"
  | "onStopRun"
  | "previewShown"
  | "onTogglePreview"
  | "terminalShown"
  | "onToggleTerminal"
  | "onThreadWindow"
>

/** In a narrow window the editor, run, preview, and terminal buttons share one menu. */
function ThreadToolsMenu({
  editors,
  editorFolder,
  onOpenInEditor,
  runScripts,
  runningScripts,
  onRun,
  onStopRun,
  previewShown,
  onTogglePreview,
  terminalShown,
  onToggleTerminal,
  onThreadWindow,
}: ThreadToolsProps): React.JSX.Element | null {
  const bindings = useKeybindings((state) => state.bindings)
  const sections: React.ReactNode[] = []
  // A popped-out window keeps its way back in view instead.
  const windowAction = windowThreadId === null ? onThreadWindow : null
  if (previewShown !== null || terminalShown !== null || windowAction !== null)
    sections.push(
      <MenuGroup key="panels" label="Panels">
        {previewShown !== null && (
          <MenuAction icon={<Globe size={13} />} onClick={onTogglePreview}>
            {withShortcut(previewShown ? "Hide preview" : "Show preview", bindings.togglePreview)}
          </MenuAction>
        )}
        {terminalShown !== null && (
          <MenuAction icon={<SquareTerminal size={13} />} onClick={onToggleTerminal}>
            {withShortcut(
              terminalShown ? "Hide terminal" : "Show terminal",
              bindings.toggleTerminal,
            )}
          </MenuAction>
        )}
        {windowAction !== null && (
          <MenuAction icon={<ThreadWindowIcon size={13} />} onClick={windowAction}>
            {withShortcut(threadWindowLabel, bindings.popOutThread)}
          </MenuAction>
        )}
      </MenuGroup>,
    )
  if (editors !== null && editors.length > 0)
    sections.push(
      <EditorMenuItems
        key="editors"
        editors={editors}
        folder={editorFolder}
        onOpen={onOpenInEditor}
      />,
    )
  if (runScripts.length > 0)
    sections.push(
      <RunMenuItems
        key="run"
        scripts={runScripts}
        running={runningScripts}
        onRun={onRun}
        onStop={onStopRun}
      />,
    )
  if (sections.length === 0) return null
  return (
    <DropdownMenu
      align="end"
      trigger={
        <BaseButton
          render={<Pressable />}
          type="button"
          className={`motion-colors relative ${iconButtonClasses} ${noDrag}`}
          aria-label="Thread tools"
          title="Thread tools"
        >
          <MoreHorizontal size={16} />
          {runningScripts.length > 0 && <RunningDot />}
        </BaseButton>
      }
    >
      {sections.flatMap((section, index) =>
        index === 0 ? [section] : [<MenuSeparator key={`separator-${index}`} />, section],
      )}
    </DropdownMenu>
  )
}

/** On a phone one button names the open tab and lists the rest, where a strip would not fit. */
function TabSwitcher({
  tabs,
  selectedTabId,
  onSelect,
  onClose,
}: {
  tabs: ReadonlyArray<{ id: string; title: string; icon: React.ReactNode }>
  selectedTabId: string | null
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
}): React.JSX.Element | null {
  const current = tabs.find((tab) => tab.id === selectedTabId)
  if (tabs.length === 0) return <div className="flex-1" />
  return (
    <div className="flex min-w-0 flex-1 items-center">
      <DropdownMenu
        className="max-w-[calc(var(--viewport-w)_-_20px)]"
        trigger={
          <BaseButton
            render={<Pressable />}
            type="button"
            className="motion-colors flex h-[30px] min-w-0 max-w-full items-center gap-[7px] [padding:0_8px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] bg-[var(--surface-selected)] text-[var(--text-primary)] text-[12px] [-webkit-app-region:no-drag]"
            aria-label={`Open tabs: ${current?.title ?? "none selected"}`}
          >
            {current?.icon}
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {current?.title ?? "Open tabs"}
            </span>
            {tabs.length > 1 && (
              <span className="flex-none text-[var(--text-tertiary)] text-[10px] tabular-nums">
                {tabs.length}
              </span>
            )}
            <ChevronDown size={13} className="flex-none text-[var(--text-tertiary)]" />
          </BaseButton>
        }
      >
        <MenuRadioGroup
          value={selectedTabId ?? ""}
          onValueChange={(value) => onSelect(String(value))}
        >
          <MenuGroup label="Open tabs">
            {tabs.map((tab) => (
              <MenuChoice key={tab.id} value={tab.id}>
                <span className="flex min-w-0 items-center gap-[8px]">
                  {tab.icon}
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {tab.title}
                  </span>
                </span>
              </MenuChoice>
            ))}
          </MenuGroup>
        </MenuRadioGroup>
        {current !== undefined && (
          <>
            <MenuSeparator />
            <MenuAction icon={<X size={13} />} onClick={() => onClose(current.id)}>
              Close this tab
            </MenuAction>
          </>
        )}
      </DropdownMenu>
    </div>
  )
}

function ThreadTabFrame({
  threadId,
  selected,
  shared,
  children,
}: React.PropsWithChildren<{
  readonly threadId: string
  readonly selected: boolean
  readonly shared: boolean
}>): React.JSX.Element {
  const draggable = useThreadDraggable(threadId, "tab", shared)
  return (
    <div
      ref={draggable.ref}
      data-tab-frame
      className={`motion-colors starting:opacity-0 ${tabClasses}`}
      data-dragging={draggable.isDragging ? "" : undefined}
      {...(selected ? { "data-selected": "" } : {})}
      {...(shared ? { "data-shared": "" } : {})}
    >
      {children}
    </div>
  )
}

function TabMark({ layout, provider }: { layout: ThreadLayout; provider: Provider | undefined }) {
  if (layout.kind === "thread") return <ProviderIcon provider={provider} size={13} />
  return layout.orientation === "horizontal" ? <Columns2 size={14} /> : <Rows2 size={14} />
}

/** The open threads a tab shows, the one it focuses, and its title; null when none are open. */
function resolveThreadTab(tab: ThreadTab, openThreads: ReadonlyArray<Thread>) {
  const members = visibleThreads(tab.layout).flatMap((id) => {
    const thread = openThreads.find((candidate) => candidate.id === id)
    return thread ? [thread] : []
  })
  const thread = members.find((member) => member.id === tab.focusedThreadId) ?? members[0]
  if (!thread) return null
  return { members, thread, title: members.map((member) => member.title).join(" / ") }
}

function TabStrip({
  openThreads,
  providersByThreadId,
  selectedTabId,
  onCloseTab,
  onPopOutThread,
}: Pick<
  TitleBarProps,
  "openThreads" | "providersByThreadId" | "selectedTabId" | "onCloseTab" | "onPopOutThread"
>): React.JSX.Element {
  const files = useTabStore((state) => state.files)
  const threadTabs = useTabStore((state) => state.threadTabs)
  const tabIds = [...threadTabs.map((tab) => tab.id), ...files.map((file) => file.id)]
  const closeOthers = (id: string) => tabIds.filter((tabId) => tabId !== id).forEach(onCloseTab)
  const closeRight = (id: string) => tabIds.slice(tabIds.indexOf(id) + 1).forEach(onCloseTab)
  const reduced = useMotionPreference()
  const closeTab = (button: HTMLElement, tabId: string) => {
    if (reduced) return onCloseTab(tabId)
    foldAway(button.closest<HTMLElement>("[data-tab-frame]"), () => onCloseTab(tabId))
  }
  return (
    <Tabs.List
      className="flex min-w-0 flex-[1_1_auto] items-center gap-[2px] overflow-hidden"
      aria-label="Open tabs"
    >
      {threadTabs.map((tab) => {
        const resolved = resolveThreadTab(tab, openThreads)
        if (!resolved) return null
        const { members, thread, title } = resolved
        const shared = tab.layout.kind === "split"
        const label = shared ? `Shared split: ${title}` : title
        const provider = providersByThreadId.get(thread.id)
        const providerLabel =
          provider === undefined
            ? "Unknown provider"
            : `${provider.displayName} via ${provider.harness}`

        return (
          <ThreadTabFrame
            key={tab.id}
            threadId={thread.id}
            selected={tab.id === selectedTabId}
            shared={shared}
          >
            <ContextMenu
              trigger={
                <Tabs.Tab
                  value={tab.id}
                  aria-label={shared ? label : `${title}, ${providerLabel}`}
                  title={
                    shared
                      ? `${label}\n${members.length} threads`
                      : `${title}\n${providerLabel}\nDrag onto a pane to move or split it`
                  }
                  className="flex min-w-0 flex-[1_1_auto] items-center gap-[7px] [padding:0_6px] border-0 bg-transparent text-inherit overflow-hidden text-[12px] cursor-default"
                >
                  <span
                    className="tab-provider-mark grid w-[14px] h-[14px] flex-[0_0_14px] text-[var(--text-tertiary)] place-items-center"
                    aria-hidden="true"
                  >
                    <TabMark layout={tab.layout} provider={provider} />
                  </span>
                  <span className="relative min-w-0 overflow-hidden">
                    <TextSwap text={title} />
                  </span>
                  {shared && (
                    <span
                      className="flex-none text-[var(--text-tertiary)] text-[10px] tabular-nums"
                      aria-hidden="true"
                    >
                      {members.length}
                    </span>
                  )}
                </Tabs.Tab>
              }
            >
              <MenuAction onClick={() => onCloseTab(tab.id)}>
                {shared ? "Close split tab" : "Close tab"}
              </MenuAction>
              <MenuAction disabled={tabIds.length < 2} onClick={() => closeOthers(tab.id)}>
                Close other tabs
              </MenuAction>
              <MenuAction disabled={tabIds.at(-1) === tab.id} onClick={() => closeRight(tab.id)}>
                Close tabs to the right
              </MenuAction>
              {threadWindowsSupported && windowThreadId === null && (
                <>
                  <MenuSeparator />
                  <MenuAction
                    icon={<SquareArrowOutUpRight size={13} />}
                    onClick={() => onPopOutThread(thread)}
                  >
                    {shared ? `Open “${thread.title}” in new window` : "Open in new window"}
                  </MenuAction>
                </>
              )}
            </ContextMenu>
            <IconButton
              unstyled
              className={tabCloseClasses}
              label={`Close ${label}`}
              onClick={(event) => closeTab(event.currentTarget, tab.id)}
            >
              <X size={12} strokeWidth={2} />
            </IconButton>
          </ThreadTabFrame>
        )
      })}
      {files.map((file) => (
        <div
          data-tab-frame
          key={file.id}
          className={`motion-colors starting:opacity-0 ${tabClasses}`}
          {...(file.id === selectedTabId ? { "data-selected": "" } : {})}
        >
          <ContextMenu
            trigger={
              <Tabs.Tab
                value={file.id}
                className="flex min-w-0 flex-[1_1_auto] items-center gap-[7px] [padding:0_6px] border-0 bg-transparent text-inherit overflow-hidden text-[12px] cursor-default"
                title={`${file.path}${file.diffSide ? ` · ${file.diffSide} changes` : ""}`}
              >
                <FileIcon path={file.path} size={14} />
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {file.path.split("/").pop()}
                  {file.diffSide ? ` · ${file.diffSide} changes` : ""}
                </span>
              </Tabs.Tab>
            }
          >
            <MenuAction onClick={() => onCloseTab(file.id)}>Close tab</MenuAction>
            <MenuAction disabled={tabIds.length < 2} onClick={() => closeOthers(file.id)}>
              Close other tabs
            </MenuAction>
            <MenuAction disabled={tabIds.at(-1) === file.id} onClick={() => closeRight(file.id)}>
              Close tabs to the right
            </MenuAction>
            <MenuAction onClick={() => void navigator.clipboard.writeText(file.path)}>
              Copy file path
            </MenuAction>
            <RevealFileAction scope={file} path={file.path} />
          </ContextMenu>
          <IconButton
            unstyled
            className={tabCloseClasses}
            label={`Close ${file.path}`}
            onClick={(event) => closeTab(event.currentTarget, file.id)}
          >
            <X size={12} />
          </IconButton>
        </div>
      ))}
    </Tabs.List>
  )
}

/** The phone's tab list: one button for the open tab, built from the same tabs as the strip. */
function PhoneTabs({
  openThreads,
  providersByThreadId,
  selectedTabId,
  onSelectTab,
  onCloseTab,
}: Pick<
  TitleBarProps,
  "openThreads" | "providersByThreadId" | "selectedTabId" | "onCloseTab" | "onSelectTab"
>): React.JSX.Element {
  const files = useTabStore((state) => state.files)
  const threadTabs = useTabStore((state) => state.threadTabs)
  const tabs = [
    ...threadTabs.flatMap((tab) => {
      const resolved = resolveThreadTab(tab, openThreads)
      if (!resolved) return []
      const { thread, title } = resolved
      return [
        {
          id: tab.id,
          title,
          icon: <TabMark layout={tab.layout} provider={providersByThreadId.get(thread.id)} />,
        },
      ]
    }),
    ...files.map((file) => ({
      id: file.id,
      title: file.path.split("/").pop() ?? file.path,
      icon: <FileIcon path={file.path} size={14} />,
    })),
  ]
  return (
    <TabSwitcher
      tabs={tabs}
      selectedTabId={selectedTabId}
      onSelect={onSelectTab}
      onClose={onCloseTab}
    />
  )
}

/** Moves the thread on screen into its own window, or a popped-out window's thread back. */
function ThreadWindowButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  const shortcut = useKeybindings((state) => state.bindings.popOutThread)
  return (
    <IconButton
      className={noDrag}
      label={withShortcut(threadWindowLabel, shortcut)}
      onClick={onClick}
    >
      <ThreadWindowIcon size={15} />
    </IconButton>
  )
}

/** The editor, run, preview, and terminal buttons of a window wide enough to show them apart. */
function ThreadToolButtons({
  editors,
  editorFolder,
  onOpenInEditor,
  runScripts,
  runningScripts,
  onRun,
  onStopRun,
  previewShown,
  onTogglePreview,
  terminalShown,
  onToggleTerminal,
  onThreadWindow,
}: ThreadToolsProps): React.JSX.Element {
  const bindings = useKeybindings((state) => state.bindings)
  const hasThreadTools = (editors !== null && editors.length > 0) || runScripts.length > 0
  return (
    <>
      {hasThreadTools && (
        <div className="flex flex-none items-center gap-[2px]">
          {editors !== null && editors.length > 0 && (
            <OpenInEditorButton editors={editors} folder={editorFolder} onOpen={onOpenInEditor} />
          )}
          <RunButton
            scripts={runScripts}
            running={runningScripts}
            onRun={onRun}
            onStop={onStopRun}
          />
          <Separator
            className="w-[1px] h-[18px] flex-[0_0_1px] [margin:0_6px] bg-[var(--line)]"
            orientation="vertical"
            aria-hidden="true"
          />
        </div>
      )}
      {previewShown !== null && (
        <IconButton
          className={`${noDrag} ${pressedClasses}`}
          label={withShortcut(
            previewShown ? "Hide preview" : "Show preview",
            bindings.togglePreview,
          )}
          aria-pressed={previewShown}
          onClick={onTogglePreview}
        >
          <Globe size={15} />
        </IconButton>
      )}
      {terminalShown !== null && (
        <IconButton
          className={`${noDrag} ${pressedClasses}`}
          label={withShortcut(
            terminalShown ? "Hide terminal" : "Show terminal",
            bindings.toggleTerminal,
          )}
          aria-pressed={terminalShown}
          onClick={onToggleTerminal}
        >
          <SquareTerminal size={16} />
        </IconButton>
      )}
      {onThreadWindow !== null && <ThreadWindowButton onClick={onThreadWindow} />}
    </>
  )
}

export function TitleBar({
  openThreads,
  providersByThreadId,
  selectedTabId,
  onCloseTab,
  onSelectTab,
  sidebarsVisible,
  inboxCollapsed,
  sourceControlCollapsed,
  onToggleInbox,
  onToggleSourceControl,
  terminalShown,
  onToggleTerminal,
  runScripts,
  runningScripts,
  onRun,
  onStopRun,
  previewShown,
  onTogglePreview,
  editors,
  editorFolder,
  onOpenInEditor,
  onPopOutThread,
  onThreadWindow,
}: TitleBarProps): React.JSX.Element {
  const bindings = useKeybindings((state) => state.bindings)
  const tier = useViewportTier()
  const phone = tier === "phone"
  const threadTools = {
    editors,
    editorFolder,
    onOpenInEditor,
    runScripts,
    runningScripts,
    onRun,
    onStopRun,
    previewShown,
    onTogglePreview,
    terminalShown,
    onToggleTerminal,
    onThreadWindow,
  }
  return (
    <header
      className={`titlebar [-webkit-app-region:drag] flex items-center min-w-0 border-b-[1px] border-b-[color:var(--line-subtle)] select-none ${tier === "regular" ? "gap-[10px]" : "gap-[6px]"}`}
      data-tier={tier}
    >
      {!phone && (
        <MeldMark className="brand-mark w-[17px] h-[17px] flex-[0_0_17px] text-[var(--text-primary)]" />
      )}
      {sidebarsVisible && windowThreadId === null && (
        <IconButton
          className="[-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag]"
          label={withShortcut(
            inboxCollapsed ? "Expand inbox" : "Collapse inbox",
            bindings.toggleInbox,
          )}
          aria-expanded={!inboxCollapsed}
          aria-controls="inbox"
          onClick={onToggleInbox}
        >
          {inboxCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </IconButton>
      )}

      {openThreads.length > 0 && (
        <Separator
          className="w-[1px] h-[18px] flex-[0_0_1px] bg-[var(--line)]"
          orientation="vertical"
          aria-hidden="true"
        />
      )}

      {phone ? (
        <PhoneTabs
          openThreads={openThreads}
          providersByThreadId={providersByThreadId}
          selectedTabId={selectedTabId}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />
      ) : (
        <TabStrip
          openThreads={openThreads}
          providersByThreadId={providersByThreadId}
          selectedTabId={selectedTabId}
          onCloseTab={onCloseTab}
          onPopOutThread={onPopOutThread}
        />
      )}
      {sidebarsVisible &&
        (tier === "regular" ? (
          <ThreadToolButtons {...threadTools} />
        ) : (
          <ThreadToolsMenu {...threadTools} />
        ))}
      {sidebarsVisible &&
        tier !== "regular" &&
        windowThreadId !== null &&
        onThreadWindow !== null && <ThreadWindowButton onClick={onThreadWindow} />}
      {sidebarsVisible && (
        <IconButton
          className="[-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag]"
          label={withShortcut(
            sourceControlCollapsed ? "Expand files and changes" : "Collapse files and changes",
            bindings.toggleSourceControl,
          )}
          aria-expanded={!sourceControlCollapsed}
          aria-controls="source-control"
          onClick={onToggleSourceControl}
        >
          {sourceControlCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        </IconButton>
      )}
    </header>
  )
}

/** A panel toggle that is on keeps a raised surface, like a selected tab. */
const pressedClasses = [
  "[&[aria-pressed='true']]:text-[var(--text-primary)] [&[aria-pressed='true']]:bg-[var(--surface-selected)]",
  "[&[aria-pressed='true']]:[border-color:var(--line-subtle)]",
].join(" ")

const tabCloseClasses = [
  "motion-colors tab-close grid w-[18px] h-[18px] flex-[0_0_18px] p-0 border-0 rounded-[4px]",
  "bg-transparent text-[var(--text-tertiary)] cursor-default place-items-center opacity-[0]",
  "[&:focus-visible]:opacity-[1] [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]",
].join(" ")

const tabClasses = [
  "flex h-[30px] max-w-[224px] min-w-0 items-center gap-[3px] [padding:0_4px]",
  "[[data-tier='compact']_&]:max-w-[200px] [[data-tier='phone']_&]:max-w-[132px]",
  "border-[1px] border-[color:transparent] rounded-[var(--radius)] bg-transparent text-[var(--text-tertiary)]",
  "cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)]",
  "[&[data-selected]]:[border-color:var(--line-subtle)] [&[data-selected]]:bg-[var(--surface-selected)]",
  "[&[data-selected]]:text-[var(--text-primary)] [&[data-shared]]:max-w-[320px]",
  "[[data-tier='compact']_&[data-shared]]:max-w-[200px] [[data-tier='phone']_&[data-shared]]:max-w-[160px]",
  "[&[data-selected]_.tab-provider-mark]:text-[var(--text-secondary)] [&:hover_.tab-close]:opacity-[1]",
  "[&[data-selected]_.tab-close]:opacity-[1] [-webkit-app-region:no-drag]",
  "[&_*]:[-webkit-app-region:no-drag]",
].join(" ")

const foldEasing = "cubic-bezier(0.4, 0, 0.2, 1)"

/** A closing tab narrows and fades before it leaves, so its neighbours slide over. */
function foldAway(tab: HTMLElement | null, done: () => void): void {
  if (tab === null) return done()
  tab.style.pointerEvents = "none"
  const animation = tab.animate(
    [
      { width: `${tab.offsetWidth}px`, minWidth: "0px", opacity: 1 },
      {
        width: "0px",
        minWidth: "0px",
        paddingLeft: "0px",
        paddingRight: "0px",
        borderWidth: "0px",
        marginRight: "-2px",
        opacity: 0,
      },
    ],
    { duration: 160, easing: foldEasing, fill: "forwards" },
  )
  animation.onfinish = done
}
