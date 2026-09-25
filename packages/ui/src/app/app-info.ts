import { createContext } from "react"

export interface AppInfo {
  readonly version: string
  readonly electronVersion?: string
}

export const AppInfoContext = createContext<AppInfo>({ version: "" })
