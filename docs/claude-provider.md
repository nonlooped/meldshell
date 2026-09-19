# Claude Code integration

Implementation reviewed on 2026-09-05 against the [provider package](../packages/provider-claude/src/index.ts), [worker](../packages/provider-claude/src/worker-runtime.ts), and [desktop supervisor](../apps/desktop/src/main/runtime/worker-provider.ts). This is a source review, not a new authenticated-provider certification.

Choose a Claude model in the composer to start a Claude Code conversation. Settings > Providers > Claude shows connection status and lets you refresh the catalog.

MeldShell discovers the installed Claude Code CLI on the inherited `PATH` (no minimum-version gate). `MELDSHELL_CLAUDE_EXECUTABLE` can override the executable path (native binary or JavaScript entrypoint). The pinned `@anthropic-ai/claude-agent-sdk` 0.3.261 is only the protocol client; it always targets that installed CLI and never the SDK's bundled native executable. Claude Code is not packaged with MeldShell. Compatibility is determined by a successful probe connection, not a version number.

It reads Claude Code's existing sign-in and environment configuration. If authentication is missing, sign in using `claude auth login` in a terminal, then click **Check again**. API credentials supplied through the environment also work. MeldShell does not store API keys in its database.

## Available

- A provider sidebar and searchable model list. Alias labels include the version from the SDK's `resolvedModel`, while the stored alias remains unchanged.
- Model history discovered from the public Models.dev catalog. Its version IDs are passed through Claude Code's `modelPicker` settings for capability discovery and policy filtering. MeldShell does not maintain a release list. The public IDs are cached in `~/.cache/meldshell/claude-model-history.json` for offline discovery. A configured Claude picker or a cloud/gateway deployment keeps its own catalog. Explicit IDs can also be added in Settings > Providers > Claude.
- Standard/Fast controls for models advertising `supportsFastMode`. Each turn passes `settings.fastMode` explicitly, so Standard overrides an inherited fast preference. Fast mode uses paid usage credits on subscription plans, subject to account availability.
- Separate Codex and Claude subscription cards with refresh and polling. Claude usage comes from the SDK's experimental structured usage method, without reading or storing credentials. This method is version-pinned with the SDK and may need adaptation on upgrade. Accounts without subscription windows show an unavailable-allowances state.
- Streaming assistant text and reasoning, command output, file changes and diffs, tool calls, and subagent tool activity.
- Tool approval, denial, cancellation, and Claude's questions, including multiple selections.
- Code and plan modes, tool permission settings, and interruption.
- Text, image, file-reference, and skill-file attachments.
- Saved native sessions, queued follow-up turns, provider-specific title generation, worker restart recovery, and desktop notifications.
- Claude Code's system prompt and user, project, and local settings. This loads the applicable `CLAUDE.md`, skills, hooks, and configured MCP tools through Claude Code.
- SDK-supported slash commands entered directly in the composer. Native events for compaction, hooks, rate limits, and background tasks remain in the stored transcript payloads.

Each provider has its own native session within a MeldShell thread, stored by thread and harness in `provider_sessions`. Switching back to Claude resumes Claude's history. Codex messages are not copied into that history. Stop an active turn before switching providers. Code/Plan mode is supported for Claude; the current Codex integration rejects Plan mode.

## Permissions

Claude's controls describe tool permissions, not an operating-system filesystem sandbox. Native modes use Claude Code's labels; Read tools only is a custom MeldShell restriction.

| Composer control               | Claude behavior                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Read tools only (custom)                | Exposes Read, Glob, Grep, WebSearch, and WebFetch. Blocks command execution, editing, agents, skills, and MCP tools. |
| Manual               | Uses Claude's default permission mode and configured permission rules.                                               |
| Accept edits                    | Uses `acceptEdits`; other tools follow Claude's permission rules.                                                    |
| Don’t ask                  | Uses `dontAsk` to reject actions that need approval.                                                                 |
| Bypass permissions | Uses `bypassPermissions`.                                                                                            |
| Plan                           | Uses Claude's plan permission mode. Read-tools restrictions still apply if selected.                                 |

Claude evaluates its configured rules before invoking MeldShell's approval callback. Tools already allowed by those rules do not display a dialog. **Allow for this turn** applies SDK permission suggestions only to the current worker query, without writing permission rules to user or project settings. Follow-up turns resume conversation history in a fresh query and may ask again.

## Remaining work

There are no dedicated controls yet for MCP authentication and elicitation, plugin management, slash-command discovery, checkpoint rewind, session import/fork, live steering, or background-task management. Native rate-limit and cost events are recorded.

The integration resumes each follow-up turn through the SDK against the installed Claude Code CLI. It does not keep a persistent SDK query between turns. Background work tied to that query therefore stops when the turn finishes.

The desktop supervisor tracks provider child processes and reconciles interrupted worker-owned turns without replaying them automatically.

## References

Use the [release checklist](release.md) for packaged and authenticated checks. The dated 0.1.0 artifact record does not certify later Claude changes.

External documentation:

- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Model configuration](https://code.claude.com/docs/en/model-config)
- [Fast mode](https://code.claude.com/docs/en/fast-mode)
- [Models.dev](https://models.dev)
- [Permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- [User input](https://code.claude.com/docs/en/agent-sdk/user-input)
- [Sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [System prompts and project instructions](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)
