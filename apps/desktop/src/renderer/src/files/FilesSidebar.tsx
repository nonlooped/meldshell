import { Tabs } from "@base-ui-components/react/tabs"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Workspace } from "@meldshell/contracts"
import type { DirectoryEntry } from "@meldshell/contracts/ipc"
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react"
import { GitSidebar } from "./GitSidebar"
import { FileIcon } from "../ui/FileIcon"
import { Button, IconButton } from "../ui/controls"
import { useTabStore } from "../app/tab-store"

function statusKind(status: string): string {
  if (status === "!!") return "ignored"
  if (status === "??" || status.includes("A")) return "added"
  if (/U|AA|DD/.test(status)) return "conflict"
  if (status.includes("D")) return "deleted"
  if (/[RC]/.test(status)) return "renamed"
  return status ? "modified" : "clean"
}

function FileRow({
  entry,
  workspaceId,
  depth,
}: {
  entry: DirectoryEntry
  workspaceId: string
  depth: number
}) {
  const [expanded, setExpanded] = useState(false)
  const openFile = useTabStore((state) => state.openFile)
  const row = (
    <BaseButton
      type="button"
      className={
        "flex items-center gap-[6px] w-full min-h-[28px] [padding:3px_10px] border-0 bg-transparent text-inherit text-left cursor-pointer [&:hover]:bg-[var(--surface-hover)] [&_>_svg]:shrink-0 [&_>_svg]:w-[12px] [&_>_.file-icon]:w-[16px]"
      }
      style={{ paddingLeft: 10 + depth * 14 }}
      title={`${entry.path}${entry.status ? ` (${statusKind(entry.status)})` : ""}`}
      onClick={entry.directory ? undefined : () => openFile(workspaceId, entry.path)}
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
      <span className={explorerNameClasses} data-kind={statusKind(entry.status)}>
        {entry.name}
      </span>
    </BaseButton>
  )
  if (!entry.directory) return <li>{row}</li>
  return (
    <Collapsible.Root render={<li />} open={expanded} onOpenChange={setExpanded}>
      <Collapsible.Trigger render={row} />
      <Collapsible.Panel>
        <Directory
          workspaceId={workspaceId}
          path={entry.path}
          depth={depth + 1}
          inheritedStatus={entry.status}
        />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function Directory({
  workspaceId,
  path,
  depth = 0,
  inheritedStatus = "",
}: {
  workspaceId: string
  path: string
  depth?: number
  inheritedStatus?: string
}) {
  const [limit, setLimit] = useState(300)
  const query = useQuery({
    queryKey: ["workspace-directory", workspaceId, path],
    queryFn: () => window.meldshell.listDirectory({ workspaceId, path }),
    staleTime: 5000,
    retry: false,
  })
  if (query.isPending)
    return (
      <p
        className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
        role="status"
      >
        Loading files…
      </p>
    )
  if (query.isError)
    return (
      <div
        className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]"
        role="alert"
      >
        {query.error.message}
        <Button size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    )
  return (
    <ul className="[list-style:none] p-0 m-0" aria-label={path || "Workspace files"}>
      {query.data.slice(0, limit).map((entry) => (
        <FileRow
          key={entry.path}
          entry={{
            ...entry,
            status: entry.status || (["!!", "??"].includes(inheritedStatus) ? inheritedStatus : ""),
          }}
          workspaceId={workspaceId}
          depth={depth}
        />
      ))}
      {query.data.length === 0 && (
        <li className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
          Empty folder
        </li>
      )}
      {query.data.length > limit && (
        <li>
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
  threadId,
}: {
  workspace?: Workspace
  threadId?: string
}) {
  const client = useQueryClient()
  return (
    <Tabs.Root defaultValue="files" className="flex flex-col h-full min-h-0 overflow-hidden">
      <Tabs.List className={workspaceSidebarTabsClasses} aria-label="Workspace sidebar">
        <Tabs.Tab value="files">Files</Tabs.Tab>
        <Tabs.Tab value="changes">Changes</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="files" className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex items-center shrink-0 pr-[6px] [&_.git-section-heading]:flex-1 [&_.git-section-heading]:min-w-0">
          <span
            className="flex-1 [padding:8px_12px] overflow-hidden text-ellipsis whitespace-nowrap"
            title={workspace?.path}
          >
            {workspace?.name ?? "Files"}
          </span>
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
        <div className="overflow-y-auto [scrollbar-gutter:stable] overflow-auto flex-1">
          {workspace ? (
            <Directory key={workspace.id} workspaceId={workspace.id} path="" />
          ) : (
            <p className="[margin:12px_14px] leading-[1.6] [overflow-wrap:anywhere] [&[role='alert']]:text-[var(--color-deleted)]">
              Choose a thread to browse its workspace.
            </p>
          )}
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="changes" className="flex flex-col h-full min-h-0 overflow-hidden">
        <GitSidebar workspace={workspace} threadId={threadId} />
      </Tabs.Panel>
    </Tabs.Root>
  )
}

const explorerNameClasses = [
  "overflow-hidden text-ellipsis whitespace-nowrap [&[data-kind='added']]:text-[var(--color-added)]",
  "[&[data-kind='modified']]:text-[var(--color-modified)]",
  "[&[data-kind='renamed']]:text-[var(--color-renamed)]",
  "[&[data-kind='deleted']]:text-[var(--color-deleted)]",
  "[&[data-kind='conflict']]:text-[var(--color-deleted)]",
  "[&[data-kind='ignored']]:text-[var(--text-tertiary)]",
].join(" ")

const workspaceSidebarTabsClasses = [
  "flex gap-[16px] [padding:0_12px] border-b-[1px] border-b-[color:var(--line)] shrink-0",
  "[&_button]:[background:none] [&_button]:border-0 [&_button]:border-b-[2px] [&_button]:border-b-[color:transparent]",
  "[&_button]:text-[var(--text-secondary)] [&_button]:[padding:10px_0] [&_button]:cursor-pointer",
  "[&_button[data-active]]:text-[var(--text-primary)]",
  "[&_button[data-active]]:[border-bottom-color:currentColor]",
].join(" ")
