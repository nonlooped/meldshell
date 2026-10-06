import { useEffect, useRef } from "react"
import type { Thread } from "@meldshell/contracts"
import { Group, Panel, Separator } from "react-resizable-panels"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Columns2,
  Rows2,
  SquareTerminal,
  X,
} from "lucide-react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { ContextMenu, IconButton, MenuAction, MenuSeparator } from "../ui/controls"
import { paneSeparatorClasses } from "../ui/styles"
import { useKeybindings, withShortcut } from "../app/keybindings"
import { touchOnly } from "../app/viewport"
import type { TerminalLayout } from "./terminal-layout"
import {
  attachTerminal,
  terminalClear,
  terminalPaste,
  terminalSelectAll,
  terminalSelection,
  terminalKey,
  useTerminalStore,
  type TerminalInfo,
  type TerminalKey,
  type ThreadTerminals,
} from "./terminal-store"

/** The last two folders are enough to tell a worktree from its workspace. */
function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path
}

function TerminalTitle({ info }: { info: TerminalInfo | undefined }): React.JSX.Element {
  if (info === undefined || info.state === "starting" || info.state === "failed")
    return <span>{info?.state === "failed" ? "Terminal could not start" : "Terminal"}</span>
  return (
    <span
      className="flex min-w-0 items-baseline gap-[7px]"
      title={info.run === undefined ? info.cwd : `${info.run.command}\n${info.cwd}`}
    >
      <span className="flex-none text-[var(--text-secondary)]">{info.shell}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {info.run === undefined ? shortPath(info.cwd) : `Run: ${info.run.name}`}
      </span>
      {info.state === "exited" && (
        <small className="flex-none text-[var(--color-modified)] text-[11px]">
          Exited {info.code}
        </small>
      )}
    </span>
  )
}

function TerminalPane({
  id,
  thread,
  focused,
  multiple,
}: {
  id: string
  thread: Thread
  focused: boolean
  multiple: boolean
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const { workspaceId, id: threadId } = thread
  useEffect(() => {
    const host = hostRef.current
    return host === null ? undefined : attachTerminal(id, { workspaceId, threadId }, host)
  }, [id, workspaceId, threadId])
  const focus = () => useTerminalStore.getState().focus(threadId, id)
  return (
    <div
      className={terminalPaneClasses}
      data-dimmed={multiple && !focused ? "" : undefined}
      onFocusCapture={focus}
      onPointerDownCapture={focus}
    >
      {/* xterm places its pointer from unzoomed coordinates, so the pane undoes the app scale and
          the terminal scales its font instead. */}
      <ContextMenu
        trigger={
          <div
            ref={hostRef}
            className="terminal-host absolute [inset:0] [padding:6px_6px_4px_12px]"
            style={{ zoom: "calc(1 / var(--app-scale, 1))" }}
          />
        }
      >
        <MenuAction onClick={() => void navigator.clipboard.writeText(terminalSelection(id))}>
          Copy selection
        </MenuAction>
        <MenuAction
          onClick={() =>
            void navigator.clipboard.readText().then((text) => terminalPaste(id, text))
          }
        >
          Paste
        </MenuAction>
        <MenuAction onClick={() => terminalSelectAll(id)}>Select all</MenuAction>
        <MenuAction onClick={() => terminalClear(id)}>Clear terminal</MenuAction>
        <MenuAction onClick={() => useTerminalStore.getState().split(threadId, "horizontal")}>
          Split right
        </MenuAction>
        <MenuAction onClick={() => useTerminalStore.getState().split(threadId, "vertical")}>
          Split down
        </MenuAction>
        <MenuSeparator />
        <MenuAction onClick={() => useTerminalStore.getState().close(threadId, id)}>
          End this terminal
        </MenuAction>
      </ContextMenu>
      {multiple && (
        <IconButton
          className="terminal-pane-close absolute! top-[6px] right-[10px] z-[12] w-[22px]! h-[22px]! flex-[0_0_22px]! bg-[var(--surface-menu)]! opacity-[0] [&:focus-visible]:opacity-[1] [@media(hover:_none)]:opacity-[1]"
          label="Close this terminal"
          onClick={() => useTerminalStore.getState().close(threadId, id)}
        >
          <X size={12} strokeWidth={2} />
        </IconButton>
      )}
    </div>
  )
}

function TerminalNode({
  node,
  thread,
  terminals,
}: {
  node: TerminalLayout
  thread: Thread
  terminals: ThreadTerminals
}): React.JSX.Element {
  if (node.kind === "terminal")
    return (
      <TerminalPane
        id={node.id}
        thread={thread}
        focused={terminals.focusedId === node.id}
        multiple={terminals.layout.kind === "split"}
      />
    )
  return (
    <Group
      className="w-full h-full min-w-0 min-h-0"
      orientation={node.orientation}
      onLayoutChanged={(layout, meta) => {
        const ratio = layout[node.first.id]
        if (meta.isUserInteraction && ratio !== undefined)
          useTerminalStore.getState().resizeSplit(thread.id, node.id, ratio)
      }}
    >
      <Panel id={node.first.id} defaultSize={`${node.ratio}%`} minSize="10%">
        <TerminalNode key={node.first.id} node={node.first} thread={thread} terminals={terminals} />
      </Panel>
      <Separator
        className={`motion-colors ${paneSeparatorClasses}`}
        aria-label="Resize terminals"
      />
      <Panel id={node.second.id} defaultSize={`${100 - node.ratio}%`} minSize="10%">
        <TerminalNode
          key={node.second.id}
          node={node.second}
          thread={thread}
          terminals={terminals}
        />
      </Panel>
    </Group>
  )
}

const touchKeys: ReadonlyArray<{
  readonly key: TerminalKey
  readonly label: string
  readonly content: React.ReactNode
}> = [
  { key: "escape", label: "Escape", content: "esc" },
  { key: "tab", label: "Tab", content: "tab" },
  { key: "interrupt", label: "Control C", content: "^C" },
  { key: "left", label: "Left arrow", content: <ArrowLeft size={14} /> },
  { key: "up", label: "Up arrow", content: <ArrowUp size={14} /> },
  { key: "down", label: "Down arrow", content: <ArrowDown size={14} /> },
  { key: "right", label: "Right arrow", content: <ArrowRight size={14} /> },
]

/**
 * The keys a phone's keyboard does not have, for the focused shell. Pressing one keeps the
 * keyboard up, so a key can follow typing without the terminal losing focus.
 */
function TouchKeys({ terminalId }: { terminalId: string }): React.JSX.Element {
  return (
    <div
      role="toolbar"
      aria-label="Terminal keys"
      className="flex min-w-0 gap-[6px] overflow-x-auto [padding:6px_10px_max(6px,_env(safe-area-inset-bottom))] border-t-[1px] border-t-[color:var(--line-subtle)] [scrollbar-width:none]"
    >
      {touchKeys.map(({ key, label, content }) => (
        <BaseButton
          key={key}
          type="button"
          aria-label={label}
          className="motion-colors grid h-[34px] min-w-[44px] flex-none place-items-center [padding:0_10px] border-[1px] border-[color:var(--line)] rounded-[var(--radius)] bg-[var(--surface-button)] text-[var(--text-secondary)] [font:12px_var(--font-mono)] cursor-default [&:active]:bg-[var(--surface-active)] [&:active]:text-[var(--text-primary)]"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => terminalKey(terminalId, key)}
        >
          {content}
        </BaseButton>
      ))}
    </div>
  )
}

/** A thread's shells, split into panes below its conversation. */
export function TerminalPanel({
  thread,
  terminals,
}: {
  thread: Thread
  terminals: ThreadTerminals
}): React.JSX.Element {
  const info = useTerminalStore((state) => state.info[terminals.focusedId])
  const store = useTerminalStore.getState
  const toggleChord = useKeybindings((state) => state.bindings.toggleTerminal)
  return (
    <section
      className="grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)_auto]"
      aria-label={`Terminals for ${thread.title}`}
    >
      <div className="flex min-w-0 items-center gap-[2px] [padding:3px_6px_3px_12px] text-[var(--text-tertiary)] text-[12px]">
        <SquareTerminal size={14} className="flex-none mr-[7px]" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center">
          <TerminalTitle info={info} />
        </div>
        <IconButton label="Split right" onClick={() => store().split(thread.id, "horizontal")}>
          <Columns2 size={14} />
        </IconButton>
        <IconButton label="Split down" onClick={() => store().split(thread.id, "vertical")}>
          <Rows2 size={14} />
        </IconButton>
        <IconButton
          label={withShortcut("Hide terminal", toggleChord)}
          onClick={() => store().toggle(thread.id)}
        >
          <ChevronDown size={15} />
        </IconButton>
      </div>
      <TerminalNode node={terminals.layout} thread={thread} terminals={terminals} />
      {touchOnly && <TouchKeys terminalId={terminals.focusedId} />}
    </section>
  )
}

const terminalPaneClasses = [
  "motion-colors relative w-full h-full min-w-0 min-h-0 overflow-hidden",
  "[&[data-dimmed]_.terminal-host]:opacity-[0.62] [&_.terminal-host]:[transition:opacity_calc(120ms_*_var(--motion-scale,_1))]",
  "[&:hover_.terminal-pane-close]:opacity-[1]",
].join(" ")
