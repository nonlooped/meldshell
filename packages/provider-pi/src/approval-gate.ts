import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** Pi's built-in tools that only read; read-only threads start Pi with exactly these. */
export const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const

/**
 * A Pi extension that asks before any tool that is not known to only read. Pi has no permission
 * prompts of its own; extensions gate tools through the `tool_call` event, and in RPC mode their
 * dialogs reach MeldShell as `extension_ui_request` records. Allowing a tool for the session is
 * stored in the Pi session itself, so it holds when the thread resumes.
 */
const SOURCE = `const READ_ONLY = new Set(${JSON.stringify(READ_ONLY_TOOLS)});
const ENTRY = "meldshell-approval";
const ALLOW = "Allow once";
const DENY = "Decline";

const summary = (name, input) => {
  if ((name === "bash" || name === "powershell") && typeof input.command === "string")
    return input.command;
  if (typeof input.path === "string") return input.path;
  const text = JSON.stringify(input, null, 2) ?? "";
  return text.length > 2000 ? text.slice(0, 2000) + "\\n…" : text;
};

export default function meldshellApprovals(pi) {
  const allowed = new Set();
  pi.on("session_start", (_event, ctx) => {
    allowed.clear();
    for (const entry of ctx.sessionManager.getBranch())
      if (entry.type === "custom" && entry.customType === ENTRY && typeof entry.data?.tool === "string")
        allowed.add(entry.data.tool);
  });
  pi.on("tool_call", async (event, ctx) => {
    const name = event.toolName;
    if (READ_ONLY.has(name) || allowed.has(name)) return;
    const hints = pi.getAllTools().find((tool) => tool.name === name)?.annotations;
    if (hints?.readOnlyHint === true && hints?.destructiveHint !== true) return;
    const session = "Allow " + name + " for this session";
    const choice = ctx.hasUI
      ? await ctx.ui.select("Allow " + name + "?\\n" + summary(name, event.input ?? {}), [ALLOW, session, DENY], { signal: ctx.signal })
      : undefined;
    if (choice === session) {
      allowed.add(name);
      pi.appendEntry(ENTRY, { tool: name });
    }
    if (choice === ALLOW || choice === session) return;
    return { block: true, reason: "The user did not allow " + name + "." };
  });
}
`

/**
 * Writes the gate into a directory only this user can read, since Pi executes it. The directory
 * lives as long as the worker and is removed when it stops.
 */
export class ApprovalGate {
  private file: Promise<{ readonly directory: string; readonly path: string }> | null = null

  path(): Promise<string> {
    this.file ??= (async () => {
      const directory = await mkdtemp(join(tmpdir(), "meldshell-pi-"))
      const path = join(directory, "meldshell-approvals.js")
      await writeFile(path, SOURCE, { mode: 0o600 })
      return { directory, path }
    })()
    const file = this.file
    file.catch(() => {
      if (this.file === file) this.file = null
    })
    return file.then(({ path }) => path)
  }

  async dispose(): Promise<void> {
    const file = this.file
    this.file = null
    if (file)
      await file.then(
        ({ directory }) => rm(directory, { recursive: true, force: true }),
        () => undefined,
      )
  }
}
