# Competitive planning record

This is a rewrite of the September 4, 2026 feature-gap analysis. It preserves the original candidate IDs and effort bands for historical reference. It is not an approved backlog or a current competitor survey.

Use the [roadmap](roadmap.md) for current implementation and open work. The earlier analysis predated Claude, Cursor, Linux packaging, file/Git controls, split panes, and bounded transcript loading.

## Evidence and category

The original inputs were `/workspace/FEATURE_INVENTORY.md` and `/workspace/harness-of-harnesses-research.md`. Neither is included in this repository. Competitor claims and effort estimates therefore remain unverified historical research.

The analysis compared applications that supervise external coding runtimes: T3 Code, Zeron, MonoCode, Orca, Paseo, Conductor, Nimbalyst, Emdash, AO, Omnigent, Traycer, Claude Squad, and JetBrains Air. It treated IDEs and native coding runtimes as a different category. Recheck primary sources before using any peer's capabilities to justify work.

Its useful product distinction remains ownership: MeldShell supervises external sessions while their harnesses own planning, tools, and execution policy.

## Historical candidates

S meant existing-UI wiring measured in days; M meant a moderate feature measured in weeks; L meant a substantial subsystem; XL meant platform or architectural expansion. These estimates were made against the September 4 implementation and are not current commitments.

| Original ID | Candidate | Historical effort |
| --- | --- | --- |
| 1 | Approval policy controls | S |
| 2 | Collaboration/plan mode controls | S |
| 3 | Restore open tabs | S |
| 4 | Explicit retry/resume for interrupted turns | S |
| 5 | Workspace removal/archive controls | S |
| 6 | User-facing title lock | S |
| 7 | Usage, rate limits, and spend attention | S–M |
| 8 | Dedicated diff/change review | M |
| 9 | Review annotations submitted to an agent | M |
| 10 | Per-thread touched-file map | M |
| 11 | Full-text transcript search | M |
| 12 | Pinning and attention filters | M |
| 13 | Session board view | M |
| 14 | Mid-thread harness switching and context handoff | M |
| 15 | Commit helpers | M |
| 16 | Discover/import existing harness sessions | M |
| 17 | Structured user-input requests | M |
| 18 | Signed Windows installer | M |
| 19 | Provider installation/authentication guidance | M |
| 20 | Second harness, initially Claude Code | L |
| 21 | Worktree isolation | L |
| 22 | Git branch/status UI | L |
| 23 | PR creation, drafts, and merge | L |
| 24 | Embedded terminal | L |
| 25 | Checkpoints, forks, and rollback | L |
| 26 | Additional harnesses, including Cursor | L |
| 27 | Schedules and event-triggered automation | L |
| 28 | Issue-tracker integration | L |
| 29 | Spend caps and escalation policy | L |
| 30 | Additional desktop platforms | XL |
| 31 | Mobile or second-screen client | XL |
| 32 | Local daemon/headless service | XL |
| 33 | SSH or remote workers | XL |
| 34 | Container isolation | XL |
| 35 | Shared live sessions | XL |
| 36 | Embedded browser/design mode | XL |
| 37 | Voice control | XL |
| 38 | Cross-agent orchestration | XL |
| 39 | API/MCP/SDK access to MeldShell controls | L–XL |
| 40 | WSL workspace support | L |

## Reading these candidates now

Several entries are implemented or partially implemented. Approval controls, questions, workspace removal, pinning, search, provider switching, usage cards, Git actions, and three provider integrations are present. Linux is a configured release target. These facts do not establish full completion of broader items such as review annotations, context transfer, platform certification, or workspace isolation.

Inspect the relevant implementation before converting a row into work. [Architecture](architecture.md) describes persistence and process boundaries; [Design](design.md) covers the workbench; provider documents distinguish native capability from exposed controls.

## Historical priorities and exclusions

The original proposed order was approval/mode controls, continuity, workspace/title controls, usage, change review, annotations, commits, a second provider, and worktrees. That order is superseded by subsequent implementation and was never a release certification.

The analysis deferred mobile, remote workers, a daemon, voice, and cross-agent orchestration. It excluded owning the coding-agent loop, selling inference credits, and replacing a full IDE from MeldShell's core role.

Those distinctions do not prohibit a scoped file viewer, Git controls, or orchestration API. Likewise, the original light-theme and Windows-only assumptions are obsolete. A future priority decision should identify the user problem, current implementation gap, dependency, and acceptance evidence instead of inheriting a historical rank.
