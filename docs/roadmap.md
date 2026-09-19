# MeldShell product and roadmap

Reviewed against the implementation on 2026-09-05. “Implemented” means present in source, not newly runtime-tested or certified for release. The [0.1.0 candidate record](releases/0.1.0.md) applies only to its dated artifact.

## Product definition

MeldShell is a local Windows desktop workbench for supervising concurrent coding-agent conversations across workspace folders. It owns the inbox, durable history, process supervision, and attention routing. Codex and Claude Code own their agent loops and native tools.

A thread stays attached to one workspace. Each turn selects a provider and model. Each harness keeps its own native session inside that thread: switching providers does not transfer conversation context.

## Current implementation

| Area | Available behavior |
| --- | --- |
| Desktop | One Electron window, acrylic backdrop, custom title bar, resizable inbox, thread tabs, keyboard shortcuts |
| Workspaces | Add folders, rename display names, remove workspace records and their histories while retaining disk files; removal is blocked during active work |
| Inbox | Pinned and active threads, optional Archived section, workspace filtering, cursor loading, virtualized rows; unused draft threads stay out of the inbox |
| Search | Full-text transcript search with workspace filtering, paging, snippets, and navigation to the matching turn |
| Providers | Separate supervised Codex and Claude workers, availability probes, native session resume, editable provider/model catalogs |
| Turn controls | Model, supported reasoning and speed options, harness-specific permissions, Claude Code/Plan mode, stop, and queued follow-ups |
| Conversation | Streaming Markdown, reasoning, commands, tool activity, file changes and inline diffs, approvals, questions, and native fallback events |
| Attachments | Text, images, file references, and skill files through provider-specific input mapping |
| Persistence | SQLite history, queued input, per-harness sessions, worker reconciliation, startup interruption recovery, and migration backups |
| Attention | Per-thread activity and Windows notifications routed to the relevant thread |
| Settings | Dark/light/system themes, transcript size, reduced motion, send shortcut, archived visibility, title-model choice, provider catalogs, and separate subscription usage cards |
| Packaging | Unsigned Windows x64 per-user NSIS installer, including the Claude SDK executable |

See [architecture](architecture.md), [interface design](design.md), and [Claude integration](claude-provider.md) for details.

## Remaining product and engineering work

These are open areas, not a committed delivery schedule.

1. **Continuity:** persist open tabs and unsent drafts; add an explicit interrupted-turn retry/resume workflow. Native session resume already works on a later submission, but failed delivery is never replayed automatically.
2. **Provider completeness:** Codex Plan mode, title rename/lock controls, and further native interaction surfaces. Claude gaps include live steering, MCP authentication/elicitation controls, command discovery, checkpoint rewind, and background-task management.
3. **Large histories:** replace all-page transcript fetching with bounded loading while preserving complete message projection, search navigation, and scroll position.
4. **Change review:** add a touched-file list and dedicated review pane, then annotations that can become an agent submission. Inline transcript diffs already exist.
5. **Workspace tools:** terminal, file browsing, Git branches/worktrees, and a review-to-commit/PR workflow. These require new subsystems; concurrent turns currently share the workspace folder.
6. **Distribution:** certify both providers on clean Windows profiles and introduce installer signing. Additional operating systems are not current release targets.

Further providers, session import/fork, automation, remote workers, mobile access, and an optional daemon remain future directions. Their order needs a product decision; the old competitive analysis is not an approved implementation queue.

## Current boundaries

MeldShell does not install or manage Codex authentication, store application-managed API keys, import external harness sessions, or provide third-party provider plugins. All harnesses, including Claude Code, are discovered from the user's machine; MeldShell does not ship Claude Code.

There is no embedded terminal, file explorer/editor, Git or worktree UI, WSL integration, remote client, cloud synchronization, or listening control-plane service. The application does not coordinate filesystem safety between concurrent agents.

Tabs are temporary renderer state. Full-text search indexes finished-turn projections asynchronously. A virtualized transcript still loads its full selected history. Usage cards expose provider allowances where available; they do not implement spend caps or a policy engine.

## Verification and release goals

The original MVP milestones covered desktop/persistence foundations, a full Codex turn, concurrency/attention, and release hardening. Much of that implementation is present and Claude has since been added. Milestone scope is not proof that every acceptance condition passed.

Live throughput for 50 authenticated turns, a responsive 10,000-thread inbox, and multi-year histories remain scale targets to verify against a release candidate.

Each published candidate must demonstrate provider isolation, durable queues, correct interruption and approval routing, keyboard access, large-history responsiveness, and the clean-profile matrix in [release.md](release.md). Preserve results with the exact artifact hash and tested provider versions.

## Planning history

The [feature-gap analysis](meldShell-hofh-feature-gaps.md) retains the original 2026-09-04 competitive snapshot with a current implementation reconciliation. Its external research inputs are absent from this repository; competitor claims and effort estimates remain historical.
