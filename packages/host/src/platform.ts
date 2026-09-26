import { Context } from "effect"

/** Process transport shared by Electron utility processes and headless Node children. */
export interface HostProcess {
  readonly pid: number | undefined
  readonly stdout: NodeJS.ReadableStream | null
  readonly stderr: NodeJS.ReadableStream | null
  postMessage(message: unknown): void
  kill(): boolean
  on(event: "message", listener: (message: unknown) => void): unknown
  once(event: "exit", listener: (code: number) => void): unknown
  off(event: "message", listener: (message: unknown) => void): unknown
  off(event: "exit", listener: (code: number) => void): unknown
}

/** Desktops show this and bring the thread into view when it is clicked. */
export interface HostNotification {
  readonly title: string
  readonly body: string
  readonly threadId: string
}

export class HostPlatform extends Context.Tag("MeldShell/HostPlatform")<
  HostPlatform,
  {
    readonly desktop?: boolean
    readonly onCoreExit?: () => void
    readonly databasePath: string
    readonly fork: (entry: string, label: string, env?: Record<string, string>) => HostProcess
    readonly notify: (notification: HostNotification) => void
  }
>() {}
