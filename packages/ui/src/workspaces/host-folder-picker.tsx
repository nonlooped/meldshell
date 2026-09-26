import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import type { HostFolders, InvokeApi } from "@meldshell/contracts/ipc"
import { errorMessage } from "@meldshell/contracts"
import { AppDialog, Button, TextField } from "../ui/controls"

function FolderPicker({ api, finish }: { api: InvokeApi; finish: (path: string | null) => void }) {
  const [folder, setFolder] = useState<HostFolders | null>(null)
  const [path, setPath] = useState("")
  const [requested, setRequested] = useState("")
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setBusy(true)
    setError(null)
    void api
      .browseHostFolders(requested)
      .then(
        (next) => {
          if (!active) return
          setFolder(next)
          setPath(next.path)
        },
        (cause: unknown) => {
          if (active) setError(errorMessage(cause))
        },
      )
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [api, requested])
  return (
    <AppDialog
      open
      title="Add a workspace on the host"
      onOpenChange={(open) => {
        if (!open) finish(null)
      }}
      actions={
        <>
          <Button onClick={() => finish(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || folder === null || error !== null}
            onClick={() => finish(folder!.path)}
          >
            Add workspace
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setRequested(path)
        }}
      >
        <TextField label="Host folder path" value={path} onValueChange={setPath} />
        <Button type="submit" disabled={busy}>
          Go
        </Button>
        <Button disabled={busy || !folder?.parent} onClick={() => setRequested(folder!.parent!)}>
          Up
        </Button>
        <Button disabled={busy} onClick={() => setRequested("")}>
          Home
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div
        aria-label="Host folders"
        aria-busy={busy}
        className="grid max-h-[320px] overflow-auto gap-[4px]"
      >
        {busy ? (
          <p>Loading folders…</p>
        ) : (
          folder?.folders.map((entry) => (
            <Button key={entry.path} onClick={() => setRequested(entry.path)}>
              {entry.name}
            </Button>
          ))
        )}
        {!busy && folder?.folders.length === 0 && <p>No subfolders.</p>}
      </div>
    </AppDialog>
  )
}

/** The browser chooses a host path; it never opens an unattended native picker. */
export function selectHostFolder(api: InvokeApi): Promise<string | null> {
  return new Promise((resolve) => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    root.render(
      <FolderPicker
        api={api}
        finish={(path) => {
          resolve(path)
          root.unmount()
          container.remove()
        }}
      />,
    )
  })
}
