import { FileIcon } from "../ui/FileIcon"
import { useTabStore } from "./tab-store"
import { Tabs } from "@base-ui-components/react/tabs"
import { Separator } from "@base-ui-components/react/separator"
import type { Provider, Thread } from "@meldshell/contracts"
import {
  Columns2,
  FolderCode,
  Rows2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  SquareTerminal,
  X,
} from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { ExternalEditor, RunScript } from "@meldshell/contracts/ipc"
import { DropdownMenu, IconButton, MenuAction } from "../ui/controls"
import { Pressable, TextSwap, useMotionPreference } from "../ui/motion"
import { iconButtonClasses } from "../ui/styles"
import { MeldMark } from "../ui/MeldMark"
import { ProviderIcon } from "../ui/ProviderIcon"
import { useKeybindings, withShortcut } from "./keybindings"
import { useThreadDraggable } from "./thread-drag"
import { type ThreadLayout, visibleThreads } from "./thread-layout"

interface TitleBarProps {
  readonly openThreads: ReadonlyArray<Thread>
  readonly providersByThreadId: ReadonlyMap<string, Provider>
  readonly selectedTabId: string | null
  readonly onCloseTab: (tabId: string) => void
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
  readonly onRun: (name: string) => void
  /** Null while nothing is on screen or this client cannot start editors; the preferred is first. */
  readonly editors: readonly ExternalEditor[] | null
  readonly preferredEditor: string | undefined
  readonly onOpenInEditor: (editorId: string) => void
}

const noDrag = "[-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag]"

/** Starts a lone run script directly; several are chosen from a menu. */
function RunButton({
  scripts,
  onRun,
}: {
  scripts: readonly RunScript[]
  onRun: (name: string) => void
}): React.JSX.Element | null {
  const only = scripts.length === 1 ? scripts[0] : undefined
  if (only !== undefined)
    return (
      <IconButton className={noDrag} label={`Run ${only.command}`} onClick={() => onRun(only.name)}>
        <Play size={15} />
      </IconButton>
    )
  if (scripts.length === 0) return null
  return (
    <DropdownMenu
      align="end"
      trigger={
        <BaseButton
          render={<Pressable />}
          type="button"
          className={`motion-colors ${iconButtonClasses} ${noDrag}`}
          aria-label="Run a script"
          title="Run a script"
        >
          <Play size={15} />
        </BaseButton>
      }
    >
      {scripts.map((script) => (
        <MenuAction key={script.name} onClick={() => onRun(script.name)}>
          <span
            className="flex min-w-0 max-w-[360px] items-baseline gap-[10px]"
            title={script.command}
          >
            <span className="flex-none text-[var(--text-primary)]">{script.name}</span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)] [font:11px_var(--font-mono)]">
              {script.command}
            </span>
          </span>
        </MenuAction>
      ))}
    </DropdownMenu>
  )
}

/** Lists the editors found on this computer; the one used last comes first. */
function OpenInEditorButton({
  editors,
  preferred,
  onOpen,
}: {
  editors: readonly ExternalEditor[]
  preferred: string | undefined
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
      {editors.map((editor) => (
        <MenuAction key={editor.id} onClick={() => onOpen(editor.id)}>
          <span className="flex min-w-[180px] items-baseline justify-between gap-[16px]">
            <span className="text-[var(--text-primary)]">{editor.name}</span>
            {editor.id === preferred && editors.length > 1 && (
              <span className="text-[var(--text-tertiary)] text-[11px]">Last used</span>
            )}
          </span>
        </MenuAction>
      ))}
    </DropdownMenu>
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

export function TitleBar({
  openThreads,
  providersByThreadId,
  selectedTabId,
  onCloseTab,
  sidebarsVisible,
  inboxCollapsed,
  sourceControlCollapsed,
  onToggleInbox,
  onToggleSourceControl,
  terminalShown,
  onToggleTerminal,
  runScripts,
  onRun,
  editors,
  preferredEditor,
  onOpenInEditor,
}: TitleBarProps): React.JSX.Element {
  const files = useTabStore((state) => state.files)
  const threadTabs = useTabStore((state) => state.threadTabs)
  const reduced = useMotionPreference()
  const bindings = useKeybindings((state) => state.bindings)
  const closeTab = (button: HTMLElement, tabId: string) => {
    if (reduced) return onCloseTab(tabId)
    foldAway(button.closest<HTMLElement>("[data-tab-frame]"), () => onCloseTab(tabId))
  }
  return (
    <header className="titlebar [-webkit-app-region:drag] flex items-center gap-[10px] min-w-0 border-b-[1px] border-b-[color:var(--line-subtle)] select-none">
      <MeldMark className="brand-mark w-[17px] h-[17px] flex-[0_0_17px] text-[var(--text-primary)]" />
      {sidebarsVisible && (
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

      <Tabs.List
        className="flex min-w-0 flex-[1_1_auto] items-center gap-[2px] overflow-hidden"
        aria-label="Open tabs"
      >
        {threadTabs.map((tab) => {
          const members = visibleThreads(tab.layout).flatMap((id) => {
            const thread = openThreads.find((candidate) => candidate.id === id)
            return thread ? [thread] : []
          })
          const thread = members.find((member) => member.id === tab.focusedThreadId) ?? members[0]
          if (!thread) return null
          const shared = tab.layout.kind === "split"
          const title = members.map((member) => member.title).join(" / ")
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
              <IconButton
                unstyled
                className="motion-colors tab-close grid w-[18px] h-[18px] flex-[0_0_18px] p-0 border-0 rounded-[4px] bg-transparent text-[var(--text-tertiary)] cursor-default place-items-center opacity-[0] [&:focus-visible]:opacity-[1] [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]"
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
            <IconButton
              unstyled
              className="motion-colors tab-close grid w-[18px] h-[18px] flex-[0_0_18px] p-0 border-0 rounded-[4px] bg-transparent text-[var(--text-tertiary)] cursor-default place-items-center opacity-[0] [&:focus-visible]:opacity-[1] [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]"
              label={`Close ${file.path}`}
              onClick={(event) => closeTab(event.currentTarget, file.id)}
            >
              <X size={12} />
            </IconButton>
          </div>
        ))}
      </Tabs.List>
      {sidebarsVisible && editors !== null && editors.length > 0 && (
        <OpenInEditorButton editors={editors} preferred={preferredEditor} onOpen={onOpenInEditor} />
      )}
      {sidebarsVisible && <RunButton scripts={runScripts} onRun={onRun} />}
      {sidebarsVisible && terminalShown !== null && (
        <IconButton
          className="[-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag] [&[aria-pressed='true']]:text-[var(--text-primary)]"
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

const tabClasses = [
  "flex h-[30px] max-w-[224px] min-w-0 items-center gap-[3px] [padding:0_4px]",
  "border-[1px] border-[color:transparent] rounded-[var(--radius)] bg-transparent text-[var(--text-tertiary)]",
  "cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-secondary)]",
  "[&[data-selected]]:[border-color:var(--line-subtle)] [&[data-selected]]:bg-[var(--surface-selected)]",
  "[&[data-selected]]:text-[var(--text-primary)] [&[data-shared]]:max-w-[320px]",
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
