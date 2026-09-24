import { useEffect, useRef } from "react"
import type { Thread } from "@meldshell/contracts"
import { Group, Panel, Separator } from "react-resizable-panels"
import { ChevronDown, Columns2, Rows2, SquareTerminal, Trash2, X } from "lucide-react"
import { IconButton } from "../ui/controls"
import { paneSeparatorClasses } from "../ui/styles"
import type { TerminalLayout } from "./terminal-layout"
import {
  attachTerminal,
  useTerminalStore,
  type TerminalInfo,
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
    <span className="flex min-w-0 items-baseline gap-[7px]" title={info.cwd}>
      <span className="flex-none text-[var(--text-secondary)]">{info.shell}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {shortPath(info.cwd)}
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
      <div
        ref={hostRef}
        className="terminal-host absolute [inset:0] [padding:6px_6px_4px_12px]"
        style={{ zoom: "calc(1 / var(--app-scale, 1))" }}
      />
      {multiple && (
        <IconButton
          unstyled
          className="motion-colors terminal-pane-close absolute top-[6px] right-[10px] z-[12] grid w-[20px] h-[20px] p-0 border-0 rounded-[4px] bg-[var(--surface-menu)] text-[var(--text-tertiary)] cursor-default place-items-center opacity-[0] [&:focus-visible]:opacity-[1] [&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]"
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
  return (
    <section
      className="grid h-full min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)]"
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
          label="End this terminal"
          onClick={() => store().close(thread.id, terminals.focusedId)}
        >
          <Trash2 size={14} />
        </IconButton>
        <IconButton label="Hide terminal (Ctrl+`)" onClick={() => store().toggle(thread.id)}>
          <ChevronDown size={15} />
        </IconButton>
      </div>
      <TerminalNode node={terminals.layout} thread={thread} terminals={terminals} />
    </section>
  )
}

const terminalPaneClasses = [
  "motion-colors relative w-full h-full min-w-0 min-h-0 overflow-hidden",
  "[&[data-dimmed]_.terminal-host]:opacity-[0.62] [&_.terminal-host]:[transition:opacity_calc(120ms_*_var(--motion-scale,_1))]",
  "[&:hover_.terminal-pane-close]:opacity-[1]",
].join(" ")
