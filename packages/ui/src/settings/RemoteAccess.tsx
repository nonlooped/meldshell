import { useState, type ReactNode } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowUpRight, Check, Copy, LogOut, RefreshCw } from "lucide-react"
import { AppDialog, Button } from "../ui/controls"
import { ActivitySpinner } from "../ui/motion"
import { SettingRow } from "./SettingRow"

type Tone = "online" | "pending" | "offline" | "danger"

const toneColor: Record<Tone, string> = {
  online: "var(--color-added)",
  pending: "var(--color-info)",
  offline: "var(--color-modified)",
  danger: "var(--color-deleted)",
}
const messageFor = (cause: unknown) =>
  String(cause).replace(/^(Error: )?(Error invoking remote method '[^']+': )?(Error: )?/, "")

const groupClasses =
  "settings-group m-0 border-t-[1px] border-t-[color:var(--line-subtle)] border-b-[1px] border-b-[color:var(--line-subtle)]"

const statusLabel: Record<Tone, string> = {
  online: "Online",
  pending: "Connecting",
  offline: "Offline",
  danger: "Disconnected",
}
function Status({ tone }: { tone: Tone }) {
  return (
    <span
      role="status"
      className="inline-flex shrink-0 items-center gap-[7px] text-[12px] text-[var(--text-secondary)]"
    >
      {tone === "pending" ? (
        <span style={{ color: toneColor.pending }} className="flex">
          <ActivitySpinner />
        </span>
      ) : (
        <span className="w-[7px] h-[7px] rounded-[50%]" style={{ background: toneColor[tone] }} />
      )}
      {statusLabel[tone]}
    </span>
  )
}

const Controls = ({ children }: { children: ReactNode }) => (
  <div className="flex w-full items-center justify-end gap-[8px] [@container(max-width:_540px)]:justify-start">
    {children}
  </div>
)

function Linking({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <SettingRow
        label="Confirmation code"
        description={
          <>
            Sign in on the page that opens, check it shows this code, and choose{" "}
            <b className="font-medium text-[var(--text-primary)]">Connect this computer</b>. This
            screen updates by itself.
          </>
        }
      >
        <Controls>
          <Status tone="pending" />
          <span className="[font-family:var(--font-mono)] text-[17px] tracking-[0.14em] text-[var(--text-primary)]">
            {code}
          </span>
        </Controls>
      </SettingRow>
      <SettingRow
        label="Sign-in page"
        description="Reopen the page, or copy its link into another browser."
      >
        <Controls>
          <Button
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
            onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button
            variant="primary"
            icon={<ArrowUpRight size={14} />}
            onClick={() => void window.meldshell.openRemotePage("sign-in")}
          >
            Open
          </Button>
        </Controls>
      </SettingRow>
    </>
  )
}

type RemoteStatus = Awaited<ReturnType<typeof window.meldshell.getRemoteStatus>>

/** A signed-in computer: its relay status, how to reach it, and a retry while the relay is down. */
function LinkedComputer({
  state,
  signOut,
  onRetried,
}: {
  state: RemoteStatus
  signOut: ReactNode
  onRetried: () => void
}) {
  const retry = useMutation({
    mutationFn: () => window.meldshell.retryRemote(),
    onSettled: onRetried,
  })
  const tone: Tone =
    state.status === "Online"
      ? "online"
      : state.status.startsWith("Offline")
        ? "offline"
        : "pending"
  return (
    <>
      <SettingRow
        label="This computer"
        description={
          <>
            {tone === "offline"
              ? "Can’t reach the relay right now. MeldShell keeps retrying, and agents keep working meanwhile."
              : "Reachable from your other devices while MeldShell keeps running here."}
            {retry.isError && (
              <span role="alert" className="block mt-[4px]" style={{ color: toneColor.danger }}>
                {messageFor(retry.error)}
              </span>
            )}
          </>
        }
      >
        <Controls>
          <Status tone={tone} />
          {tone === "offline" && (
            <Button
              size="sm"
              icon={retry.isPending ? <ActivitySpinner /> : <RefreshCw size={13} />}
              disabled={retry.isPending}
              onClick={() => retry.mutate()}
            >
              {retry.isPending ? "Retrying…" : "Retry now"}
            </Button>
          )}
        </Controls>
      </SettingRow>
      <SettingRow
        label="Your devices"
        description="Open your devices page in any browser to continue from there."
      >
        <Button
          icon={<ArrowUpRight size={14} />}
          onClick={() => void window.meldshell.openRemotePage("dashboard")}
        >
          Open devices page
        </Button>
      </SettingRow>
      <SettingRow label="Account" description={state.account?.email ?? "Signed in"}>
        {signOut}
      </SettingRow>
    </>
  )
}

export function RemoteAccess() {
  const web = window.meldshell.platform === "web"
  const status = useQuery({
    queryKey: ["remote-status"],
    queryFn: () => window.meldshell.getRemoteStatus(),
    refetchInterval: 1500,
    enabled: !web,
  })
  const link = useMutation({
    mutationFn: () => window.meldshell.linkRemote(),
    onSettled: () => status.refetch(),
  })
  const unlink = useMutation({
    mutationFn: () => window.meldshell.unlinkRemote(),
    onSettled: () => {
      setConfirmSignOut(false)
      void status.refetch()
    },
  })
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  if (web)
    return (
      <section className={groupClasses} aria-label="Account and devices">
        <SettingRow
          label="Remote session"
          description="To add another computer, open MeldShell on it and go to Settings → Account & devices."
        >
          <Status tone="online" />
        </SettingRow>
      </section>
    )
  const state = status.data
  const error = link.error ?? unlink.error ?? state?.error ?? status.error
  const signIn = (label: string) => (
    <Button
      variant="primary"
      icon={link.isPending ? <ActivitySpinner /> : undefined}
      disabled={link.isPending}
      onClick={() => link.mutate()}
    >
      {link.isPending ? "Preparing…" : label}
    </Button>
  )
  const signOut = (
    <Button icon={<LogOut size={13} />} onClick={() => setConfirmSignOut(true)}>
      Sign out
    </Button>
  )
  let rows: ReactNode
  if (!state)
    rows = (
      <div className="flex min-h-[76px] items-center">
        <ActivitySpinner />
      </div>
    )
  else if (state.linking)
    rows = <Linking code={state.linking.userCode} url={state.linking.verificationURL} />
  else if (!state.linked)
    rows = (
      <SettingRow
        label="Remote access"
        description="Sign in to open your workspaces from a phone or another computer’s browser. Agents keep running here, and your provider logins stay on this computer."
      >
        {signIn("Sign in with browser")}
      </SettingRow>
    )
  else if (/revoked/i.test(state.status))
    rows = (
      <>
        <SettingRow
          label="This computer"
          description={`Removed from ${state.account?.email ?? "your account"}. Sign in again to reconnect it.`}
        >
          <Controls>
            <Status tone="danger" />
            {signIn("Sign in again")}
          </Controls>
        </SettingRow>
        <SettingRow label="Account" description={state.account?.email ?? "Signed in"}>
          {signOut}
        </SettingRow>
      </>
    )
  else rows = <LinkedComputer state={state} signOut={signOut} onRetried={() => status.refetch()} />
  return (
    <>
      <section className={groupClasses} aria-label="Account and devices">
        {rows}
      </section>
      {error && (
        <p
          role="alert"
          className="[margin:12px_0_0] text-[12px]"
          style={{ color: toneColor.danger }}
        >
          {messageFor(error)}
        </p>
      )}
      <p className="[margin:14px_0_0] text-[12px] leading-[1.6] text-[var(--text-tertiary)]">
        Remote access goes through a relay run by the account service’s operator, who can read and
        send prompts, output, and file contents for linked computers. Provider credentials stay on
        this computer.
      </p>
      <AppDialog
        alert
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out of this computer?"
        actions={
          <>
            <Button onClick={() => setConfirmSignOut(false)}>Cancel</Button>
            <Button variant="primary" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
              Sign out
            </Button>
          </>
        }
      >
        <p>
          Your other devices will no longer reach this computer. Running agents and conversations
          aren’t affected.
        </p>
      </AppDialog>
    </>
  )
}
