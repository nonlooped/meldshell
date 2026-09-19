import type { Options, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { TurnDispatch } from "@meldshell/contracts"
import { readFile } from "node:fs/promises"
import { extname } from "node:path"

/** Claude permission modes are tool policies. They do not provide Codex's OS sandbox. */
export const claudeOptions = (dispatch: TurnDispatch): Options => {
  const effort = dispatch.reasoningEffort
  if (effort !== null && !["low", "medium", "high", "xhigh", "max"].includes(effort))
    throw new Error(`Claude Code does not support reasoning effort ${effort}.`)
  const readOnly = dispatch.sandbox === "read-only"
  const bypass =
    !readOnly && dispatch.sandbox === "danger-full-access" && dispatch.approvalPolicy === "never"
  return {
    cwd: dispatch.workspacePath,
    model: dispatch.model,
    settings: { fastMode: dispatch.speed === "fast" },
    ...(effort === null ? {} : { effort: effort as NonNullable<Options["effort"]> }),
    ...(dispatch.nativeThreadId === null
      ? { sessionId: dispatch.turnId }
      : { resume: dispatch.nativeThreadId }),
    systemPrompt: { type: "preset", preset: "claude_code" },
    settingSources: ["user", "project", "local"],
    includePartialMessages: true,
    permissionMode:
      dispatch.mode === "plan"
        ? "plan"
        : readOnly || (dispatch.approvalPolicy === "never" && !bypass)
          ? "dontAsk"
          : bypass
            ? "bypassPermissions"
            : dispatch.sandbox === "danger-full-access"
              ? "acceptEdits"
              : "default",
    allowDangerouslySkipPermissions: bypass,
    ...(readOnly
      ? {
          tools: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
          allowedTools: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
          disallowedTools: [
            "Bash",
            "Edit",
            "Write",
            "NotebookEdit",
            "Agent",
            "Task",
            "Skill",
            "mcp__*",
          ],
        }
      : {}),
  }
}

const localImage = async (value: string): Promise<string> => {
  const media = (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    } as Record<string, string>
  )[extname(value).toLowerCase()]
  if (!media) throw new Error("Claude images must be PNG, JPEG, GIF, or WebP.")
  const bytes = await readFile(value)
  if (bytes.length > 20 * 1024 * 1024) throw new Error("The attached image exceeds 20 MB.")
  return `data:${media};base64,${bytes.toString("base64")}`
}
export const claudePrompt = async (dispatch: TurnDispatch): Promise<SDKUserMessage> => {
  const content: Exclude<SDKUserMessage["message"]["content"], string> = []
  if (dispatch.text) content.push({ type: "text", text: dispatch.text })
  for (const attachment of dispatch.attachments) {
    if (attachment.type === "mention" || attachment.type === "skill") {
      content.push({
        type: "text",
        text: `${attachment.type === "skill" ? "Read and follow this skill" : "Referenced file"}: ${attachment.value}`,
      })
      continue
    }
    let value = attachment.value
    if (attachment.type === "localImage") {
      value = await localImage(value)
    }
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value)
    if (match)
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: match[1] as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: match[2]!,
        },
      })
    else if (/^https:\/\//i.test(value))
      content.push({ type: "image", source: { type: "url", url: value } })
    else throw new Error("Unsupported Claude image attachment.")
  }
  return {
    type: "user",
    session_id: dispatch.nativeThreadId ?? dispatch.turnId,
    parent_tool_use_id: null,
    message: { role: "user", content },
  }
}
