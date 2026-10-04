import { useQuery } from "@tanstack/react-query"
import {
  cliLabel,
  HARNESSES,
  type CliSession,
  type CliSessionList,
  type Workspace,
} from "@meldshell/contracts"
import { GitBranch } from "lucide-react"
import { useState } from "react"
import { MenuAction } from "../ui/controls"
import { ActivitySpinner, Shimmer } from "../ui/motion"
import { ProviderIcon } from "../ui/ProviderIcon"
import { relativeAge } from "../ui/relative-age"
import { Palette, PaletteSearch } from "./Palette"

const sessionKey = (session: CliSession) => `${session.harness}:${session.nativeThreadId}`

/** Brings an agent session started in a terminal into MeldShell as a thread. */
export function SessionPalette({
  open,
  onOpenChange,
  workspace,
  onImport,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly workspace: Workspace | undefined
  /** Resolves once the thread exists and is open; the palette stays open until then. */
  readonly onImport: (workspaceId: string, session: CliSession) => Promise<unknown>
}): React.JSX.Element {
  return (
    <Palette open={open} onOpenChange={onOpenChange} title="Bring in a terminal session">
      <SessionSearch
        workspace={workspace}
        onImport={(session) =>
          workspace === undefined
            ? Promise.resolve()
            : onImport(workspace.id, session).then(() => onOpenChange(false))
        }
      />
    </Palette>
  )
}

function SessionSearch({
  workspace,
  onImport,
}: {
  readonly workspace: Workspace | undefined
  readonly onImport: (session: CliSession) => Promise<unknown>
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const [importing, setImporting] = useState<CliSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sessions = useQuery({
    queryKey: ["cli-sessions", workspace?.id],
    queryFn: () => window.meldshell.listCliSessions(workspace!.id),
    enabled: workspace !== undefined,
    staleTime: 10_000,
    retry: false,
  })
  const needle = query.trim().toLowerCase()
  const matches = (sessions.data?.sessions ?? []).filter(
    (session) =>
      needle === "" ||
      session.title.toLowerCase().includes(needle) ||
      session.branch?.toLowerCase().includes(needle) ||
      HARNESSES[session.harness].label.toLowerCase().includes(needle),
  )
  const items = importing !== null ? [importing] : matches
  const pick = (session: CliSession) => {
    if (importing !== null) return
    setImporting(session)
    setError(null)
    onImport(session).catch((cause: unknown) => {
      setImporting(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }
  return (
    <>
      <PaletteSearch<CliSession>
        items={items}
        query={query}
        onQueryChange={(next) => {
          if (importing === null) setQuery(next)
        }}
        placeholder={
          workspace === undefined
            ? "Bring in a terminal session"
            : `Bring in a terminal session from ${workspace.name}`
        }
        itemKey={sessionKey}
        itemLabel={(session) => session.title}
        onPick={pick}
        notice={sessionNotice({
          workspace,
          error,
          importing: importing !== null,
          searched: needle !== "",
          sessions,
          shown: matches.length,
        })}
        contextActions={(session) => (
          <>
            <MenuAction onClick={() => pick(session)}>
              {session.threadId === null ? "Bring in as a thread" : "Open its thread"}
            </MenuAction>
            <MenuAction onClick={() => void navigator.clipboard.writeText(session.nativeThreadId)}>
              Copy session ID
            </MenuAction>
          </>
        )}
        renderItem={(session) => (
          <SessionRow
            session={session}
            importing={importing !== null && sessionKey(importing) === sessionKey(session)}
          />
        )}
      />
      <p className="m-0 flex items-center gap-[6px] [padding:7px_16px] border-t-[1px] border-t-[color:var(--line-subtle)] text-[11.5px] text-[var(--text-tertiary)]">
        {importing !== null
          ? `Reading the ${cliLabel(importing.harness)} session…`
          : "The thread keeps the session, so its next message continues where the terminal left off."}
      </p>
    </>
  )
}

/** Why the list is empty or not yet shown, or undefined when the results speak for themselves. */
function sessionNotice({
  workspace,
  error,
  importing,
  searched,
  sessions,
  shown,
}: {
  readonly workspace: Workspace | undefined
  readonly error: string | null
  readonly importing: boolean
  readonly searched: boolean
  readonly sessions: { readonly data?: CliSessionList | undefined; readonly error: Error | null }
  readonly shown: number
}): React.ReactNode {
  if (workspace === undefined) return "Add a workspace first."
  if (error !== null)
    return <span className="text-[var(--color-deleted)] [overflow-wrap:anywhere]">{error}</span>
  if (importing) return undefined
  if (sessions.error !== null)
    return <span className="[overflow-wrap:anywhere]">{sessions.error.message}</span>
  if (sessions.data === undefined) return <Shimmer>Looking for terminal sessions…</Shimmer>
  if (shown > 0) return undefined
  const problems = sessions.data.problems
  if (problems.length > 0) return <span className="[overflow-wrap:anywhere]">{problems[0]}</span>
  return searched
    ? "No terminal sessions match."
    : `No Claude Code, Codex, Cursor or Pi sessions were started in ${workspace.name} yet.`
}

function SessionRow({
  session,
  importing,
}: {
  readonly session: CliSession
  readonly importing: boolean
}): React.JSX.Element {
  return (
    <>
      <span className="grid w-[16px] flex-none place-items-center">
        {importing ? (
          <ActivitySpinner />
        ) : (
          <ProviderIcon provider={{ key: HARNESSES[session.harness].provider }} size={14} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{session.title}</span>
      {session.threadId !== null && (
        <span className="flex-none h-[18px] [padding:0_7px] rounded-full border-[1px] border-[color:var(--line-subtle)] text-[11px] leading-[16px] text-[var(--text-secondary)]">
          In MeldShell
        </span>
      )}
      {session.branch !== null && (
        <span className="hidden min-[560px]:inline-flex max-w-[140px] flex-none items-center gap-[4px] text-[11.5px] text-[var(--text-tertiary)]">
          <GitBranch size={11} strokeWidth={2} aria-hidden="true" className="flex-none" />
          <span className="truncate">{session.branch}</span>
        </span>
      )}
      <span
        className="w-[28px] flex-none text-right text-[11.5px] text-[var(--text-tertiary)] tabular-nums"
        title={`Last active ${new Date(session.updatedAt).toLocaleString()}`}
      >
        {relativeAge(session.updatedAt)}
      </span>
    </>
  )
}
