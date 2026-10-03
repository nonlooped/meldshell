import { Tabs } from "@base-ui-components/react/tabs"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { CollapsiblePanel, TabIndicator } from "../ui/motion"
import { TreeSkeleton } from "../ui/Skeleton"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Thread, Workspace } from "@meldshell/contracts"
import type { DirectoryEntry, WorkspaceScope } from "@meldshell/contracts/ipc"
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react"
import { GitSidebar } from "./GitSidebar"
import { ContentSearch } from "./ContentSearch"
import { useContentSearch, type FilesSidebarTab } from "./content-search-store"
import { WorktreeBar } from "./WorktreeBar"
import { scopeKey } from "../data/workspace-scope"
import { FileIcon } from "../ui/FileIcon"
import {
  AppDialog,
  Button,
  ContextMenu,
  IconButton,
  MenuAction,
  PanelNote,
  QueryError,
  TextField,
} from "../ui/controls"
import { useTabStore } from "../app/tab-store"
import { panelNoteClasses, panelTabsClasses } from "../ui/styles"
import { CopyAbsolutePathAction, RevealFileAction } from "../ui/FileContextActions"

type FileOperation = "create-file" | "create-folder" | "rename" | "delete"

function FileActionDialog({
  scope,
  path,
  operation,
  initialName = "",
  onClose,
  onComplete,
}: {
  scope: WorkspaceScope
  path: string
  operation: FileOperation
  initialName?: string
  onClose: () => void
  onComplete?: (name: string) => void
}) {
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const client = useQueryClient()
  const title = {
    "create-file": "New file",
    "create-folder": "New folder",
    rename: "Rename",
    delete: "Delete from disk?",
  }[operation]
  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      await window.meldshell.workspaceFileAction({
        ...scope,
        path,
        action: operation,
        name: operation === "delete" ? undefined : name.trim(),
      })
      await Promise.all([
        client.invalidateQueries({ queryKey: ["workspace-directory", ...scopeKey(scope)] }),
        client.invalidateQueries({ queryKey: ["workspace-file", ...scopeKey(scope)] }),
        client.invalidateQueries({ queryKey: ["git", ...scopeKey(scope)] }),
      ])
      onComplete?.(name.trim())
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AppDialog
      open
      alert={operation === "delete"}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      title={title}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || (operation !== "delete" && !name.trim())}
            onClick={() => void submit()}
          >
            {title}
          </Button>
        </>
      }
    >
      {operation === "delete" ? (
        <p>Delete “{path}” from disk? Folders and their contents will be removed.</p>
      ) : (
        <TextField
          autoFocus
          label={operation === "create-folder" ? "Folder name" : "File name"}
          value={name}
          onValueChange={setName}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </AppDialog>
  )
}

function statusKind(status: string): string {
  if (status === "!!") return "ignored"
  if (status === "??" || status.includes("A")) return "added"
  if (/U|AA|DD/.test(status)) return "conflict"
  if (status.includes("D")) return "deleted"
  if (/[RC]/.test(status)) return "renamed"
  return status ? "modified" : "clean"
}

const statusLetters: Readonly<Record<string, string>> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  conflict: "!",
}

/** Guides mark each ancestor level under its chevron. */
function indentGuides(depth: number): React.CSSProperties {
  if (depth === 0) return {}
  const levels = Array.from({ length: depth }, (_, level) => level)
  return {
    backgroundImage: levels
      .map(() => "linear-gradient(var(--line-subtle), var(--line-subtle))")
      .join(", "),
    backgroundSize: "1px 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: levels.map((level) => `${16 + level * 14}px 0`).join(", "),
  }
}

/**
 * Tree keyboard navigation: Up and Down move between visible rows, Right opens a folder or enters
 * it, Left closes a folder or returns to its parent, and Home and End jump to the ends.
 */
function moveInTree(event: React.KeyboardEvent<HTMLElement>) {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]')
  if (item === null) return
  // Rows in a folder that is folding shut are on their way out.
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]'),
  ).filter((candidate) => candidate.closest("[data-ending-style]") === null)
  const index = items.indexOf(item)
  const level = Number(item.getAttribute("aria-level"))
  const expanded = item.getAttribute("aria-expanded")
  const focus = (target: HTMLElement | null | undefined) => {
    if (!target) return
    event.preventDefault()
    target.focus()
  }
  switch (event.key) {
    case "ArrowDown":
      return focus(items[index + 1])
    case "ArrowUp":
      return focus(items[index - 1])
    case "Home":
      return focus(items[0])
    case "End":
      return focus(items.at(-1))
    case "ArrowRight": {
      if (expanded === "false") {
        event.preventDefault()
        item.click()
        return
      }
      const next = items[index + 1]
      if (expanded === "true" && next && Number(next.getAttribute("aria-level")) > level)
        focus(next)
      return
    }
    case "ArrowLeft": {
      if (expanded === "true") {
        event.preventDefault()
        item.click()
        return
      }
      const parent = item.closest("li")?.parentElement?.closest("li")
      return focus(parent?.querySelector<HTMLElement>(':scope > [role="treeitem"]'))
    }
  }
}

function FileRow({
  entry,
  scope,
  depth,
}: {
  entry: DirectoryEntry
  scope: WorkspaceScope
  depth: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [operation, setOperation] = useState<FileOperation | null>(null)
  const openFile = useTabStore((state) => state.openFile)
  const openDiff = useTabStore((state) => state.openDiff)
  const client = useQueryClient()
  const kind = statusKind(entry.status)
  const letter = statusLetters[kind]
  const row = (
    <BaseButton
      type="button"
      role="treeitem"
      aria-level={depth + 1}
      className={
        "flex items-center gap-[6px] w-full h-[24px] [padding:0_10px] border-0 bg-transparent text-inherit text-left cursor-pointer [&:hover]:bg-[var(--surface-hover)] [&_>_svg]:shrink-0 [&_>_svg]:w-[12px] [&_>_.file-icon]:w-[16px]"
      }
      style={{ paddingLeft: 10 + depth * 14, ...indentGuides(depth) }}
      title={`${entry.path}${entry.status ? ` (${kind})` : ""}`}
      onClick={entry.directory ? undefined : () => openFile(scope, entry.path)}
    >
      {entry.directory ? (
        expanded ? (
          <ChevronDown size={12} />
        ) : (
          <ChevronRight size={12} />
        )
      ) : (
        <span className="shrink-0 w-[12px]" />
      )}
      <FileIcon path={entry.path} directory={entry.directory} expanded={expanded} />
      <span className={explorerNameClasses} data-kind={kind}>
        {entry.name}
      </span>
      {letter !== undefined &&
        (entry.directory ? (
          <span
            className={`${statusMarkClasses} w-[6px] h-[6px] mr-[4px] rounded-full bg-current`}
            data-kind={kind}
            aria-hidden="true"
          />
        ) : (
          <span
            className={`${statusMarkClasses} w-[14px] text-center [font:500_10.5px_var(--font-mono)]`}
            data-kind={kind}
            aria-hidden="true"
          >
            {letter}
          </span>
        ))}
    </BaseButton>
  )
  const actions = (
    <>
      {entry.directory ? (
        <MenuAction onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Collapse folder" : "Expand folder"}
        </MenuAction>
      ) : (
        <>
          <MenuAction onClick={() => openFile(scope, entry.path)}>Open file</MenuAction>
          {entry.status &&
            entry.status !== "!!" &&
            entry.status[0] !== " " &&
            entry.status !== "??" && (
              <MenuAction onClick={() => openDiff(scope, entry.path, "staged")}>
                Open staged changes
              </MenuAction>
            )}
          {entry.status &&
            entry.status !== "!!" &&
            (entry.status[1] !== " " || entry.status === "??") && (
              <MenuAction onClick={() => openDiff(scope, entry.path, "unstaged")}>
                Open unstaged changes
              </MenuAction>
            )}
        </>
      )}
      <MenuAction onClick={() => void navigator.clipboard.writeText(entry.path)}>
        Copy relative path
      </MenuAction>
      <CopyAbsolutePathAction scope={scope} path={entry.path} />
      <RevealFileAction scope={scope} path={entry.path} />
      {entry.directory && (
        <>
          <MenuAction onClick={() => setOperation("create-file")}>New file…</MenuAction>
          <MenuAction onClick={() => setOperation("create-folder")}>New folder…</MenuAction>
        </>
      )}
      <MenuAction onClick={() => setOperation("rename")}>Rename…</MenuAction>
      <MenuAction onClick={() => setOperation("delete")}>Delete from disk…</MenuAction>
      {entry.directory && (
        <MenuAction
          onClick={() =>
            void client.invalidateQueries({
              queryKey: ["workspace-directory", ...scopeKey(scope), entry.path],
            })
          }
        >
          Refresh folder
        </MenuAction>
      )}
    </>
  )
  const dialog = operation && (
    <FileActionDialog
      key={`${entry.path}:${operation}`}
      scope={scope}
      path={entry.path}
      operation={operation}
      initialName={operation === "rename" ? entry.name : ""}
      onClose={() => setOperation(null)}
      onComplete={(name) => {
        if (operation !== "rename" && operation !== "delete") return
        const store = useTabStore.getState()
        const affected = store.files.filter(
          (file) =>
            file.workspaceId === scope.workspaceId &&
            file.threadId === scope.threadId &&
            (file.path === entry.path ||
              (entry.directory && file.path.startsWith(`${entry.path}/`))),
        )
        for (const file of affected) store.closeTab(file.id)
        if (operation === "rename") {
          const parent = entry.path.slice(0, Math.max(0, entry.path.lastIndexOf("/") + 1))
          for (const file of affected) {
            const nextPath = `${parent}${name}${file.path.slice(entry.path.length)}`
            if (file.diffSide) store.openDiff(scope, nextPath, file.diffSide)
            else store.openFile(scope, nextPath, file.line, file.endLine)
          }
        }
      }}
    />
  )
  if (!entry.directory)
    return (
      <>
        <li role="none">
          <ContextMenu trigger={row}>{actions}</ContextMenu>
        </li>
        {dialog}
      </>
    )
  return (
    <>
      <Collapsible.Root render={<li role="none" />} open={expanded} onOpenChange={setExpanded}>
        <ContextMenu trigger={<Collapsible.Trigger render={row} />}>{actions}</ContextMenu>
        <CollapsiblePanel>
          <Directory
            scope={scope}
            path={entry.path}
            depth={depth + 1}
            inheritedStatus={entry.status}
          />
        </CollapsiblePanel>
      </Collapsible.Root>
      {dialog}
    </>
  )
}

function Directory({
  scope,
  path,
  depth = 0,
  inheritedStatus = "",
}: {
  scope: WorkspaceScope
  path: string
  depth?: number
  inheritedStatus?: string
}) {
  const [limit, setLimit] = useState(300)
  const query = useQuery({
    queryKey: ["workspace-directory", ...scopeKey(scope), path],
    queryFn: () => window.meldshell.listDirectory({ ...scope, path }),
    staleTime: 5000,
    retry: false,
  })
  if (query.isPending)
    return <TreeSkeleton label="Loading files…" rows={depth === 0 ? undefined : 3} depth={depth} />
  if (query.isError) return <QueryError query={query} />
  return (
    <ul
      className="motion-enter shrink-0 [list-style:none] p-0 m-0"
      role={depth === 0 ? "tree" : "group"}
      aria-label={path || "Workspace files"}
      onKeyDown={depth === 0 ? moveInTree : undefined}
    >
      {query.data.slice(0, limit).map((entry) => (
        <FileRow
          key={entry.path}
          entry={{
            ...entry,
            status: entry.status || (["!!", "??"].includes(inheritedStatus) ? inheritedStatus : ""),
          }}
          scope={scope}
          depth={depth}
        />
      ))}
      {query.data.length === 0 && (
        <li role="none" className={panelNoteClasses}>
          Empty folder
        </li>
      )}
      {query.data.length > limit && (
        <li role="none">
          <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 300)}>
            Show more ({query.data.length - limit} remaining)
          </Button>
        </li>
      )}
    </ul>
  )
}

export function FilesSidebar({
  workspace,
  scope,
  worktreeThread,
  threadId,
}: {
  workspace?: Workspace
  /** The folder shown: a worktree thread's checkout or the workspace itself. */
  scope?: WorkspaceScope
  /** The thread that owns `scope` when it is a worktree. */
  worktreeThread?: Thread
  threadId?: string
}) {
  const client = useQueryClient()
  const [rootOperation, setRootOperation] = useState<FileOperation | null>(null)
  const tab = useContentSearch((state) => state.tab)
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value: FilesSidebarTab) => useContentSearch.getState().setTab(value)}
      className="flex flex-col h-full min-h-0 overflow-hidden"
    >
      {worktreeThread !== undefined && <WorktreeBar thread={worktreeThread} />}
      <Tabs.List className={panelTabsClasses} aria-label="Workspace sidebar">
        <TabIndicator className="rounded-[var(--radius)] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-selected)]" />
        <Tabs.Tab value="files">Files</Tabs.Tab>
        <Tabs.Tab value="changes">Changes</Tabs.Tab>
        <Tabs.Tab value="search">Search</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="files" className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex items-center shrink-0 pr-[6px] [&_.git-section-heading]:flex-1 [&_.git-section-heading]:min-w-0">
          <ContextMenu
            trigger={
              <span
                className="flex-1 [padding:8px_12px] overflow-hidden text-ellipsis whitespace-nowrap"
                title={worktreeThread?.worktree?.path ?? workspace?.path}
              >
                {workspace?.name ?? "Files"}
              </span>
            }
          >
            {scope && (
              <MenuAction onClick={() => setRootOperation("create-file")}>New file…</MenuAction>
            )}
            {scope && (
              <MenuAction onClick={() => setRootOperation("create-folder")}>New folder…</MenuAction>
            )}
            {scope && (
              <MenuAction
                onClick={() =>
                  void window.meldshell
                    .workspaceAbsolutePath({ ...scope, path: "" })
                    .then((path) => navigator.clipboard.writeText(path))
                }
              >
                Copy workspace path
              </MenuAction>
            )}
            <MenuAction
              onClick={() =>
                void client.invalidateQueries({ queryKey: ["workspace-directory", workspace?.id] })
              }
            >
              Refresh files
            </MenuAction>
          </ContextMenu>
          <IconButton
            label="Refresh files"
            onClick={() => {
              void client.invalidateQueries({ queryKey: ["workspace-directory", workspace?.id] })
              void client.invalidateQueries({ queryKey: ["workspace-file", workspace?.id] })
            }}
          >
            <RefreshCw size={14} />
          </IconButton>
        </div>
        <div className="flex flex-col overflow-y-auto [scrollbar-gutter:stable] overflow-auto flex-1">
          {workspace && scope ? (
            <Directory key={workspace.id} scope={scope} path="" />
          ) : (
            <PanelNote>Choose a thread to browse its workspace.</PanelNote>
          )}
          {scope && (
            <ContextMenu
              trigger={<div className="flex-1 min-h-[48px]" aria-label="Empty files area" />}
            >
              <MenuAction onClick={() => setRootOperation("create-file")}>New file…</MenuAction>
              <MenuAction onClick={() => setRootOperation("create-folder")}>New folder…</MenuAction>
              <MenuAction
                onClick={() =>
                  void client.invalidateQueries({
                    queryKey: ["workspace-directory", scope.workspaceId],
                  })
                }
              >
                Refresh files
              </MenuAction>
            </ContextMenu>
          )}
        </div>
      </Tabs.Panel>
      {rootOperation && scope && (
        <FileActionDialog
          key={rootOperation}
          scope={scope}
          path=""
          operation={rootOperation}
          onClose={() => setRootOperation(null)}
        />
      )}
      <Tabs.Panel value="changes" className="flex flex-col h-full min-h-0 overflow-hidden">
        <GitSidebar workspace={workspace} scope={scope} threadId={threadId} />
      </Tabs.Panel>
      <Tabs.Panel value="search" className="flex flex-col h-full min-h-0 overflow-hidden">
        <ContentSearch scope={scope} />
      </Tabs.Panel>
    </Tabs.Root>
  )
}

const explorerNameClasses = [
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap [&[data-kind='added']]:text-[var(--color-added)]",
  "[&[data-kind='modified']]:text-[var(--color-modified)]",
  "[&[data-kind='renamed']]:text-[var(--color-renamed)]",
  "[&[data-kind='deleted']]:text-[var(--color-deleted)]",
  "[&[data-kind='conflict']]:text-[var(--color-deleted)]",
  "[&[data-kind='ignored']]:text-[var(--text-tertiary)]",
].join(" ")

const statusMarkClasses = [
  "ml-[auto] shrink-0 opacity-[0.85] [&[data-kind='added']]:text-[var(--color-added)]",
  "[&[data-kind='modified']]:text-[var(--color-modified)] [&[data-kind='renamed']]:text-[var(--color-renamed)]",
  "[&[data-kind='deleted']]:text-[var(--color-deleted)] [&[data-kind='conflict']]:text-[var(--color-deleted)]",
].join(" ")
