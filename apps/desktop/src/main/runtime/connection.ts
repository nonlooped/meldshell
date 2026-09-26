import type { DesktopConnection } from "@meldshell/host/desktop-protocol"

export interface Connection extends DesktopConnection {
  readonly close: () => Promise<void>
  /** Where Windows file pickers open; undefined when the host shares the desktop's filesystem. */
  readonly pickerPath: string | undefined
}

/**
 * One shared startup at a time, the live connection while it lasts, and a stop that never starts
 * another. A lost connection is forgotten so the next caller reconnects; nothing is replayed.
 */
export function createConnectionManager(options: {
  connect: (disconnected: () => void) => Promise<Connection>
  disconnected: () => void
}) {
  let starting: Promise<Connection> | undefined
  let current: Connection | undefined
  let stopping: Promise<void> | undefined
  const connection = (): Promise<Connection> => {
    if (stopping) return Promise.reject(new Error("MeldShell is closing."))
    return (starting ??= options
      .connect(() => {
        if (!current || stopping) return
        current = undefined
        starting = undefined
        options.disconnected()
      })
      .then(
        (value) => {
          current = value
          return value
        },
        (cause) => {
          starting = undefined
          throw cause
        },
      ))
  }
  return {
    connection,
    current: () => current,
    stopped: () => stopping !== undefined,
    stop: () =>
      (stopping ??= (async () => {
        // Setup dialogs and first-launch installs can hold a startup open for minutes; quitting
        // must not wait for them. Whatever they eventually produce is closed then.
        if (current) await current.close()
        else
          void starting?.then(
            (value) => value.close(),
            () => undefined,
          )
      })()),
  }
}
