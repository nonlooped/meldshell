# Architecture

Use this reference for process, IPC, persistence, provider, and recovery changes. It describes source behavior, not release certification. Provider details live in [Claude](claude-provider.md) and [Cursor](cursor-provider.md).

## Ownership and processes

A workspace identifies a local folder. A thread belongs to one workspace; each turn records its provider, harness, model, and execution settings. A harness is the coding runtime, such as Codex or Claude Code. Cursor's catalog may contain models from several vendors.

Each harness has a separate native session inside a MeldShell thread. Switching back resumes that session without copying another harness's messages.

```text
Sandboxed React renderer          Browser clients (remote)
  | named preload methods            | account service relay
Electron main or headless Node ------'
  host (packages/host), in process
  |-- core utility process: SQLite, catalog, threads, queue, search, recovery
  |-- Codex utility process: codex app-server subprocess
  |-- Claude utility process: SDK queries and installed Claude child processes
  `-- Cursor utility process: workspace-local ACP subprocesses
```

[Host supervision](../packages/host/src/worker-provider.ts) owns worker generations, delivery acknowledgments, persistence routing, attention, restart, and shutdown. Each provider package owns its native protocol, session behavior, and event mapping. [provider-runtime](../packages/provider-runtime/src) shares process-tree shutdown and worker-envelope handling.

The [core worker](../packages/host/src/core-server.ts) is the sole application database writer. It admits up to eight RPC handlers and serializes mutation handlers and background search refreshes through one writer gate. SQLite's connection semaphore excludes reads during write transactions; multi-query snapshots also use transactions.

The renderer has no Node.js access or direct provider connection. Main owns operating-system integration, window management, dialogs, notifications, and shutdown.

The [host](../packages/host/src/host.ts) runs in the Electron main process or in the [headless entry point](../apps/host/src/index.ts). Its [operation table](../packages/host/src/api.ts) serves both desktop IPC and relayed browser commands; operations outside it, such as adding a workspace or updating the app, stay desktop-only. Host events are coalesced every 32 ms before they reach any client. See [Remote control](remote-control.md) for accounts and the relay.

## IPC and startup

[Contracts](../packages/contracts/src/index.ts) define records, errors, core RPCs, worker envelopes, and renderer IPC. Effect RPC connects main to core over utility-process messaging. Provider workers use validated envelopes. The [preload API](../apps/desktop/src/preload/index.ts) exposes named methods and listeners, with main-process validation.

Effect layers and scoped runtimes construct services; schedules drive restarts and background work. Provider code also uses Promises and callbacks where native APIs require them.

Main registers IPC and opens the window before core readiness. Providers start concurrently after their services are acquired. Migration backups remain required but do not gate window creation. Startup logs distinguish Electron readiness, core/provider readiness, and the window's ready-to-show event. Preserve worker bundle filenames used by launch code.

## Provider contracts

| Harness | Connection and lifetime | Discovery |
| --- | --- | --- |
| Codex | One supervised app-server process over stdio JSONL; committed schemas and Ajv validate native messages | Inherited PATH; minimum version is enforced in [client.ts](../packages/provider-codex/src/client.ts) |
| Claude Code | A fresh SDK query per turn resumes the stored session; query-bound background work ends with the query | Installed CLI on PATH or `MELDSHELL_CLAUDE_EXECUTABLE`; probe determines compatibility |
| Cursor | A workspace-local ACP process per conversation remains open between turns; saved sessions load after restart | Installed CLI or `MELDSHELL_CURSOR_EXECUTABLE`; Cursor authentication handshake required |

Codex probes at startup, explicit refresh, authentication changes, and on-demand reconnect. It does not use an idle polling timer. Claude's SDK is a protocol client targeting the installed executable, which is not packaged with MeldShell.

Native payloads remain alongside canonical event kinds. [Projection](../packages/projection/src/index.ts) turns those events into display and search content. A schema's existence does not imply a UI feature: the core currently rejects Codex Plan mode.

Unavailable providers leave stored conversations readable. External-session import is not implemented.

## Turns and recovery

The database permits one running turn per thread. Different threads can run concurrently without an application concurrency cap. Closing a tab leaves its turn running.

Submissions during active work commit to `queued_inputs`. Normal promotion joins queued text with blank lines, keeps attachment order, and uses the thread's selected provider/model. Shutdown and worker reconciliation suppress promotion.

Before dispatch, a turn receives its worker generation. Failed delivery or an ambiguous acknowledgment triggers reconciliation, not automatic replay. A disconnected worker's running turns fail. Application startup interrupts remaining running turns and clears stale approvals while preserving queued input. A later explicit submission can resume the native session; there is no dedicated retry/resume UI action.

Workers restart with backoff. Renderer reloads do not control their lifetime. Intentional close with active work requests confirmation, interrupts turns, and terminates child process trees. See [interrupt-turn.ts](../packages/host/src/interrupt-turn.ts) for escalation and timeout handling.

## Storage and search

[core-client.ts](../packages/host/src/core-client.ts) opens `meldshell.sqlite` in the host data directory: Electron user data, `MELDSHELL_DATA_DIR`, or the headless `--data-dir`. An OS-released [ownership lock](../packages/host/src/ownership.ts) admits one core writer per directory. [Persistence setup](../packages/core/src/database/persistence.ts) enables foreign keys, WAL, full synchronous writes, and a busy timeout.

The schema stores workspaces, threads, turns, events, queues, provider/model catalogs, per-thread settings, approvals, preferences, and search documents. `provider_sessions` is keyed by thread and harness. Turn rows preserve submitted settings, native turn ID, outcome, and worker generation; next-turn choices live in `thread_settings`.

New threads inherit model, effort, and speed from the most recent submitted turn whose model remains available, otherwise the catalog default. Existing threads retain their choices.

[Migrations](../packages/core/src/database/migrations.ts) back up an existing disk database before applying pending migrations transactionally. Thread deletion cascades through history. Workspace removal deletes MeldShell records and transcripts, retains the folder, and rejects removal while work is active.

[Search](../packages/core/src/search.ts) indexes projected messages from finished turns in bounded background batches. FTS5 supports word-prefix matching, workspace filtering, and pages of 50 results across active, pinned, and archived threads. New or migrated history may appear after indexing catches up.

## Renderer state and history

React Query owns snapshots, thread pages, provider state, usage, and transcripts. Runtime notifications invalidate affected queries. Streaming-only changes invalidate the affected transcript; lifecycle changes retain broader invalidation. Main briefly coalesces compatible text deltas before persistence.

Thread lists page before calculating indexed counts and activity. [Transcript.tsx](../apps/desktop/src/renderer/src/threads/Transcript.tsx) loads a recent, turn-complete window and virtualizes turns. Earlier windows load on request or for search navigation. Streaming fetches events after the last sequence and reprojects touched turns.

Whole-turn projection preserves message integrity but allows a large turn to exceed the nominal page size. Loaded older windows remain cached. `transcriptMetrics` in renderer `data/transcript.ts` exposes fetch counts, event counts, and projection timings.

Zustand holds tabs, split layouts, selection, and settings navigation in memory. Tabs and unsent drafts do not survive restart. Theme, transcript size, reduced motion, send shortcut, archived visibility, and title-model selection are database-backed.

React Compiler has local opt-outs for virtualized components. Settings, math, diffs, and Mermaid use lazy loading. File and Git queries stay with their views; host-side [workspace files](../packages/host/src/workspace-files.ts) and [Git](../packages/host/src/git.ts) implement their operating-system operations.

## Security and distribution

The window enables sandboxing and context isolation, disables Node integration, and uses a restrictive Content Security Policy. Development uses a local server; packages load bundled renderer resources.

Renderer isolation does not isolate agents editing the same folder. MeldShell has no worktree manager or filesystem locking layer. Native tool permissions are not operating-system sandbox guarantees.

[Packaging configuration](../apps/desktop/electron-builder.yml) defines Windows x64 NSIS and Linux x64 AppImage targets. SQLite is unpacked outside ASAR; Claude Code is excluded.

Installed builds check the configured GitHub Releases feed at startup and every four hours. [The updater](../apps/desktop/src/main/updater.ts) downloads stable releases in main and checks the SHA-512 supplied by release metadata. About exposes a manual check and a restart action after download. Development builds do not contact the feed.

Publish artifacts with their matching `latest.yml` or `latest-linux.yml` from the same build. Public updates require a publicly accessible destination. Follow [Release](release.md) for candidate evidence.
