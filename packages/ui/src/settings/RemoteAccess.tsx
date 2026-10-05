import { useEffect, useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import type { RemoteConnection, RemoteStatus } from "@meldshell/contracts/ipc"
import {
  ArrowUpRight,
  Check,
  Copy,
  Laptop,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react"
import { AppDialog, Button } from "../ui/controls"
import { ActivitySpinner } from "../ui/motion"
import { QrCode } from "../ui/QrCode"
import { remoteConnectionOf, useRemoteStatus } from "../app/remote-status"
import { SettingRow } from "./SettingRow"
import { SettingsGroup } from "./SettingsGroup"

const toneColor: Record<RemoteConnection, string> = {
  unlinked: "var(--text-tertiary)",
  connecting: "var(--color-info)",
  online: "var(--color-added)",
  offline: "var(--color-modified)",
  revoked: "var(--color-deleted)",
  error: "var(--color-deleted)",
}
const toneLabel: Record<RemoteConnection, string> = {
  unlinked: "Not linked",
  connecting: "Connecting",
  online: "Online",
  offline: "Offline",
  revoked: "Removed",
  error: "Unavailable",
}
const messageFor = (cause: unknown) =>
  String(cause).replace(/^(Error: )?(Error invoking remote method '[^']+': )?(Error: )?/, "")

/** A dot and a word for the connection; connecting spins instead. */
function Status({ connection }: { connection: RemoteConnection }): React.JSX.Element {
  return (
    <span
      role="status"
      className="inline-flex shrink-0 items-center gap-[7px] text-[12px] font-medium text-[var(--text-primary)]"
    >
      {connection === "connecting" ? (
        <span style={{ color: toneColor.connecting }} className="flex">
          <ActivitySpinner />
        </span>
      ) : (
        <span
          className="w-[7px] h-[7px] rounded-[50%]"
          style={{
            background: toneColor[connection],
            boxShadow:
              connection === "online"
                ? "0 0 0 3px color-mix(in srgb, var(--color-added) 22%, transparent)"
                : undefined,
          }}
        />
      )}
      {toneLabel[connection]}
    </span>
  )
}

const Controls = ({ children }: { children: ReactNode }) => (
  <div className="flex w-full flex-wrap items-center justify-end gap-[8px] [@container(max-width:_540px)]:justify-start">
    {children}
  </div>
)

/** A button that copies text and says so for a moment. */
function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <Button
      icon={copied ? <Check size={13} /> : <Copy size={13} />}
      onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
    >
      {copied ? "Copied" : label}
    </Button>
  )
}

/** The three things that happen when signing in, so the button is not a leap of faith. */
function HowItWorks(): React.JSX.Element {
  const steps: [ReactNode, string, string][] = [
    [<Laptop key="1" size={15} />, "Sign in here", "A browser opens on your account page."],
    [
      <ScanLine key="2" size={15} />,
      "Confirm the code",
      "The page shows the code MeldShell shows.",
    ],
    [
      <Smartphone key="3" size={15} />,
      "Open from anywhere",
      "Your devices page lists this computer.",
    ],
  ]
  return (
    <ol className="m-0 grid list-none gap-[10px] [padding:12px_16px_14px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
      {steps.map(([icon, title, body], index) => (
        <li
          key={title}
          className="grid grid-cols-[auto_1fr] gap-x-[10px] gap-y-[2px] rounded-[var(--radius)] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)] [padding:10px_12px]"
        >
          <span className="row-span-2 grid w-[28px] h-[28px] place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-selected)] text-[var(--text-secondary)]">
            {icon}
          </span>
          <span className="text-[12px] font-medium text-[var(--text-primary)]">
            <span className="text-[var(--text-tertiary)] tabular-nums">{index + 1}.</span> {title}
          </span>
          <span className="text-[11px] leading-[1.5] text-[var(--text-secondary)]">{body}</span>
        </li>
      ))}
    </ol>
  )
}

/** Sign-in in progress: the code to confirm, the page to confirm it on, and a way out. */
function Linking({
  code,
  url,
  onCancel,
  cancelling,
}: {
  code: string
  url: string
  onCancel: () => void
  cancelling: boolean
}) {
  return (
    <>
      <SettingRow
        label="Confirmation code"
        description={
          <>
            Sign in on the page that opened, check it shows this code, and choose{" "}
            <b className="font-medium text-[var(--text-primary)]">Connect this computer</b>. This
            screen finishes on its own.
          </>
        }
      >
        <Controls>
          <span className="inline-flex items-center gap-[8px] rounded-[var(--radius)] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)] [padding:6px_12px] [font-family:var(--font-mono)] text-[18px] tracking-[0.16em] text-[var(--text-primary)]">
            <span style={{ color: toneColor.connecting }} className="flex">
              <ActivitySpinner />
            </span>
            {code}
          </span>
        </Controls>
      </SettingRow>
      <SettingRow
        label="Sign-in page"
        description="Reopen the page, copy its link into another browser, or stop and start over."
      >
        <Controls>
          <Button
            icon={<X size={13} />}
            disabled={cancelling}
            onClick={onCancel}
            aria-label="Cancel sign-in"
          >
            Cancel
          </Button>
          <CopyButton text={url} />
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

const viewersLine = (viewers: number) =>
  viewers === 0
    ? "No browser is connected right now."
    : viewers === 1
      ? "A browser is connected right now."
      : `${viewers} browsers are connected right now.`

/** A linked computer: its relay status, who is watching, how to reach it, and its account. */
function LinkedComputer({
  state,
  connection,
  signOut,
  onRetried,
}: {
  state: RemoteStatus
  connection: RemoteConnection
  signOut: ReactNode
  onRetried: () => void
}) {
  const retry = useMutation({
    mutationFn: () => window.meldshell.retryRemote(),
    onSettled: onRetried,
  })
  const devicesURL = state.siteURL ? `${state.siteURL}/dashboard` : null
  // Hosts from before structured status do not count their viewers.
  const viewers = state.viewers ?? 0
  const description =
    connection === "offline"
      ? "Can’t reach the relay right now. MeldShell keeps retrying, and agents keep working meanwhile."
      : connection === "error"
        ? "The saved device credential could not be read. Sign out and sign in again to replace it."
        : connection === "online"
          ? viewersLine(viewers)
          : "Reaching the relay. Your other devices can open this computer once it is online."
  return (
    <>
      <SettingRow
        label={state.deviceName ? `This computer · ${state.deviceName}` : "This computer"}
        description={
          <>
            {description}
            {connection === "online" && (
              <span className="block mt-[2px]">
                Reachable from your other devices while MeldShell keeps running here.
              </span>
            )}
            {retry.isError && (
              <span role="alert" className="block mt-[4px]" style={{ color: toneColor.revoked }}>
                {messageFor(retry.error)}
              </span>
            )}
          </>
        }
      >
        <Controls>
          {connection === "online" && viewers > 0 && (
            <span className="inline-flex items-center gap-[6px] rounded-[999px] border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-hover)] [padding:3px_9px] text-[11px] text-[var(--text-secondary)]">
              <MonitorSmartphone size={12} />
              {viewers === 1 ? "1 viewer" : `${viewers} viewers`}
            </span>
          )}
          <Status connection={connection} />
          {connection === "offline" && (
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
      {devicesURL !== null && (
        <SettingRow
          stacked
          label="Open on your phone"
          description="Point your phone’s camera at the code to open your devices page, sign in with the same account, and choose this computer. Any browser works too."
        >
          <div className="flex flex-wrap items-center gap-[20px]">
            <QrCode value={devicesURL} label={`QR code for ${devicesURL}`} size={132} />
            <div className="flex min-w-[200px] flex-1 flex-col gap-[10px]">
              <span className="break-all [font-family:var(--font-mono)] text-[12px] text-[var(--text-secondary)]">
                {devicesURL}
              </span>
              <div className="flex flex-wrap gap-[8px]">
                <Button
                  variant="primary"
                  icon={<ArrowUpRight size={14} />}
                  onClick={() => void window.meldshell.openRemotePage("dashboard")}
                >
                  Open devices page
                </Button>
                <CopyButton text={devicesURL} />
              </div>
            </div>
          </div>
        </SettingRow>
      )}
      <SettingRow label="MeldShell account" description={state.account?.email ?? "Signed in"}>
        {signOut}
      </SettingRow>
    </>
  )
}

export function RemoteAccess() {
  const status = useRemoteStatus()
  const link = useMutation({
    mutationFn: () => window.meldshell.linkRemote(),
    onSettled: () => status.refetch(),
  })
  const cancel = useMutation({
    mutationFn: () => window.meldshell.cancelRemoteLink(),
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
  const state = status.data
  const connection = state ? remoteConnectionOf(state) : null
  const error = link.error ?? unlink.error ?? cancel.error ?? state?.error ?? status.error
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
  if (!state || connection === null)
    rows = (
      <div className="flex min-h-[62px] items-center [padding:0_16px] text-[var(--text-tertiary)]">
        <ActivitySpinner />
      </div>
    )
  else if (state.linking)
    rows = (
      <Linking
        code={state.linking.userCode}
        url={state.linking.verificationURL}
        cancelling={cancel.isPending}
        onCancel={() => cancel.mutate()}
      />
    )
  else if (connection === "unlinked")
    rows = (
      <>
        <SettingRow
          label="MeldShell account"
          description="Not signed in. Signing in links this computer to your account so your phone or another computer can open its threads. Provider logins stay here."
        >
          {signIn("Sign in with browser")}
        </SettingRow>
        <HowItWorks />
      </>
    )
  else if (connection === "revoked")
    rows = (
      <>
        <SettingRow
          label={state.deviceName ? `This computer · ${state.deviceName}` : "This computer"}
          description={`Removed from ${state.account?.email ?? "your account"} on the devices page. Sign in again to reconnect it.`}
        >
          <Controls>
            <Status connection={connection} />
            {signIn("Sign in again")}
          </Controls>
        </SettingRow>
        <SettingRow label="MeldShell account" description={state.account?.email ?? "Signed in"}>
          {signOut}
        </SettingRow>
      </>
    )
  else
    rows = (
      <LinkedComputer
        state={state}
        connection={connection}
        signOut={signOut}
        onRetried={() => status.refetch()}
      />
    )
  return (
    <>
      <SettingsGroup
        title="Remote access"
        description="Open your workspaces from a phone or another computer's browser while agents keep running here."
      >
        {rows}
        {error && (
          <p
            role="alert"
            className="m-0 [padding:12px_16px] text-[12px]"
            style={{ color: toneColor.revoked }}
          >
            {messageFor(error)}
          </p>
        )}
        <div className="flex items-start gap-[10px] [padding:12px_16px] text-[12px] leading-[1.6] text-[var(--text-tertiary)]">
          <ShieldCheck
            size={14}
            strokeWidth={1.75}
            aria-hidden="true"
            className="flex-none mt-[2px]"
          />
          <p className="m-0">
            Remote access goes through a relay run by the account service’s operator, who can read
            and send prompts, output, and file contents for linked computers. Provider credentials
            stay on this computer, and the title bar shows a device icon whenever a browser is
            connected.
          </p>
        </div>
      </SettingsGroup>
      <AppDialog
        alert
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out of this computer?"
        actions={
          <>
            <Button onClick={() => setConfirmSignOut(false)}>Cancel</Button>
            <Button variant="danger" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
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
