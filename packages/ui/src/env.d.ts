/// <reference types="vite/client" />
import type { MeldShellApi } from "@meldshell/contracts/ipc"

declare global {
  interface Window {
    readonly meldshell: MeldShellApi
  }
}

export {}
