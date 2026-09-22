import type { MeldShellApi } from "@meldshell/contracts"
declare global {
  interface Window {
    meldshell: MeldShellApi
  }
}
