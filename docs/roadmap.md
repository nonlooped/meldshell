# Product and roadmap

MeldShell owns the desktop inbox, durable history, process supervision, and attention routing for concurrent coding-agent work. Codex, Claude Code, and Cursor own their native sessions and tools.

This inventory was checked against source on September 19, 2026. Implementation is not release certification; the [0.1.0 record](releases/0.1.0.md) applies only to its artifact.

## Current implementation

| Area | Available behavior |
| --- | --- |
| Desktop | Electron window, Windows acrylic or Linux solid backdrop, resizable inbox, thread/file tabs, split thread layouts, keyboard controls |
| Workspaces | Add, rename, and remove records and history while retaining disk files; active work blocks removal |
| Inbox and search | Pinned, active, and archived threads; workspace filtering; cursor pagination; FTS5 search with matching-turn navigation |
| Providers | Supervised Codex, Claude, and Cursor workers; catalogs, connection probes, and separate native histories within a thread |
| Turn controls | Provider/model selection, supported reasoning and speed choices, native permissions and modes, interruption, queued follow-ups |
| Transcript | Streamed Markdown, reasoning, tool details, questions, approvals, file changes, rich output, and turn-complete history windows |
| Workspace tools | File browsing and previews; working-tree and staged diffs; stage, unstage, discard, commit, push, and commit history |
| Persistence | SQLite history, queued input, per-harness sessions, migration backups, and interrupted-worker recovery |
| Settings | Appearance, send shortcut, archived visibility, title-model selection, provider/model catalogs, and provider usage |
| Distribution | Unsigned Windows x64 NSIS and Linux x64 AppImage packages; updater integration |

See [Architecture](architecture.md), [Design](design.md), [Claude](claude-provider.md), and [Cursor](cursor-provider.md) for ownership and limitations. File and Git behavior lives in [FilesSidebar](../apps/desktop/src/renderer/src/files/FilesSidebar.tsx) and [GitSidebar](../apps/desktop/src/renderer/src/files/GitSidebar.tsx).

## Remaining product and engineering work

These are open areas, not an approved delivery sequence.

- Restore tabs, split layouts, and unsent drafts after restart. Add an explicit interrupted-turn retry/resume action while preserving protection against duplicate delivery.
- Extend provider coverage where native behavior is not yet exposed. Codex Plan mode is rejected; Claude and Cursor limits are documented per provider.
- Add review annotations and a deliberate review-to-agent workflow. File/diff viewers, per-turn changes, and Git controls already exist.
- Add workspace isolation through worktrees or another explicit design. Concurrent agents currently share disk files.
- Consider an embedded terminal, session import/fork, and PR workflows.
- Certify installed builds across provider states and introduce signing. macOS is not a configured release target.

Automation, issue integrations, remote workers, mobile access, and a daemon require separate product decisions.

## Current boundaries

Harnesses are installed and authenticated outside MeldShell. Switching providers resumes separate native histories; it does not transfer context. MeldShell does not import externally created sessions or provide third-party provider plugins.

There is no app-managed worktree isolation, filesystem lock, embedded terminal, WSL integration, remote client, cloud synchronization, or listening control-plane service. The file viewer and Git controls do not make MeldShell a full editor.

Tabs and drafts remain temporary. Search indexes finished turns asynchronously. Transcript loading is bounded by complete turns, so one unusually large turn can still exceed the requested page size. Usage cards do not enforce spend caps.

## Verification and release goals

The 50-concurrent-turn, 10,000-thread, and multi-year-history goals still need measured candidate evidence. Source presence alone does not establish responsiveness or provider reliability.

Use [Release](release.md) to record isolation, recovery, approvals, keyboard access, updates, and clean-profile behavior against exact artifact hashes and provider versions.

## Planning history

The [competitive planning record](meldShell-hofh-feature-gaps.md) preserves the 2026-09-04 feature candidates and effort bands. Its external research inputs are absent. Recheck competitor claims and current code before using it for prioritization.
