import type { Workspace } from "@meldshell/contracts"
import { House } from "lucide-react"
import { cx } from "../ui/styles"

/** The home workspace's mark: an accent house, so it never reads as one more project folder. */
export function HomeMark({
  size = 13,
  className,
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <House
      size={size}
      strokeWidth={1.9}
      aria-hidden="true"
      // Important, so rows that tint their own icons still show the accent.
      className={cx("shrink-0 text-[var(--accent)]!", className)}
    />
  )
}

/** A workspace's name, led by the home mark when it is the home workspace. */
export function WorkspaceLabel({
  workspace,
  size,
}: {
  workspace: Pick<Workspace, "name" | "home">
  size?: number
}): React.JSX.Element {
  if (workspace.home !== true) return <>{workspace.name}</>
  return (
    <span className="inline-flex min-w-0 items-center gap-[5px]">
      <HomeMark {...(size === undefined ? {} : { size })} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {workspace.name}
      </span>
    </span>
  )
}

/** Splits the home workspace from the projects, so lists can show it first and apart. */
export function splitHome<T extends Pick<Workspace, "home">>(
  workspaces: readonly T[],
): { home: T | undefined; projects: T[] } {
  return {
    home: workspaces.find((workspace) => workspace.home === true),
    projects: workspaces.filter((workspace) => workspace.home !== true),
  }
}
