# Cursor integration

Use this reference for Cursor ACP connections, event mapping, permissions, and account usage. [provider-cursor](../packages/provider-cursor/src/client.ts) connects to the installed local CLI through the ACP SDK.

## Protocol choice

ACP provides interactive permission requests, session resume, modes, and Cursor-specific questions and plans. These fit a desktop client where the user participates during a turn. The integration uses ACP v1 JSON-RPC and NDJSON transport; it does not promise Cursor IDE parity.

The SDK owns envelopes, request tracking, serialization, and typed session/permission handling. MeldShell parses Cursor extensions and owns process supervision, a 16 MiB incoming-line limit, and request deadlines. A deadline closes the connection and rejects outstanding requests; reconnect requires a later explicit submission. Conversation prompts have no deadline; title generation has a 60-second deadline.

A read-only stream observer retains native notifications before parsing and archives requests as `cursor/acp/request/received`. It does not rename methods or alter dispatch.

See [Cursor's ACP reference](https://cursor.com/docs/cli/acp) and the [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk) when changing protocol behavior.

## Discovery and sessions

Each active conversation owns a Cursor subprocess launched in its workspace. This isolates extension messages that omit a session ID. Connections remain open between turns. After restart, the worker loads the stored native session and keeps replayed history separate from new output.

On Windows, discovery resolves the official launcher to bundled `node.exe` and `index.js` without shell interpolation. It prefers `cursor-agent` and the official installation before `agent`, which may belong to another product. The handshake must advertise Cursor authentication. `MELDSHELL_CURSOR_EXECUTABLE` selects another installation.

Cursor owns credentials. Sign in through the installed CLI or its supported environment configuration, then use Check again in MeldShell.

Startup opens a temporary authenticated ACP connection and calls `cursor/list_available_models`. A method-not-found response falls back to `session/new` for older releases. The probe closes after catalog discovery. Real conversations start in their own workspace; cold startup can remain in a loading state until discovery completes.

Model IDs, including bracketed variant parameters, pass through unchanged. MeldShell does not infer reasoning or speed settings from their spelling. The model editor can supply a native variant ID for Cursor to validate.

## Lifecycle and recovery

The shared supervisor owns generations, delivery acknowledgments, queues, and reconciliation. The Cursor worker owns protocol/session state; local lifecycle events remain distinct from native ACP events.

An ambiguous or failed prompt is not resubmitted automatically. Cancellation answers pending interactions as cancelled, sends `session/cancel`, and escalates to process-tree termination if needed. A failed turn discards its connection. The next explicit submission may resume its saved session.

## Event and interaction coverage

Native parameters remain in storage while projection controls display. Compatible text chunks may be coalesced without dropping other metadata.

| Native event/request | MeldShell behavior |
| --- | --- |
| `agent_message_chunk` | Stream answers, separated by intervening tools/thoughts |
| `agent_thought_chunk` | Reasoning activity |
| `user_message_chunk` | Retain without duplicating the submitted message |
| `tool_call`, `tool_call_update` | Merge partial state by tool ID; display input, results, commands, status, diffs, and rich output |
| `plan` | Latest plan steps |
| `available_commands_update` | Commands in activity; direct composer entry |
| `current_mode_update`, `config_option_update` | Setting activity; mode also updates the next-turn selection |
| `usage_update` | Context usage and reported cost |
| `session_info_update` | Retain raw metadata |
| Prompt result/stop reason | Durable completion/interruption; refusals and limits stay visible without automatic queue advancement |
| `session/request_permission` | Exact native option IDs and labels with tool details |
| `cursor/ask_question` | Validated single/multiple choices, distinct IDs/labels, skip, and cancel |
| `cursor/create_plan` | Markdown review with accept/reject/cancel |
| `cursor/update_todos` | Merge by ID or replace, including cancelled state |
| `cursor/task` | Subagent description, prompt, identity/type, and supplied results |
| `cursor/generate_image` | Description and file paths; inline ACP image previews |
| Unknown notifications | Preserve as unknown events |
| Unknown/malformed requests | Retain when associated with a turn and return a protocol error |

Standard semantics are documented in ACP's [prompt turns](https://agentclientprotocol.com/protocol/v1/prompt-turn), [tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls), and [configuration options](https://agentclientprotocol.com/protocol/v1/session-config-options).

## Permissions and limits

Ask Every Time preserves native permission dialogs. Deny requests is MeldShell's custom policy: choose the advertised reject-once option, or cancel if unavailable. Run Everything selects allow-once without saving permanent rules; requests without that option remain interactive. Questions and plan reviews still require answers.

Changes apply on the next turn, including reused sessions, and do not override Cursor's restrictions. Native Ask/Plan modes and permission choices are not operating-system sandbox guarantees.

Cursor owns filesystem and terminal execution. MeldShell advertises neither client filesystem nor client terminal execution, and does not apply Codex sandbox flags. Workspace-local Cursor configuration remains native. Dashboard-managed team MCP servers are not supported by this ACP integration.

There is no external-session import picker, cloud-agent handoff, terminal attachment UI, or command autocomplete. Local generated-image paths are shown without automatic loading into the renderer; inline ACP image payloads can be previewed.

Notifications outside an active MeldShell turn are not appended to completed history. Unsupported client requests outside a turn are rejected. Background-task parity with the IDE is not promised.

## Subscription usage

ACP provides session usage. The separate allowance card uses Cursor's undocumented dashboard endpoint, `GET https://cursor.com/api/usage-summary`, through [usage.ts](../packages/provider-cursor/src/usage.ts). This dependency can change independently of ACP.

The worker reads the CLI's `auth.json` on each refresh and uses its token as a `WorkosCursorSessionToken` cookie. Windows uses `%APPDATA%\Cursor\auth.json`; macOS uses `~/.cursor/auth.json`; Linux uses `$XDG_CONFIG_HOME/cursor/auth.json`, defaulting to `~/.config/cursor/auth.json`.

Credentials stay inside the worker and are never written or refreshed by MeldShell. Only normalized allowances cross IPC. Environment authentication overrides disable stored-account usage to avoid mixing accounts. Expired credentials require CLI sign-in. Requests time out, support cancellation, and reject redirects.

The card refreshes each minute and displays Cursor/Auto, API, and overall percentages independently, with billing-cycle end as reset time. Missing pools remain unavailable; malformed responses fail. Spending amounts do not determine percentages. On-demand spending and legacy request counts are not mapped.

Transport and interaction fixtures exercise local protocol behavior without model inference. Use [Release](release.md) for candidate-specific checks.
