import { Button as BaseButton } from "@base-ui-components/react/button"
import { ArrowLeft, ChevronDown, MonitorSmartphone, RotateCw } from "lucide-react"
import { Button, DropdownMenu, IconButton, MenuAction, MenuSeparator } from "../ui/controls"
import { ActivitySpinner, Pressable } from "../ui/motion"
import { floatingPillClasses } from "../ui/styles"
import { remoteClientStateLabel, useRemoteClient, type RemoteClientState } from "./remote-client"
import { useRemoteStatus } from "./remote-status"
import { useViewStore } from "./view-store"

const noDrag = "[-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag]"

const dotColor: Record<RemoteClientState, string> = {
  connecting: "var(--color-info)",
  connected: "var(--color-added)",
  reconnecting: "var(--color-modified)",
  offline: "var(--color-modified)",
  ended: "var(--color-deleted)",
}

function StateDot({ state }: { state: RemoteClientState }): React.JSX.Element {
  const pulsing = state === "connecting" || state === "reconnecting"
  return (
    <span
      aria-hidden="true"
      className={`block w-[7px] h-[7px] flex-none rounded-full ${pulsing ? "animate-pulse" : ""}`}
      style={{ background: dotColor[state] }}
    />
  )
}

/**
 * In a browser, the title bar names the computer it is driving where the desktop shows the mark.
 * Its menu says how the connection is doing and leads back to the devices page.
 */
export function RemoteDeviceChip(): React.JSX.Element | null {
  const client = useRemoteClient()
  if (!client.active) return null
  const label = remoteClientStateLabel[client.state]
  return (
    <DropdownMenu
      align="start"
      tooltip={`${client.deviceName} · ${label}`}
      trigger={
        <BaseButton
          render={<Pressable />}
          type="button"
          className={`motion-colors flex h-[30px] min-w-0 max-w-[200px] [[data-tier='phone']_&]:max-w-[116px] items-center gap-[7px] [padding:0_9px_0_8px] border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius)] bg-[var(--surface-selected)] text-[var(--text-primary)] text-[12px] font-medium cursor-default [&:hover]:bg-[var(--surface-hover)] [&[data-popup-open]]:bg-[var(--surface-hover)] ${noDrag}`}
          aria-label={`${client.deviceName}, ${label}. Remote connection`}
        >
          <StateDot state={client.state} />
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {client.deviceName}
          </span>
          <ChevronDown size={12} className="flex-none text-[var(--text-tertiary)]" />
        </BaseButton>
      }
    >
      <div className="grid gap-[3px] [padding:8px_12px_10px] max-w-[280px]">
        <span className="flex items-center gap-[7px] text-[12px] font-medium text-[var(--text-primary)]">
          <StateDot state={client.state} />
          {label}
        </span>
        <span className="text-[12px] leading-[1.5] text-[var(--text-secondary)]">
          {client.state === "connected"
            ? `You are working on ${client.deviceName}. Agents, files, and terminals run there.`
            : client.message}
        </span>
      </div>
      <MenuSeparator />
      <MenuAction icon={<ArrowLeft size={13} />} onClick={() => location.assign(client.devicesURL)}>
        Your devices
      </MenuAction>
      {client.state === "ended" && (
        <MenuAction icon={<RotateCw size={13} />} onClick={() => location.reload()}>
          Try connecting again
        </MenuAction>
      )}
    </DropdownMenu>
  )
}

/**
 * On the desktop, a title bar button appears while a browser is connected to this computer through
 * the relay, so remote control is never invisible. It opens Account & devices.
 */
export function RemoteViewersButton(): React.JSX.Element | null {
  const pushed = typeof window.meldshell.onRemoteStatus === "function"
  const status = useRemoteStatus({ enabled: pushed, poll: false })
  const viewers = status.data?.viewers ?? 0
  if (!pushed || viewers === 0) return null
  const label =
    viewers === 1
      ? "A browser is connected to this computer remotely"
      : `${viewers} browsers are connected to this computer remotely`
  return (
    <IconButton
      className={`relative text-[var(--text-primary)] ${noDrag}`}
      label={label}
      onClick={() => useViewStore.getState().openSettings("account")}
    >
      <MonitorSmartphone size={16} />
      <span
        aria-hidden="true"
        className="absolute top-[5px] right-[5px] w-[6px] h-[6px] rounded-full bg-[var(--color-added)] [box-shadow:0_0_0_2px_var(--scrim)]"
      />
    </IconButton>
  )
}

/**
 * A browser's connection trouble after the workspace is on screen. A drop or an offline host shows
 * a pill under the title bar while the transport reconnects on its own; ended access covers the
 * window, since nothing in it can work until the browser reconnects from the devices page.
 */
export function RemoteConnectionNotice(): React.JSX.Element | null {
  const client = useRemoteClient()
  if (!client.active || client.state === "connected" || client.state === "connecting") return null
  if (client.state === "ended")
    return (
      <div
        role="alertdialog"
        aria-labelledby="remote-ended-title"
        className="fixed inset-0 z-[120] grid place-items-center p-[24px] bg-[var(--backdrop)] [backdrop-filter:blur(2px)]"
      >
        <div className="grid max-w-[360px] justify-items-center gap-[10px] rounded-[var(--radius-xl)] border-[1px] border-[color:var(--line)] bg-[var(--surface-overlay)] [padding:26px_24px_22px] text-center [box-shadow:var(--shadow-popup)]">
          <MonitorSmartphone size={22} className="text-[var(--text-tertiary)]" />
          <h2
            id="remote-ended-title"
            className="m-0 [font-family:var(--font-display)] text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
          >
            Access to {client.deviceName} ended
          </h2>
          <p className="m-0 text-[12px] leading-[1.6] text-[var(--text-secondary)]">
            {client.message}
          </p>
          <div className="mt-[8px] flex flex-wrap justify-center gap-[8px]">
            <Button onClick={() => location.reload()} icon={<RotateCw size={13} />}>
              Try again
            </Button>
            <Button variant="primary" onClick={() => location.assign(client.devicesURL)}>
              Your devices
            </Button>
          </div>
        </div>
      </div>
    )
  return (
    <div
      role="status"
      className={`motion-rise [--motion-rise:-8px] fixed z-[110] top-[calc(var(--titlebar-height)_+_10px)] left-[50%] [transform:translateX(-50%)] max-w-[min(520px,_calc(var(--viewport-w)_-_24px))] [padding:7px_14px_7px_12px] ${floatingPillClasses}`}
    >
      <span className="flex text-[var(--color-modified)]">
        <ActivitySpinner />
      </span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        <span className="font-medium">{remoteClientStateLabel[client.state]}.</span>{" "}
        <span className="text-[var(--text-secondary)]">{client.message}</span>
      </span>
    </div>
  )
}
