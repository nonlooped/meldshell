import type { WorkspaceScope } from "@meldshell/contracts/ipc"
import { MenuAction } from "./controls"

export function CopyAbsolutePathAction({ scope, path }: { scope: WorkspaceScope; path: string }) {
  return (
    <MenuAction
      onClick={() =>
        void window.meldshell
          .workspaceAbsolutePath({ ...scope, path })
          .then((absolute) => navigator.clipboard.writeText(absolute))
      }
    >
      Copy absolute path
    </MenuAction>
  )
}

export function RevealFileAction({ scope, path }: { scope: WorkspaceScope; path: string }) {
  const reveal = window.meldshell.desktop?.revealFile
  if (!reveal) return null
  return (
    <MenuAction onClick={() => void reveal({ ...scope, path })}>Reveal in file manager</MenuAction>
  )
}
