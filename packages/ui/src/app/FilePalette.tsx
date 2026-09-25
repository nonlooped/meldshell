import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { Workspace } from "@meldshell/contracts"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { useState } from "react"
import { FileIcon } from "../ui/FileIcon"
import { Palette, PaletteRow, PaletteSearch, useDebouncedQuery } from "./Palette"

const FILE_LIMIT = 30

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1)
const parentPath = (path: string): string => path.slice(0, Math.max(path.lastIndexOf("/"), 0))

/** Ctrl+P: open a file in the active workspace by name. */
export function FilePalette({
  open,
  onOpenChange,
  workspaces,
  activeScope,
  onOpenFile,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly workspaces: ReadonlyArray<Workspace>
  /** Files come from the active tab's checkout, or the most recent workspace without one. */
  readonly activeScope: WorkspaceScope | undefined
  readonly onOpenFile: (scope: WorkspaceScope, path: string) => void
}): React.JSX.Element {
  const scope: WorkspaceScope | undefined =
    activeScope ?? (workspaces[0] === undefined ? undefined : { workspaceId: workspaces[0].id })
  return (
    <Palette open={open} onOpenChange={onOpenChange} title="Go to file">
      <FileSearch
        scope={scope}
        workspaceName={workspaces.find((workspace) => workspace.id === scope?.workspaceId)?.name}
        onPick={(path) => {
          if (scope !== undefined) onOpenFile(scope, path)
          onOpenChange(false)
        }}
      />
    </Palette>
  )
}

function FileSearch({
  scope,
  workspaceName,
  onPick,
}: {
  readonly scope: WorkspaceScope | undefined
  readonly workspaceName: string | undefined
  readonly onPick: (path: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const debounced = useDebouncedQuery(query)
  const files = useQuery({
    queryKey: ["workspace-paths", scope?.workspaceId, scope?.threadId ?? null, debounced],
    queryFn: () =>
      window.meldshell.searchWorkspacePaths({ ...scope!, query: debounced, limit: FILE_LIMIT }),
    enabled: scope !== undefined && debounced !== "",
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })
  const paths =
    debounced === "" || files.isError
      ? []
      : (files.data ?? []).filter((match) => !match.directory).map((match) => match.path)
  return (
    <PaletteSearch<string>
      items={paths}
      query={query}
      onQueryChange={setQuery}
      placeholder={workspaceName === undefined ? "Go to file" : `Go to file in ${workspaceName}`}
      itemKey={(path) => path}
      itemLabel={(path) => path}
      onPick={onPick}
      renderItem={(path) => (
        <PaletteRow
          icon={<FileIcon path={path} size={15} />}
          label={baseName(path)}
          detail={parentPath(path)}
          monoDetail
        />
      )}
    />
  )
}
