# Cursor integration

Research and implementation checked on 2026-09-06. This is an ACP integration with the local Cursor CLI. It is not a claim of full Cursor IDE parity or release certification.

## Client choice

MeldShell starts Cursor in `acp` mode and uses `@agentclientprotocol/sdk` in [provider-cursor](../packages/provider-cursor/src/client.ts). Cursor documents ACP specifically for custom interactive clients. It supplies bidirectional permissions, session resume, modes, and Cursor extensions. This matches a desktop host that needs users to participate during a run. [Cursor ACP documentation](https://cursor.com/docs/cli/acp)

The alternatives researched were:

- **Print/stream-JSON CLI:** useful for automation and observing tool activity, but its documented interface is an output stream rather than an interactive client protocol. [Output formats](https://cursor.com/docs/cli/reference/output-format)
- **`@cursor/sdk`:** supports local and cloud execution, durable agents, typed streams and programmatic authentication. Its default local execution approves tools automatically; documented gating uses hooks or sandbox configuration. ACP provides the direct interactive permission surface needed here. [TypeScript SDK](https://cursor.com/docs/sdk/typescript)
- **Cloud API / SDK Bridge:** changes execution or adds a server layer without improving this local desktop integration. [SDK Bridge](https://cursor.com/docs/sdk/bridge)

The [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk) owns ACP v1 JSON-RPC envelopes, request tracking, response serialization, and NDJSON transport. The integration uses its app API with typed permission and session-update handlers and explicit parsers for Cursor's question and plan extensions. Request handlers return responses or await a user decision; the SDK sends the reply and rejects unsupported or malformed calls. Worker code calls the SDK's typed agent context directly. Connections use `connect()` because conversations remain open between turns and can load saved sessions.

A read-only stream observer retains native notifications before SDK parsing and archives original requests as `cursor/acp/request/received` events. It does not change method names, payloads, or dispatch. MeldShell owns process supervision, the 16 MiB incoming-line limit, and request deadlines. A deadline closes the connection and rejects all outstanding requests; the next submission must explicitly reconnect. Conversation prompts have no deadline; title generation retains its 60-second deadline. Transport and interaction tests use a local fixture without model inference.

## What was observed locally

The installed Windows CLI identified its version as `2026.08.31-4057e58`. A real initialize/authenticate/new-session exchange succeeded without submitting a prompt. It advertised:

- Protocol version 1, `cursor_login`, session loading and listing.
- Image input; no audio or embedded-context input.
- Agent, Plan and Ask mode selectors.
- A model catalog with exact variant IDs, including bracketed model parameters.
- `configOptions` for model and mode; changing the selected model returned those same two selectors.

These are observations of this installation, not hardcoded model capabilities. The model catalog is refreshed from Cursor. Variant IDs are sent unchanged. MeldShell does not infer reasoning or speed choices from the text inside an ID; the existing model editor can supply a different native variant ID, which Cursor validates.

## Process and session ownership

Each active conversation owns a separate Cursor subprocess launched from its workspace directory. This also isolates extension messages that omit a session ID. Processes remain available between turns, and subsequent submissions reuse the connection. After application restart, the stored Cursor session ID is loaded; replayed history is retained separately and does not appear as a new answer.

The existing utility-process supervisor handles worker generations, delivery acknowledgments, queue promotion and reconciliation. The Cursor worker owns protocol and session state. Local turn lifecycle messages are separate from native ACP events. A failed or ambiguous prompt is never automatically resubmitted. Cancellation answers pending interactions as cancelled, sends `session/cancel`, and terminates the child process tree if the turn does not settle promptly. A failed turn discards its connection; the next explicit submission can resume the saved session.

On Windows, discovery resolves Cursor's official launcher layout to its bundled `node.exe` and `index.js`, avoiding command-shell interpolation. `cursor-agent` and the official install directory take precedence over `agent`. The latter is not unique to Cursor: on the research machine it belongs to Grok. The handshake must advertise Cursor's authentication method before the process can be used. `MELDSHELL_CURSOR_EXECUTABLE` can select another installation.

Credentials remain owned by Cursor. Sign in with the installed CLI or configure Cursor's supported environment credentials, then use **Check again** in MeldShell. This integration does not copy credentials into the app database.

Startup discovery initializes and authenticates a temporary ACP connection, then requests
`cursor/list_available_models` without creating a conversation. Older releases that return
method-not-found fall back to `session/new` for the catalog. The probe connection closes
after discovery; real conversations still start in their own workspace. The composer becomes
ready after the authenticated catalog has been stored, so native startup and network latency
can still produce a loading state on cold starts.

## Event and interaction coverage

The following table describes implemented behavior. Native parameters remain in the events table; display projection is separate. Consecutive compatible text chunks may be coalesced without dropping their other metadata.

| Native event or request | MeldShell behavior |
| --- | --- |
| `agent_message_chunk` | Streaming answers, separated across intervening tools and thoughts |
| `agent_thought_chunk` | Reasoning activity |
| `user_message_chunk` | Retained without duplicating the submitted user message |
| `tool_call`, `tool_call_update` | Partial-state merging by tool ID; command output, tool input/results, status, diff contents and rich output |
| `plan` | Latest plan steps |
| `available_commands_update` | Advertised slash commands shown in activity; commands can be typed into the composer |
| `current_mode_update`, `config_option_update` | Native setting changes shown in activity; mode changes also update the next-turn composer selection |
| `usage_update` | Context usage and reported cost shown in activity |
| `session_info_update` | Raw metadata retained |
| Prompt result / stop reason | Durable completion or interruption; refusal/limits remain visible and do not automatically advance the queue |
| `session/request_permission` | Native option labels and exact option IDs, with tool-call details; no inferred “allow for session” translation |
| `cursor/ask_question` | Single/multiple choice, option IDs distinct from labels, validated answers, skip and cancel |
| `cursor/create_plan` | Markdown plan review with explicit accept/reject/cancel response |
| `cursor/update_todos` | ID-based merge or replacement, including cancellation status |
| `cursor/task` | Subagent description, prompt, identity/type and supplied result metadata |
| `cursor/generate_image` | Description and output/reference paths; ACP image content displays inline |
| Unknown notifications | Preserved as unknown events |
| Unknown or malformed requests | Preserved when associated with a turn, answered with a protocol error so the agent cannot wait forever |

The standard update semantics are documented in [ACP prompt turns](https://agentclientprotocol.com/protocol/v1/prompt-turn), [tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls), and [configuration options](https://agentclientprotocol.com/protocol/v1/session-config-options). Cursor's extension contracts are listed in its [ACP reference](https://cursor.com/docs/cli/acp).

## Permissions

Deny requests is a custom MeldShell policy; the other labels follow Cursor CLI.

The composer offers **Ask Every Time**, **Deny requests (custom)**, and **Run Everything**.
Ask Every Time preserves Cursor's native permission dialog. Deny requests selects
the advertised reject-once option, or cancels if unavailable. Run Everything selects
the advertised allow-once option for each tool request without saving persistent
permission rules. Requests without allow-once stay interactive. Questions and plan
reviews still require a response. These settings apply on the next turn, including
reused sessions, and do not override Cursor's own restrictions.

## Boundaries

- Cursor owns filesystem and terminal execution. MeldShell advertises neither client filesystem nor client terminal execution; it does not apply Codex sandbox flags to Cursor.
- Existing Cursor project/user configuration is used by the workspace-local CLI. Dashboard-managed team MCP servers are not supported by Cursor ACP.
- Native Ask/Plan restrictions and permission choices are not represented as operating-system sandbox guarantees.
- ACP only exposes session usage. The subscription settings card reads account allowances separately through Cursor's private dashboard endpoint; see below.
- There is no external-session import picker, cloud-agent handoff, terminal attachment UI, or slash-command autocomplete.
- Local generated-image paths are displayed, not fetched automatically into the renderer. Inline ACP image payloads are previewed.
- Notifications arriving while no MeldShell turn is active are not attached to a completed transcript. Unsupported client requests outside an active turn are rejected. There is no promise of background-task parity with the IDE.

## Subscription usage

The Cursor worker reads the installed CLI's `auth.json` on each refresh and uses its access token as a `WorkosCursorSessionToken` cookie for `GET https://cursor.com/api/usage-summary`. This is an undocumented dashboard interface, not an ACP capability or supported public API. The stored-login path was verified on Windows; it does not require the Cursor editor or browser-cookie access.

On Windows the auth file is `%APPDATA%\Cursor\auth.json`; the CLI paths for macOS and Linux are `~/.cursor/auth.json` and `$XDG_CONFIG_HOME/cursor/auth.json` (default `~/.config/cursor/auth.json`). MeldShell reads credentials only inside the provider worker, never writes or refreshes them, and sends only normalized allowances across IPC. Expired sessions require signing in again through Cursor CLI. Environment authentication overrides disable this path to avoid showing another stored account's usage. Requests time out, support cancellation, and reject redirects.

The card refreshes every minute and displays the reported Cursor/Auto, API, and overall percentages independently, with the billing-cycle end as the reset time. An exhausted API pool does not imply an exhausted Cursor/Auto pool. Spending fields are not used to infer percentages. Missing pools remain unavailable; malformed responses fail the refresh. On-demand spending and legacy request-count allowances are not mapped by this integration.

## Verification

Real CLI initialization, authentication and model discovery were checked separately; live inference and installer certification remain unverified. Validate composer interactions, cancellation, and saved-session loading manually for a release candidate.
