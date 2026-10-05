import { useState } from "react"
import { errorMessage, type Workspace } from "@meldshell/contracts"
import { Folder, FolderPlus } from "lucide-react"
import { AppDialog, Button, ContextMenu, MenuAction, TextField } from "../ui/controls"
import { HomeMark, splitHome } from "./WorkspaceLabel"

export function WorkspaceManager({
  workspaces,
  onAdd,
  onRename,
  onRemove,
}: {
  readonly workspaces: ReadonlyArray<Workspace>
  readonly onAdd: () => Promise<unknown>
  readonly onRename: (workspaceId: string, name: string) => Promise<unknown>
  readonly onRemove: (workspaceId: string) => Promise<unknown>
}): React.JSX.Element {
  const { home, projects } = splitHome(workspaces)
  const [editing, setEditing] = useState<Workspace | null>(null)
  const [removing, setRemoving] = useState<Workspace | null>(null)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setPending(true)
    setError("")
    try {
      await action()
      setEditing(null)
      setRemoving(null)
    } catch (cause) {
      setError(errorMessage(cause, "The workspace could not be updated."))
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <div className="flex justify-between items-center gap-[16px] [margin:10px_0_24px] text-[var(--text-secondary)] text-[12px]">
        <span>
          {workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}
        </span>
        <Button disabled={pending} icon={<FolderPlus size={15} />} onClick={() => void run(onAdd)}>
          Add workspace
        </Button>
      </div>
      {error && !editing && !removing && <p role="alert">{error}</p>}
      {projects.length === 0 && (
        <p className="settings-empty [padding:28px_0] text-[var(--text-tertiary)] text-[13px] text-center">
          Add a project folder to start a workspace.
        </p>
      )}
      {[...(home === undefined ? [] : [home]), ...projects].map((workspace) => (
        <ContextMenu
          key={workspace.id}
          trigger={
            <section
              className={
                workspace.home === true
                  ? `${workspaceCardClasses} ${homeCardClasses}`
                  : workspaceCardClasses
              }
            >
              {workspace.home === true ? <HomeMark size={19} /> : <Folder size={19} />}
              <div className="min-w-0 flex-1">
                <h3>
                  {workspace.name}
                  {workspace.home === true && <span className={homeTagClasses}>Home folder</span>}
                </h3>
                <code>{workspace.path}</code>
              </div>
              <div className="flex flex-wrap gap-[8px] [@media(max-width:_1050px)]:ml-[35px]">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setError("")
                    setName(workspace.name)
                    setEditing(workspace)
                  }}
                >
                  Rename
                </Button>
                {workspace.home !== true && (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setError("")
                      setRemoving(workspace)
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </section>
          }
        >
          <MenuAction
            onClick={() => {
              setName(workspace.name)
              setEditing(workspace)
            }}
          >
            Rename workspace…
          </MenuAction>
          <MenuAction onClick={() => void navigator.clipboard.writeText(workspace.path)}>
            Copy workspace path
          </MenuAction>
          {window.meldshell.desktop?.openInEditor && (
            <MenuAction
              onClick={() =>
                void window.meldshell.desktop?.openInEditor?.({
                  workspaceId: workspace.id,
                  editorId: "file-manager",
                })
              }
            >
              Open in file manager
            </MenuAction>
          )}
          {workspace.home !== true && (
            <MenuAction onClick={() => setRemoving(workspace)}>Remove workspace…</MenuAction>
          )}
        </ContextMenu>
      ))}
      <AppDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setEditing(null)
        }}
        title="Rename workspace"
        actions={
          <>
            <Button disabled={pending} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={pending || !name.trim()}
              onClick={() => {
                if (editing) void run(() => onRename(editing.id, name.trim()))
              }}
            >
              Save name
            </Button>
          </>
        }
      >
        <TextField
          autoFocus
          label="Workspace name"
          value={name}
          maxLength={100}
          onValueChange={setName}
        />
        <p className="m-0 text-[var(--text-secondary)] text-[12px] leading-[1.6]">
          This changes the name in MeldShell. The folder stays at its current path.
        </p>
        {error && <p role="alert">{error}</p>}
      </AppDialog>
      <AppDialog
        alert
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRemoving(null)
        }}
        title="Remove workspace?"
        actions={
          <>
            <Button disabled={pending} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (removing) void run(() => onRemove(removing.id))
              }}
            >
              {pending ? "Removing…" : "Remove workspace"}
            </Button>
          </>
        }
      >
        <p>
          Remove &quot;{removing?.name}&quot; and permanently delete all of its threads and
          transcripts from MeldShell?
        </p>
        <p>
          The folder and files on disk will be kept. Transcript deletion cannot be undone. Stop any
          running threads before removing the workspace.
        </p>
        {error && <p role="alert">{error}</p>}
      </AppDialog>
    </>
  )
}

/** Home sits first on a faint accent wash, so it reads as built in rather than one more project. */
const homeCardClasses =
  "[padding:16px_14px]! mb-[8px] rounded-[var(--radius-lg)] border-[1px]! border-[color:color-mix(in_srgb,var(--accent)_28%,transparent)]! bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]"

const homeTagClasses =
  "ml-[8px] inline-flex items-center h-[18px] [padding:0_7px] rounded-full align-middle bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)] text-[11px] font-medium"

const workspaceCardClasses = [
  "flex items-center gap-[16px] [padding:20px_0] border-b-[1px] border-b-[color:var(--line-subtle)]",
  "[&_>_svg]:shrink-0 [&_>_svg]:text-[var(--text-tertiary)] [&_h3]:[margin:0_0_7px] [&_h3]:text-[13px]",
  "[&_h3]:font-medium [&_h3]:[overflow-wrap:anywhere] [&_code]:[font:11px_var(--font-mono)]",
  "[&_code]:text-[var(--text-secondary)] [&_code]:[overflow-wrap:anywhere]",
  "[@media(max-width:_1050px)]:flex-wrap",
].join(" ")
