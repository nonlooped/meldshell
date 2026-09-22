import { useState, type ReactNode } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowUpRight, Check, Copy, Globe, Laptop, LogOut, ShieldAlert } from "lucide-react"
import { AppDialog, Button } from "../ui/controls"
import { ActivitySpinner } from "../ui/motion"

type Tone = "online" | "pending" | "offline" | "danger"

const body = "m-0 text-[12.5px] leading-[1.65] text-[var(--text-secondary)]"
const fine = "m-0 text-[11.5px] leading-[1.6] text-[var(--text-tertiary)]"
const toneColor: Record<Tone, string> = {
  online: "var(--color-added)",
  pending: "var(--color-info)",
  offline: "var(--color-modified)",
  danger: "var(--color-deleted)",
}
const messageFor = (cause: unknown) =>
  String(cause).replace(/^(Error: )?(Error invoking remote method '[^']+': )?(Error: )?/, "")

function Card({
  icon,
  title,
  tone,
  children,
}: {
  icon: ReactNode
  title: string
  tone?: Tone
  children: ReactNode
}) {
  return (
    <div
      className="grid gap-[14px] [padding:20px] border-[1px] border-[color:var(--line)] rounded-[var(--radius-lg)] bg-[var(--surface-raised)]"
      style={
        tone === "danger"
          ? { borderColor: `color-mix(in srgb, ${toneColor.danger} 45%, transparent)` }
          : undefined
      }
    >
      <div className="flex items-center gap-[12px]">
        <span className="grid w-[34px] h-[34px] flex-[0_0_34px] place-items-center rounded-[var(--radius)] bg-[var(--surface-hover)] text-[var(--text-secondary)]">
          {icon}
        </span>
        <h3 className="m-0 flex-1 [font-family:var(--font-display)] text-[15px] font-semibold">
          {title}
        </h3>
        {tone && <StatusPill tone={tone} />}
      </div>
      {children}
    </div>
  )
}

const pillLabel: Record<Tone, string> = {
  online: "Online",
  pending: "Connecting",
  offline: "Offline",
  danger: "Disconnected",
}
function StatusPill({ tone }: { tone: Tone }) {
  return (
    <span
      role="status"
      className="inline-flex h-[22px] items-center gap-[6px] [padding:0_9px] rounded-[11px] bg-[var(--surface-hover)] text-[11.5px] font-medium"
    >
      {tone === "pending" ? (
        <span style={{ color: toneColor.pending }} className="flex">
          <ActivitySpinner />
        </span>
      ) : (
        <span className="w-[7px] h-[7px] rounded-[50%]" style={{ background: toneColor[tone] }} />
      )}
      {pillLabel[tone]}
    </span>
  )
}

const Actions = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-[8px]">{children}</div>
)

function CodeCard({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Card icon={<Globe size={17} />} title="Confirm in your browser" tone="pending">
      <p className={body}>
        Sign in on the page that opens, check it shows this code, and choose{" "}
        <b>Connect this computer</b>. This screen updates by itself.
      </p>
      <div className="[font-family:var(--font-mono)] text-[22px] tracking-[0.18em]">{code}</div>
      <Actions>
        <Button
          variant="primary"
          icon={<ArrowUpRight size={14} />}
          onClick={() => void window.meldshell.openRemotePage("sign-in")}
        >
          Open sign-in page
        </Button>
        <Button
          icon={copied ? <Check size={13} /> : <Copy size={13} />}
          onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </Actions>
    </Card>
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
      <section className="max-w-[520px]">
        <Card icon={<Globe size={17} />} title="You’re using MeldShell remotely">
          <p className={body}>
            To add another computer, open MeldShell on it and go to Settings → Account &amp;
            devices.
          </p>
        </Card>
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
    <Button
      size="sm"
      variant="ghost"
      icon={<LogOut size={13} />}
      onClick={() => setConfirmSignOut(true)}
    >
      Sign out
    </Button>
  )
  let card: ReactNode
  if (!state) card = <ActivitySpinner />
  else if (state.linking)
    card = <CodeCard code={state.linking.userCode} url={state.linking.verificationURL} />
  else if (!state.linked)
    card = (
      <Card icon={<Globe size={17} />} title="Use this computer from anywhere">
        <p className={body}>
          Sign in to open your workspaces from a phone or another computer’s browser. Agents keep
          running here, and your provider logins stay on this computer.
        </p>
        <Actions>{signIn("Sign in with your browser")}</Actions>
      </Card>
    )
  else if (/revoked/i.test(state.status))
    card = (
      <Card icon={<ShieldAlert size={17} />} title="Access was removed" tone="danger">
        <p className={body}>
          This computer was removed from {state.account?.email ?? "your account"}. Sign in again to
          reconnect it.
        </p>
        <Actions>
          {signIn("Sign in again")}
          {signOut}
        </Actions>
      </Card>
    )
  else {
    const tone: Tone =
      state.status === "Online"
        ? "online"
        : state.status.startsWith("Offline")
          ? "offline"
          : "pending"
    card = (
      <Card icon={<Laptop size={17} />} title="This computer" tone={tone}>
        <p className={body}>
          {tone === "offline"
            ? "Can’t reach the relay right now. MeldShell keeps retrying, and agents keep working meanwhile."
            : "Open your devices page in any browser to continue from there. Keep MeldShell running here."}
        </p>
        <Actions>
          <Button
            variant="primary"
            icon={<ArrowUpRight size={14} />}
            onClick={() => void window.meldshell.openRemotePage("dashboard")}
          >
            Open your devices
          </Button>
        </Actions>
        <div className="flex items-center justify-between gap-[16px] pt-[14px] border-t-[1px] border-t-[color:var(--line-subtle)]">
          <div className="min-w-0 truncate text-[12.5px] font-medium">
            {state.account?.email ?? "Signed in"}
          </div>
          {signOut}
        </div>
      </Card>
    )
  }
  return (
    <section className="grid max-w-[520px] gap-[14px] pb-[24px]">
      {card}
      {error && (
        <p role="alert" className="m-0 text-[12px]" style={{ color: toneColor.danger }}>
          {messageFor(error)}
        </p>
      )}
      <p className={fine}>
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
    </section>
  )
}
