# Claude Code integration

Use this document for Claude discovery, sessions, permissions, model controls, and limitations. The implementation lives in [provider-claude](../packages/provider-claude/src/index.ts), its [worker](../packages/provider-claude/src/worker-runtime.ts), and the shared [host supervisor](../packages/host/src/worker-provider.ts).

## Connection and credentials

Choose a Claude model in the composer. Settings > Providers > Claude shows connection status and catalog refresh.

MeldShell discovers the installed Claude Code CLI on PATH. `MELDSHELL_CLAUDE_EXECUTABLE` can select a native binary or JavaScript entrypoint. The pinned Agent SDK targets that executable through `pathToClaudeCodeExecutable`; it does not use or package the SDK's bundled CLI. Compatibility depends on a successful probe, with no minimum-version gate.

Claude owns sign-in and environment credentials. When sign-in is missing, use `claude auth login` in a terminal and then Check again in MeldShell. The application does not store API keys in SQLite.

## Models and usage

The picker uses Claude's discovered capabilities. Alias labels can show the SDK's resolved version while retaining the original alias as the stored model ID.

[Model history](../packages/provider-claude/src/model-history.ts) discovers public IDs through Models.dev and supplies them to Claude's model picker for capability and policy filtering. It caches those IDs in `~/.cache/meldshell/claude-model-history.json`. Configured pickers and cloud/gateway deployments retain their own catalogs. Settings also accepts explicit model IDs.

Standard/Fast controls appear for models advertising fast-mode support. Every turn explicitly passes the fast-mode setting so Standard overrides an inherited preference. Account availability and billing remain Claude's responsibility.

The usage card calls the pinned SDK's experimental structured usage method without reading or storing credentials. Accounts without subscription windows show unavailable allowances. Recheck this integration on SDK upgrades.

## Sessions and events

Each thread stores a Claude session separately from its Codex and Cursor sessions. Returning to Claude resumes only Claude history. Stop an active turn before changing providers.

Each follow-up creates a fresh SDK query with the stored session reference. The query closes when the turn ends, so query-bound background work cannot persist between turns. The supervisor tracks child processes and reconciles failed worker-owned turns without automatically replaying them.

The integration supports:

- Streaming text and reasoning, commands, tool calls, file changes/diffs, and subagent activity.
- Approvals, denial, cancellation, and questions with multiple selections.
- Code/Plan modes, supported reasoning/speed choices, and interruption.
- Text, images, file references, and skill-file attachments.
- Queued turns, provider-specific titles, native session resume, and notifications.

Claude loads its system prompt and user, project, and local settings. Applicable CLAUDE.md files, skills, hooks, and configured MCP tools remain native Claude behavior. Supported slash commands can be typed in the composer. Native compaction, hook, rate-limit, cost, and background-task events remain in stored payloads even where no dedicated control exists.

## Permissions

These controls govern tools, not an operating-system filesystem sandbox.

| Composer choice | Behavior |
| --- | --- |
| Read tools only | Custom restriction to Read, Glob, Grep, WebSearch, and WebFetch; excludes commands, edits, agents, skills, and MCP tools |
| Manual | Claude default mode and configured rules |
| Accept edits | Native `acceptEdits`; other tools follow Claude rules |
| Don't ask | Native `dontAsk`; rejects actions requiring approval |
| Bypass permissions | Native `bypassPermissions` |
| Plan | Native plan permission mode; selected read-tool restrictions still apply |

Claude evaluates configured rules before MeldShell's approval callback, so already-allowed tools need no dialog. Allow for this turn applies SDK suggestions to the current query only. It writes no user/project rules, and a follow-up query may ask again.

## Limits and verification

Dedicated controls for MCP authentication/elicitation, plugin management, command discovery, checkpoint rewind, session import/fork, live steering, and background-task management are absent.

This document describes the integration; it does not certify authenticated behavior. Use the [release checklist](release.md) for candidate checks.

For dependency changes, consult primary [SDK documentation](https://code.claude.com/docs/en/agent-sdk/overview), [permissions](https://code.claude.com/docs/en/agent-sdk/permissions), [sessions](https://code.claude.com/docs/en/agent-sdk/sessions), [user input](https://code.claude.com/docs/en/agent-sdk/user-input), [model configuration](https://code.claude.com/docs/en/model-config), and [project instructions](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts).
