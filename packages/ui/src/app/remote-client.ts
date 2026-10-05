import { create } from "zustand"

/** Connection phases of a browser driving a host through the relay. */
export type RemoteClientState = "connecting" | "connected" | "reconnecting" | "offline" | "ended"
export interface RemoteClientStatus {
  readonly state: RemoteClientState
  /** A sentence for the phase, such as why the host is unreachable. */
  readonly message: string
}
/** What the web client tells the renderer about the host it is attached to. */
export interface RemoteClientOptions {
  readonly deviceName: string
  /** Where to go back to choose another computer. */
  readonly devicesURL: string
  /** Calls the listener with the current status at once, then on each change. */
  readonly subscribe: (listener: (status: RemoteClientStatus) => void) => () => void
}

interface RemoteClientStore extends RemoteClientStatus {
  /** True in a browser attached to a host; the desktop never attaches. */
  readonly active: boolean
  readonly deviceName: string
  readonly devicesURL: string
  readonly attach: (options: RemoteClientOptions) => () => void
}

export const useRemoteClient = create<RemoteClientStore>((set) => ({
  active: false,
  deviceName: "",
  devicesURL: "/",
  state: "connecting",
  message: "",
  attach: (options) => {
    set({ active: true, deviceName: options.deviceName, devicesURL: options.devicesURL })
    return options.subscribe((status) => set({ state: status.state, message: status.message }))
  },
}))

export const remoteClientStateLabel: Record<RemoteClientState, string> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  offline: "Computer offline",
  ended: "Disconnected",
}
