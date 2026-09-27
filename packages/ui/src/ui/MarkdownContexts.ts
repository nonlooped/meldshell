import { createContext } from "react"
import type { WorkspaceScope } from "@meldshell/contracts/ipc"

export const MarkdownWorkspace = createContext<WorkspaceScope | undefined>(undefined)
export const MarkdownSources = createContext<ReadonlyMap<string, string>>(new Map())
