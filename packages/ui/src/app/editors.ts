import { useMutation, useQuery } from "@tanstack/react-query"
import type { ExternalEditor, WorkspaceScope } from "@meldshell/contracts/ipc"
import type { SetAppSettingsInput } from "@meldshell/contracts"

const desktopApi = window.meldshell.desktop
const noEditors: readonly ExternalEditor[] = []

/**
 * Opens the folder on screen in an external editor. Choosing an editor remembers it, so the
 * shortcut and the next menu open it first. `editors` is empty on a remote client.
 */
export function useOpenInEditor(
  scope: WorkspaceScope | undefined,
  preferred: string | undefined,
  savePreference: (input: SetAppSettingsInput) => void,
) {
  // Installing an editor while MeldShell runs is rare, but the menu should notice it eventually.
  const editors = useQuery({
    queryKey: ["external-editors"],
    queryFn: () => desktopApi!.listEditors(),
    enabled: desktopApi !== undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: "always",
  })
  const list = editors.data ?? noEditors
  const ordered = [
    ...list.filter((editor) => editor.id === preferred),
    ...list.filter((editor) => editor.id !== preferred),
  ]
  const mutation = useMutation({
    mutationFn: (input: WorkspaceScope & { editorId: string }) => desktopApi!.openInEditor(input),
  })
  const open = (editorId?: string): void => {
    const chosen = editorId ?? ordered[0]?.id
    if (scope === undefined || chosen === undefined || desktopApi === undefined) return
    if (chosen !== preferred) savePreference({ editor: chosen })
    mutation.mutate({ ...scope, editorId: chosen })
  }
  return {
    /** Null when this client cannot open editors or nothing is on screen. */
    editors: desktopApi === undefined || scope === undefined ? null : ordered,
    open,
    mutation,
  }
}
