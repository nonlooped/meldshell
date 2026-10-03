import { promptText, type TurnDispatch } from "@meldshell/contracts"
import { BROWSER_SERVER, browserUrl } from "@meldshell/provider-runtime/browser"

/**
 * Adds the thread's browser tools to the user's own MCP servers. The dotted key merges one entry
 * instead of replacing the table, and the thread's own preview needs no approval.
 */
const browserConfig = (dispatch: TurnDispatch) => {
  const url = dispatch.sandbox === "read-only" ? null : browserUrl(dispatch.threadId)
  return url === null
    ? {}
    : {
        config: {
          [`mcp_servers.${BROWSER_SERVER}`]: {
            url,
            default_tools_approval_mode: "approve",
            tool_timeout_sec: 60,
          },
        },
      }
}

/** The settings `thread/start` and `thread/resume` share for a conversation turn. */
export const threadSettings = (dispatch: TurnDispatch) => ({
  cwd: dispatch.workspacePath,
  model: dispatch.model,
  approvalPolicy: dispatch.approvalPolicy,
  sandbox: dispatch.sandbox,
  serviceTier: dispatch.serviceTier,
  ...browserConfig(dispatch),
})

export const inputItems = (
  dispatch: Pick<TurnDispatch, "text" | "context" | "attachments">,
): ReadonlyArray<Record<string, unknown>> => [
  ...[promptText(dispatch)].filter(Boolean).map((text) => ({ type: "text", text })),
  ...dispatch.attachments.map((attachment) => {
    switch (attachment.type) {
      case "image":
        return { type: "image", url: attachment.value }
      case "localImage":
        return { type: "localImage", path: attachment.value }
      case "mention":
      case "skill":
        return {
          type: attachment.type,
          name: attachment.name ?? attachment.value,
          path: attachment.value,
        }
    }
  }),
]

const SANDBOX_POLICIES = {
  "read-only": "readOnly",
  "workspace-write": "workspaceWrite",
  "danger-full-access": "dangerFullAccess",
} as const satisfies Record<TurnDispatch["sandbox"], string>

export const sandboxPolicy = (dispatch: TurnDispatch) => ({
  type: SANDBOX_POLICIES[dispatch.sandbox],
})
