import { HARNESSES, type CollaborationMode, type SandboxMode } from "@meldshell/contracts"
import { Hammer, ListChecks, MessageCircleQuestion } from "lucide-react"
import type { Selection } from "../data/catalog"
import { knownHarness } from "../data/providers"

/* The composer's mode and permission choices, shared with the loadouts that save them. */

const SANDBOX_LABEL: Readonly<Record<SandboxMode, string>> = {
  "read-only": "Read only",
  "workspace-write": "Workspace write",
  "danger-full-access": "Full access",
}

const SANDBOX_HINT: Readonly<Record<SandboxMode, string>> = {
  "read-only": "Reads anything; asks before changing files",
  "workspace-write": "Edits this workspace; asks to go further",
  "danger-full-access": "No sandbox: any file, any command, network",
}

export const MODES: Readonly<
  Record<CollaborationMode, { label: string; hint: string; icon: typeof Hammer }>
> = {
  default: { label: "Agent", hint: "Works through the task and makes changes", icon: Hammer },
  plan: { label: "Plan", hint: "Proposes a plan before changing anything", icon: ListChecks },
  ask: {
    label: "Ask",
    hint: "Answers questions without making changes",
    icon: MessageCircleQuestion,
  },
}

/** The modes a harness offers; one with only the default mode offers no choice. */
export const harnessModes = (harness: string): readonly CollaborationMode[] => {
  const { modes } = HARNESSES[knownHarness(harness)]
  return modes.length > 1 ? modes : []
}

export function permissionOptions(
  selection: Pick<Selection, "provider" | "sandbox" | "approvalPolicy">,
) {
  const isClaude = selection.provider.harness === "claude-code"
  const isCursor = selection.provider.harness === "cursor"
  const toolPermissions = isClaude || isCursor
  const permissionLabels = isClaude
    ? { ask: "Manual", deny: "Don’t ask", full: "Bypass permissions" }
    : { ask: "Ask Every Time", deny: "Deny requests (custom)", full: "Run Everything" }
  const options: Array<{
    id: string
    label: string
    hint: string
    sandbox: SandboxMode
    approvalPolicy: "on-request" | "never"
  }> = toolPermissions
    ? [
        ...(isClaude
          ? [
              {
                id: "read",
                label: "Read tools only (custom)",
                hint: "Reads, searches, and browses; never edits or runs commands",
                sandbox: "read-only" as const,
                approvalPolicy: "on-request" as const,
              },
            ]
          : []),
        {
          id: "ask",
          label: permissionLabels.ask,
          hint: isClaude ? "Asks before edits and commands" : "Asks before each tool runs",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
        },
        ...(isClaude
          ? [
              {
                id: "edits",
                label: "Accept edits",
                hint: "Edits files freely; asks before commands",
                sandbox: "danger-full-access" as const,
                approvalPolicy: "on-request" as const,
              },
            ]
          : []),
        {
          id: "deny",
          label: permissionLabels.deny,
          hint: isClaude
            ? "Runs only tools you already allowed; never asks"
            : "Declines anything that needs approval",
          sandbox: "workspace-write",
          approvalPolicy: "never",
        },
        {
          id: "full",
          label: permissionLabels.full,
          hint: "Runs everything without asking",
          sandbox: "danger-full-access",
          approvalPolicy: "never",
        },
      ]
    : (Object.keys(SANDBOX_LABEL) as SandboxMode[]).map((sandbox) => ({
        id: sandbox,
        label: SANDBOX_LABEL[sandbox],
        hint: SANDBOX_HINT[sandbox],
        sandbox,
        approvalPolicy: "on-request",
      }))
  const selected = isCursor
    ? options.find(
        (option) =>
          option.id ===
          (selection.approvalPolicy === "never"
            ? selection.sandbox === "danger-full-access"
              ? "full"
              : "deny"
            : "ask"),
      )!
    : toolPermissions
      ? (options.find(
          (option) =>
            option.sandbox === selection.sandbox &&
            option.approvalPolicy === selection.approvalPolicy,
        ) ??
        options.find((option) => option.sandbox === selection.sandbox) ??
        options.find((option) => option.id === "ask")!)
      : options.find((option) => option.sandbox === selection.sandbox)!
  return { isClaude, toolPermissions, options, selected }
}
