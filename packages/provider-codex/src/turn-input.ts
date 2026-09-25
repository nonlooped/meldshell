import type { TurnDispatch } from "@meldshell/contracts"

/** The settings `thread/start` and `thread/resume` share for a conversation turn. */
export const threadSettings = (dispatch: TurnDispatch) => ({
  cwd: dispatch.workspacePath,
  model: dispatch.model,
  approvalPolicy: dispatch.approvalPolicy,
  sandbox: dispatch.sandbox,
  serviceTier: dispatch.serviceTier,
})

export const inputItems = (dispatch: TurnDispatch): ReadonlyArray<Record<string, unknown>> => [
  ...(dispatch.text === "" ? [] : [{ type: "text", text: dispatch.text }]),
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
