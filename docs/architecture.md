# MeldShell architecture

Implementation reference reviewed on 2026-09-08. This describes the current checkout, not a certified release. See [Claude integration](claude-provider.md), [Cursor integration](cursor-provider.md), and [roadmap](roadmap.md) for provider behavior and remaining work.

## Terms and ownership

A provider identifies the service supplying an agent (OpenAI, Anthropic, or Cursor); a harness is its coding-agent runtime (Codex, Claude Code, or Cursor CLI). A workspace identifies a local folder. A thread belongs to one workspace, while each turn selects a provider, harness, model, and execution settings. The Cursor catalog includes models from several vendors.

Threads are provider-neutral in MeldShell's database and transcript. Native histories are separate: switching back to a harness resumes its own session, without copying the other harness's messages into it.

## Process topology

```text
Sandboxed React renderer
        | named preload methods and change notifications
Electron main process
        |-- window, dialogs, notifications, shutdown
        |-- core utility process
        |      `-- SQLite, catalog, threads, queue, search, recovery
        |-- Codex utility process
        |      `-- supervised codex app-server subprocess
        |-- Claude utility process
        |      `-- SDK queries and native Claude child processes
        `-- Cursor utility process
               `-- workspace-local Cursor ACP subprocesses
```

Main supervises providers through [worker-provider.ts](../apps/desktop/src/main/runtime/worker-provider.ts). Protocol handling stays in [provider-codex](../packages/provider-codex/src/worker-runtime.ts), [provider-claude](../packages/provider-claude/src/worker-runtime.ts), and [provider-cursor](../packages/provider-cursor/src/worker-runtime.ts). Shared supervision handles delivery acknowledgments, worker generations, event persistence, attention routing, and shutdown without making the native protocols identical.

The [core worker](../apps/desktop/src/main/workers/core.ts) is the only application database writer. It admits up to eight RPC handlers while serializing mutation handlers and background search refreshes through one writer gate. SQLite's connection semaphore excludes reads during write transactions; multi-query snapshots also run transactionally. The renderer has no Node.js access and does not talk directly to provider processes.

## Application services and IPC

Effect layers and scoped runtimes construct the core client, database, desktop events, and provider supervisors. Schedules drive worker restart and background work. Provider boundaries also contain ordinary Promise and callback code; not every module is an Effect service.

[Contracts](../packages/contracts/src/index.ts) define Effect Schema records, errors, worker messages, and core RPCs. Main-to-core Effect RPC messages travel over Electron utility-process messaging. Main-to-provider communication uses validated worker envelopes. The renderer uses named invocation methods and event listeners exposed by the [preload](../apps/desktop/src/preload/index.ts), with main-process validation at the boundary.

## Source layout

The desktop main entry registers IPC and opens the window before waiting for core readiness. Provider workers start concurrently in background fibers after their services are acquired. Startup logs record `whenReady`, core readiness, provider readiness, and `ready-to-show`; database migration backups remain mandatory but no longer gate window creation. `window.ts` owns window creation, `ipc.ts` registers renderer requests, `runtime/` owns services and shutdown, and `workers/` contains the utility-process entrypoints. Worker bundle filenames remain stable.

Renderer code is grouped into `app`, `data`, `threads`, `files`, `workspaces`, `settings`, and shared `ui`. The data modules own snapshot mutations, shared query keys, and cache invalidation; feature-specific file and Git queries stay with their views.

Contracts separate records, errors, core RPCs, worker envelopes, and renderer IPC. The IPC registry derives preload methods from the same channel definitions. Core database setup, migrations, and row conversion live in `database/`, with workspace and application settings services alongside thread and turn services.

`packages/provider-runtime` owns process-tree shutdown and worker envelope decoding/acknowledgments shared by the providers. Each provider retains native session behavior, payload mapping, and acknowledgment timing.

## Provider boundaries

Codex is discovered on the inherited `PATH`; it is not bundled. The integration enforces a minimum version of `0.153.0` in [provider-codex/src/client.ts](../packages/provider-codex/src/client.ts). Its worker probes availability, authentication, models, and account state at startup, explicit refresh, authentication changes, and on-demand reconnect—not on an idle timer—and runs one `codex app-server` subprocess over stdio JSONL. Committed app-server schemas and Ajv validate native messages.

Claude is discovered on the inherited `PATH` (override `MELDSHELL_CLAUDE_EXECUTABLE`); MeldShell does not bundle Claude Code. There is no minimum-version gate — any runnable user install is accepted, and the probe connection checks protocol compatibility. The pinned Agent SDK is only the protocol client and always targets that installed CLI via `pathToClaudeCodeExecutable`. Each follow-up turn starts a new SDK query with the stored Claude session reference. User, project, and local Claude settings are loaded by that integration. Queries close at turn completion, so query-bound background work does not persist between turns.

Cursor uses the installed CLI's ACP v1 interface. Each conversation has its own workspace-local process and native session. Connections remain open between turns; saved sessions load after restart. Native Agent/Plan/Ask modes, permission options and blocking question/plan extensions have dedicated handling. See [Cursor integration](cursor-provider.md) for event coverage and limits.

The composer exposes permissions according to the selected harness. Claude supports Code and Plan modes. Codex Plan mode is currently rejected by the core; a committed protocol schema alone does not mean a feature is exposed by MeldShell.

Unavailable providers do not prevent reading stored conversations. The integrations do not import sessions created by another client. Native event payloads are retained alongside canonical event kinds; shared transcript projection lives in [packages/projection](../packages/projection/src/index.ts).

## Turns, queues, and failure recovery

The database enforces at most one running turn per thread. Different threads can run concurrently without a MeldShell concurrency cap. Closing a tab does not stop its turn.

Submissions during a running turn commit to `queued_inputs`. Normal queue promotion joins queued text with blank lines and preserves ordered attachments. Dispatch uses the thread's selected provider and model. Shutdown and worker reconciliation suppress automatic queue promotion.

Before delivery, a turn is bound to a worker generation. Delivery failures or ambiguous acknowledgments trigger reconciliation rather than automatic replay. A disconnected worker's owned running turns become failed; a full application restart marks remaining running turns interrupted and clears stale approvals. Queued input remains durable. Continuing requires an explicit submission; the renderer has no dedicated retry/resume button.

Provider utilities restart with backoff. Renderer reloads do not own provider lifetime. Intentional close with active turns requests confirmation, interrupts active work, and terminates provider process trees. See [interrupt-turn.ts](../apps/desktop/src/main/runtime/interrupt-turn.ts) and [worker-provider.ts](../apps/desktop/src/main/runtime/worker-provider.ts) for timeout and reconciliation behavior.

## Persistence and search

The database is `meldshell.sqlite` under Electron's application user-data directory, selected in [core-client.ts](../apps/desktop/src/main/runtime/core-client.ts). [Initialization](../packages/core/src/database/persistence.ts) enables foreign keys, WAL, full synchronous writes, and a busy timeout.

The schema includes:

- `workspaces`, `threads`, `turns`, `events`, and `queued_inputs`.
- `providers`, `provider_models`, and `thread_settings` for the catalog and next-turn selection.
- `provider_sessions`, keyed by thread and harness, and `approvals` with native request data.
- `settings` for application preferences.
- `transcript_documents`, its FTS5 index, and a dirty-work queue for transcript search.
- `schema_migrations`, with migrations through version 7 in the current source.

Turn rows retain provider, harness, model, effort, speed, native turn ID, outcome, and worker generation. Native session IDs live in `provider_sessions`; next-turn permission and mode choices live in `thread_settings`.

[Migrations](../packages/core/src/database/migrations.ts) run transactionally and back up an existing on-disk database before applying pending migrations. Thread deletion cascades through stored history. Workspace removal deletes its MeldShell threads and transcripts, keeps the folder on disk, and rejects removal while work is running.

Search indexes projected messages from finished turns, rather than streaming chunks. A background job processes dirty groups in bounded batches, so recently finished or migrated history may take time to appear. [Search](../packages/core/src/search.ts) supports word-prefix matching, an optional workspace filter, and pages of 50 results across active, pinned, and archived threads.

## Renderer data flow and limits

React Query owns snapshots, thread pages, provider status, usage, and transcript queries. Runtime-change notifications invalidate affected queries. Validated streaming deltas invalidate only the affected transcript, not the global snapshot or thread list; batches containing a lifecycle change retain full invalidation. Snapshot and list queries bound the thread page before computing indexed per-thread counts and activity. Compatible provider text deltas are briefly coalesced in main before persistence; there is no separate renderer `useSyncExternalStore` transcript subscription layer.

Thread lists use cursor pagination. [Transcript.tsx](../apps/desktop/src/renderer/src/threads/Transcript.tsx) initially loads a recent, turn-complete window and virtualizes rendered turns. Earlier windows load on request or when locating a search result. Streaming reads only events after the last sequence and reprojects touched turns, retaining historical turn references. A long individual turn can exceed the page size and still requires whole-turn projection; explicitly loaded older windows remain cached. Fetch counts, received-event counts, and projection timings are available in `data/transcript.ts`'s `transcriptMetrics`.

Zustand stores open tabs, selection, and settings navigation in memory. Tabs and unsent composer drafts are not restored after restart. Database-backed preferences include theme, transcript size, reduced motion, send shortcut, archived-thread visibility, and title-model selection.

React Compiler is enabled, with local opt-outs around virtualized components. Shared projection assembles streamed messages and structured activity for both transcript display and search. Settings, math rendering, and diff rendering load through lazy boundaries; Mermaid also loads dynamically only for diagrams.

## Security and release boundaries

The window enables `sandbox` and `contextIsolation`, disables `nodeIntegration`, and uses a restrictive Content Security Policy. Development loads the local development server; packaged builds load bundled renderer resources. Operating-system access stays behind the preload API.

Renderer isolation does not replace harness permissions or isolate concurrent edits to a shared workspace. MeldShell has no worktree manager or filesystem locking layer. Claude tool permissions are not an operating-system sandbox.

The manifests use Effect 3.22.1. Exact resolved dependencies are recorded in the lockfile; consult manifests before documenting an upgrade. Windows 11 x64 remains the release target. Packaging unpacks SQLite outside ASAR; Claude Code is not packaged. Certification follows [release.md](release.md).
