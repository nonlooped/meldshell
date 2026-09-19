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
      className="explorer-row"
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
        <span className="explorer-spacer" />
      )}
      <FileIcon path={entry.path} directory={entry.directory} expanded={expanded} />
      <span className="explorer-name" data-kind={statusKind(entry.status)}>
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
      <p className="git-notice" role="status">
        Loading files…
      </p>
    )
  if (query.isError)
    return (
      <div className="git-notice" role="alert">
        {query.error.message}
        <Button size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    )
  return (
    <ul className="explorer-list" aria-label={path || "Workspace files"}>
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
      {query.data.length === 0 && <li className="git-notice">Empty folder</li>}
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
    <Tabs.Root defaultValue="files" className="workspace-sidebar">
      <Tabs.List className="workspace-sidebar-tabs" aria-label="Workspace sidebar">
        <Tabs.Tab value="files">Files</Tabs.Tab>
        <Tabs.Tab value="changes">Changes</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="files" className="explorer-panel">
        <div className="git-section-toolbar">
          <span className="explorer-workspace" title={workspace?.path}>
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
        <div className="scrollable explorer-body">
          {workspace ? (
            <Directory key={workspace.id} workspaceId={workspace.id} path="" />
          ) : (
            <p className="git-notice">Choose a thread to browse its workspace.</p>
          )}
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="changes" className="explorer-panel">
        <GitSidebar workspace={workspace} threadId={threadId} />
      </Tabs.Panel>
    </Tabs.Root>
  )
}
