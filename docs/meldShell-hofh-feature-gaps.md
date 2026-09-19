# MeldShell Feature-Gap Analysis — Harness-of-Harnesses Category

## Current implementation reconciliation — 2026-09-05

The source review below supersedes the old “MeldShell today” cells and build order for current planning. It does not revalidate competitor research or report new runtime test results. See the [current roadmap](roadmap.md) for open work and [architecture](architecture.md) for implementation limits.

| Original ranks | Current status | Source |
| --- | --- | --- |
| 1 — Approval policy UI | Implemented with harness-specific permission choices | [Composer](../apps/desktop/src/renderer/src/threads/Composer.tsx) |
| 2 — Plan mode | Implemented for Claude; Codex Plan mode is rejected by the core | [Turn dispatch](../packages/core/src/turns.ts) |
| 3 — Saved tabs | Still missing; tabs remain in-memory Zustand state | [Tab store](../apps/desktop/src/renderer/src/app/tab-store.ts) |
| 4 — One-click retry/resume | Still missing as a dedicated UI action; a new submission can resume the native session. Worker failures are not replayed automatically | [Supervisor](../apps/desktop/src/main/runtime/worker-provider.ts) |
| 5 — Workspace removal | Implemented, with display-name editing; removes MeldShell history, retains disk files, and blocks during running work | [Workspace manager](../apps/desktop/src/renderer/src/workspaces/WorkspaceManager.tsx) |
| 6 — Title lock | Internal title-generation locking exists; no user-facing rename/lock control | [Titles](../packages/core/src/titles.ts), [turns](../packages/core/src/turns.ts) |
| 7 — Usage | Codex and Claude subscription cards implemented; spend caps and policy escalation remain absent | [Subscription usage](../apps/desktop/src/renderer/src/settings/SubscriptionUsage.tsx) |
| 8–10 — Review pane, annotations, touched files | Still absent as dedicated workflows; inline diffs and structured tool details exist | [Transcript](../apps/desktop/src/renderer/src/threads/Transcript.tsx) |
| 11 — Full-text search | Implemented using FTS5 over projected finished-turn messages, with workspace filtering and paged results | [Search core](../packages/core/src/search.ts), [search dialog](../apps/desktop/src/renderer/src/threads/SearchDialog.tsx) |
| 12 — Pin/attention filters | Pinning implemented; a dedicated needs-attention filter remains absent | [Inbox](../apps/desktop/src/renderer/src/threads/Inbox.tsx) |
| 14, 20, 26 — Multiple harnesses | Codex and Claude implemented with separate native histories; automatic context handoff and additional harnesses remain absent | [Claude integration](claude-provider.md) |
| 17 — User questions | Implemented, including Claude multiple selections | [Interaction dialog](../apps/desktop/src/renderer/src/threads/InteractionDialog.tsx) |
| 18 — Signed installer | Still unsigned | [Release checklist](release.md) |
| 19 — Onboarding | Provider status/details and refresh controls exist; installation and sign-in remain outside MeldShell | [Provider card](../apps/desktop/src/renderer/src/settings/ProviderCard.tsx) |
| 15–16, 21–25, 27–40 | Git/PR/worktrees, session import/checkpoints, terminal, automation, and remote/platform expansion remain future work | [Roadmap boundaries](roadmap.md#current-boundaries) |

Additional changes outside the old ranking include dark/light/system themes, transcript text size, reduced motion, configurable send shortcuts, and archived-thread visibility. Search includes archived history. The old “light theme” exclusion below is superseded. Transcripts are virtualized but currently load all selected-history pages.

## Historical competitive analysis

> Historical planning snapshot from 2026-09-04. This is not a current backlog or an instruction to implement its recommendations. Its source files under `/workspace` are not included in this repository, so competitor claims cannot be verified from this document alone. Several gaps have since changed, including Claude integration. Check current code and primary sources before using a claim or priority below.

**Product:** MeldShell 0.1.0 MVP (Windows Electron ADE)  
**Date:** 2026-09-04 (Asia/Riyadh)  
**Positioning:** MeldShell is a **harness of harnesses** / orchestrator ADE. It does **not** own the agent loop (planning, tools, sandbox internals). It wraps and supervises external harnesses (today: OpenAI Codex via `codex app-server`).  
**Inputs:** `/workspace/FEATURE_INVENTORY.md`, `/workspace/harness-of-harnesses-research.md`  
**Heavy peers:** T3 Code, Zeron, MonoCode, Orca, Paseo, Conductor, Nimbalyst, Emdash, AO (Agent Orchestrator), Omnigent, Traycer, Claude Squad, JetBrains Air  
**Demoted (category boundary only):** Cursor, Windsurf, Cline, Aider, Goose, Copilot — they own/are harnesses, not BYO multi-harness control planes.

---

## 1. Scope & method

Gaps are judged only against **orchestrator / harness-of-harnesses table stakes** from the research memo (§4), not against single-agent harness or full-IDE checklists.

**Essential** means either:

- Present across most strong orchestrator peers (T3 Code, Zeron, MonoCode, Orca, Paseo, Conductor, Nimbalyst, Emdash, AO, Omnigent, Traycer, Claude Squad, JetBrains Air), or
- Called out in the research as category-defining for multi-harness supervision (multi-harness BYO, concurrent inbox, workspaces, worktree isolation, approvals, notifications, diff review, persistence/resume, provider-neutral UI, git ship path, local-first BYO credentials, increasingly remote/second-screen).

**Near-essential / differentiator** means common among several orchestrators but not universal (automations, daemon/headless, SSH/VPS, kanban boards, checkpoints/rollback, spend/policy caps, embedded terminal density).

**Partial gaps** count when the data model or worker already has a hook but product UI/workflow is missing (e.g. `approval_policy` in `thread_settings` with no control).

**Excluded from “essential”:**

- Features that only make sense if you **own the agent loop** (native MCP tool hosting as the product’s job, internal planner/sandbox, harness token marketplace).
- Full IDE surfaces (LSP suite, debugger, replacing the user’s editor) unless an orchestrator peer treats a thin version as core ADE chrome.
- Competitor claims not sourced in `/workspace/harness-of-harnesses-research.md` — **not invented**.

Effort bands assume the current Electron + Effect + SQLite + React stack:

- **S** — UI wiring / thin glue on existing primitives (days)
- **M** — New UI surface + moderate domain logic (1–2 weeks)
- **L** — Substantial subsystem (weeks+)
- **XL** — Platform expansion, remote/multi-client, multi-month architecture

Primary sort: **least effort → most effort**. Within a band: higher orchestrator-category value first.

---

## 2. What MeldShell already covers well in THIS category

Do not treat these as gaps; several orchestrator peers are thinner or quieter here:

1. **Concurrent session inbox at fleet scale** — Active/Settled sections, activity badges (approval / running / queued / failed / …), search by title/workspace, tabs, Ctrl+P switcher, cursor pagination, 10k-thread target, concurrent turns. Matches the “unified inbox” job of T3 Code, Zeron, Orca, Paseo, MonoCode (tabs), Nimbalyst/AO (board variants).
2. **Crash-resistant local persistence & resume** — SQLite WAL, FK cascades, queued-input restore, running→interrupted on boot, native Codex `thread/resume` via stored `native_thread_id`. Aligns with research table stake #8; rare as a marketed depth claim among peers.
3. **Provider-neutral thread model (architecture)** — Threads are not permanently bound to provider/model; per-turn config (model, effort, speed, sandbox). Same control-plane shape as T3 Code / Orca / Paseo / Omnigent; only Codex is wired today.
4. **Unified approvals + Windows attention routing** — Allow once / session / decline; OS toasts that deep-link the requesting thread. Orchestrator table stakes #5–#6; comparable to T3 supervised modes, Zeron phone approvals, JetBrains Air attention notifications.
5. **Workspace / project binding** — Multi-folder workspaces, inbox filter, last-opened tracking. Table stake #3.
6. **Streaming provider-neutral transcript** — Canonical events (user/assistant/reasoning/plan/command/file-change/tool/approval/usage/error), markdown, inline patch diffs (`@pierre/diffs`), interrupt + queue coalescing. Supports table stake #9 (same surface patterns across harnesses once more adapters exist).
7. **Codex app-server depth** — PATH probe, version gate, auth status, schema-validated JSON-RPC, catalog sync, sandbox modes. Peer parallel: T3 Code documents wrapping `codex app-server`; most peers “run Codex” at varying fidelity.
8. **Local-first BYO credentials** — No token resale; user installs/authenticates Codex themselves. Explicit alignment with T3 Code, Zeron, MonoCode, Orca, Paseo, Omnigent, Claude Squad, Traycer BYOA.
9. **Keyboard-first Windows desktop shell** — Acrylic, custom title bar, sandboxed renderer, Effect workers. Desktop ADE surface shared with T3/Orca/MonoCode/AO/Air; Windows-first is whitespace vs Conductor (Mac) and many macOS-first peers.

---

## 3. Historical gap table (least effort → most effort)

| Rank | Feature | Why essential (which orchestrator peers) | MeldShell today | Effort | Effort rationale | Priority notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Approval policy UI** (`untrusted` / `on-request` / `never`) | HITL gates are table stake #5; T3 Code supervised vs fuller access; Zeron cross-device approve; Orca/Paseo/Conductor/Nimbalyst/Emdash/AO/Omnigent/Traycer/Air all advertise approvals/HITL | Policy stored on `thread_settings` and sent on Codex turns; composer has no control (defaults `on-request`) | **S** | Chip next to existing sandbox control | Highest S-band ROI; closes an obvious partial |
| 2 | **Collaboration / plan mode UI** (`default` / `plan`) | Conductor agent modes / setup scripts; plan-then-act is common orchestrator language; Omnigent contextual policies | `thread_settings.mode` persisted; no UI | **S** | Same chip pattern as sandbox/effort | Cheap completeness for operator control surface |
| 3 | **Persist open tabs across restart** | Session continuity is universal (T3/Zeron/Orca/Paseo/Conductor persistence; MonoCode tabbed sessions) | Tabs in Zustand only; cleared on restart (known limitation) | **S** | Persist tab IDs in SQLite/app settings; restore after snapshot | Operators with many open threads notice every reboot |
| 4 | **One-click resume / retry interrupted turns** | Research table stake #8; Claude Squad attach/detach; Zeron multi-device continue; T3/Orca/Paseo durable sessions | Boot marks running→`interrupted`, restores queue; user must manually restart | **S** | “Resume” on interrupted rows / composer that re-submits or promotes queue | Completes persistence story without new subsystem |
| 5 | **Workspace delete / archive UI** | Conductor archive scripts; Orca/AO worktree & worker lifecycle; fleet hygiene across peers | Add workspace only; cascade-delete exists in schema; no delete UI | **S** | Confirm dialog + existing FK cascade | Hygiene for multi-folder fleets |
| 6 | **Title lock control in UI** | Session naming/rename surfaces in T3/Nimbalyst-class dashboards; agents can rename via harness events | `threads.title_locked` + Codex `thread/name/updated` respect it; not exposed | **S** | Toggle beside editable title | Prevents silent title thrash during fleets |
| 7 | **Surfaced usage / rate-limit / spend attention** | Omnigent contextual policies (spend caps, escalation); high concurrency makes quota visibility operator-critical | Canonical `usage` events + Codex error/willRetry paths; no panel | **S–M** | Aggregate usage events into Settings or inbox footer | Keeps 20–50-thread fleets operable; thinner than full Omnigent policy engine |
| 8 | **Dedicated diff / change review pane** | Near-universal among orchestrators: T3 Code inline diff review; Zeron live branch diffs; Orca/Paseo/Conductor/Nimbalyst/Emdash/AO/Omnigent/Traycer/Air review UIs; Claude Squad partial | Patches render in transcript via `@pierre/diffs`; no file list, review queue, or accept/reject workflow | **M** | Side pane over existing `file-change` events + pierre; no Git required for v1 | Table stake #7; largest M-band category hole |
| 9 | **Review comments / notes → agent turn** | T3/Orca/Air-style review loops; JetBrains Air code-aware review + attention | Operator types freeform in composer only | **M** | Annotations from review pane → `submitTurn` / queue | Multiplies #8; stays orchestrator-side (does not own tools) |
| 10 | **Touched-files / change map per thread** | Complements peer diff dashboards (Nimbalyst red/green diffs; Emdash/AO diff/PR surfaces; Zeron branch diffs) when many sessions share attention | `file-change` / `command` / `tool` events exist; no derived file map | **M** | Derive file set from events; sidebar “Touched files” | Situational awareness before worktrees |
| 11 | **Full-text search across transcripts** | Nimbalyst searchable workspace emphasis; large durable histories in T3/Orca/Paseo-class apps; MeldShell claims 10k-thread capacity | Inbox filter is title/workspace only; no event FTS | **M** | FTS5 on event text or bounded scan API + UI | High value for local-first long retention |
| 12 | **Star / pin / “needs attention” filters** | Attention routing beyond status: Nimbalyst Waiting/Review columns; AO kanban of PR/CI/review; Air notifications when task needs attention | Activity badges + Active/Settled only | **M** | Column + filter chips on existing activity fields | Cheap fleet triage |
| 13 | **Kanban / session board view** | Nimbalyst (In Progress / Waiting / Review); AO PR/CI/review kanban; optional layout over same thread model | List inbox only | **M** | Alternate layout over status/activity | Nice ops surface; lower than diff + multi-harness |
| 14 | **Mid-thread harness/model switch UX** | T3 Code mid-thread model/harness switching; Omnigent compose/swap harnesses; Air agent-agnostic switching; Traycer shared context across providers | Per-turn model already selectable; no guided “continue on X harness” affordance | **M** | UX + optional summary/handoff turn; architecture already neutral | Differentiator once ≥2 harness adapters exist; weak until then |
| 15 | **Commit helpers from reviewed changes** | T3 one-click commit/push/PR (draft, stacked, amend); Orca/Paseo/Conductor/Nimbalyst/Emdash/AO git ship paths; research table stake #10 | No Git UI; CLI only | **M** | Thin `git status`/`add`/`commit` wrappers tied to review pane | Bridge to PR without full Git client |
| 16 | **Attach / discover existing harness sessions** | Zeron steers the *same* session across devices; Claude Squad manages live tmux sessions; orchestrators generally assume BYO CLIs already running | Resume only for MeldShell-created `native_thread_id`s; import explicitly excluded in MVP | **M** | Enumerate Codex (then Claude) session stores / attach by ID | Strategic for “control plane” claim vs greenfield-only inbox |
| 17 | **Harness user-input request UI** (multi-question prompts) | Completeness of HITL beyond binary approvals as Codex (and later Claude) protocols expand; peers surface richer gates (Omnigent escalation; Zeron approve flows) | Schema for `item/tool/requestUserInput`; not actively used | **M** | Dialog on existing approval/notification routing | Protocol completeness; not inventing a new product category |
| 18 | **Signed Windows installer** | Desktop distribution trust for Windows users; peers ship polished installers (T3/Orca/MonoCode/Air) | Unsigned NSIS; SmartScreen warnings | **M** | Cert + electron-builder signing (ops > product code) | Adoption friction for Windows-first positioning |
| 19 | **Thin provider install / auth guidance** | T3/MonoCode/Orca expect install+auth of each harness first; MeldShell already probes `missing`/`unauthenticated`/`outdated` | Status only; install/auth management explicitly excluded | **M** | Guided links + refresh probe; do not own secrets | Reduces onboarding drop-off; keep thin |
| 20 | **Second harness adapter (Claude Code first)** | **Universal** table stake #1 — every primary peer drives ≥2 harnesses (T3: Claude/Codex/Cursor/Grok/OpenCode/…; Zeron: Claude/Codex/Cursor/Grok/Hermes; MonoCode wide list; Orca/Paseo/Conductor/Nimbalyst/Emdash/AO/Omnigent/Traycer/Claude Squad/Air all multi-harness) | Codex only; roadmap “one provider at a time at full fidelity” | **L** | New worker boundary mirroring `provider-codex` (no generic adapter yet) | **Category-defining gap**; architecture claims neutrality the market cannot see yet |
| 21 | **Git worktree (or equivalent) isolation** | Strongest isolation table stake (#4): T3 per-thread worktrees; Orca parallel worktrees; Conductor isolated Mac workspaces; Nimbalyst/Paseo optional worktrees; Emdash/AO/Claude Squad/Air worktrees; Zeron emphasizes branch diffs/history | No worktrees; concurrent agents share folder; **no** app-managed FS safety (explicit exclusion) | **L** | Create/list/remove worktrees; bind thread `cwd`; cleanup/archive | Highest strategic L after multi-harness; unlocks safe fleet concurrency on one repo |
| 22 | **Git branch status UI** | Bundled with ADE Git surfaces on T3/Orca/Conductor/Emdash/AO/Nimbalyst | None | **L** | Status/branch switch/log in workspace chrome | Clarity prerequisite for worktrees + ship path |
| 23 | **PR create / draft / merge workflow** | T3 draft/stacked/amend PR; Orca/Paseo/Conductor/Emdash/AO GitHub PR paths; research table stake #10 | None | **L** | `gh`/`git push` + PR metadata after commits/worktrees | Closes review→ship loop peers advertise |
| 24 | **Embedded terminal pane** | T3 integrated terminal; Orca WebGL terminals; AO Chat vs Terminal UI drivers; Claude Squad is terminal-native; Emdash tmux for long-lived sessions | Explicitly missing (Post-MVP Track 2) | **L** | node-pty ConPTY + xterm.js per thread/workspace | Common ADE chrome among desktop orchestrators; not listed as universal table stake but frequently paired with BYO CLIs |
| 25 | **Conversation checkpoints / fork / rollback** | Conductor checkpoints/rollback cited in roundups; strong trust differentiator, not universal | Explicitly excluded; no fork/rollback UI | **L** | Snapshot transcript + cwd marker; restore or fork thread | Trust for long runs; chase after worktrees |
| 26 | **Third+ harness adapters** (OpenCode, Cursor CLI, Gemini CLI, …) | MonoCode/Orca/Emdash/AO/Paseo advertise long harness lists; Omnigent meta-harness + YAML custom agents; Air ACP for more | Single adapter | **L** | Repeat adapter pattern; optional ACP later | Expand after Claude+Codex fidelity bar is real |
| 27 | **Automations / schedules / Hub triggers** | Emdash scheduled automations; Orca automations; Paseo Hub (GitHub/Slack/Discord) marketing; AO CI feedback loops; Jean “Mr. Robot” sweeps — research **differentiator**, not universal table stake | None | **L** | Timer/webhook/agent-finished triggers over `submitTurn` | Overnight fleet jobs; after core supervision solid |
| 28 | **Issue integrations (Linear / GitHub / Jira)** | Conductor Linear/GitHub; Orca GitHub & Linear; Emdash issue integrations; AO review/merge feedback | None | **L** | Deep links + spawn-thread-from-issue | Useful; don’t make tracker the primary UX |
| 29 | **Policy engine (spend caps, escalation rules)** | Omnigent contextual policies; Traycer freemium sync/credits adjacent | Approval policy field only | **L** | Rules layer over approvals + usage events | Differentiator; after multi-harness + usage surfacing |
| 30 | **Cross-platform desktop (macOS / Linux)** | Almost all desktop peers (T3/Zeron/MonoCode/Orca/Paseo/Nimbalyst/Emdash/AO/Omnigent/Traycer); Conductor Mac-only is called out as a limitation; Air Windows lagged at launch | Windows 11 x64 only | **XL** | electron-builder targets + path/pty abstractions + QA matrix | Reach play; don’t block Windows depth that is current whitespace |
| 31 | **Mobile / second-screen client** | Research table stake #12 “increasingly”: T3 web/iOS/Android; Zeron core pitch (desk→phone approvals); Orca iOS/Android; Paseo full mobile parity claim; Nimbalyst iOS; Omnigent mobile-friendly remote; Conductor mobile soon (Pro); Traycer paid sync | Post-MVP Track 5 only; no listening service by design | **XL** | Companion or authenticated remote UI | Fleet monitoring; requires security design vs local-only MVP |
| 32 | **Local daemon / headless control plane** | Paseo daemon-first; Zeron always-on engine/VPS; Orca serve/VPS; Emdash/AO/Omnigent server+runner or daemon splits; Jean headless server | Electron app only | **XL** | Split core into optional daemon + thin clients | Enables #31 and CI; architectural fork |
| 33 | **SSH / VPS / remote workers** | Orca VPS/SSH worktrees; Emdash remote SSH; Paseo Docker/headless; Omnigent server+runner; Air cloud execution preview | Local Windows only | **XL** | Remote runtime + path mapping + auth | Scale path after local worktrees/terminal |
| 34 | **Docker / container isolation** | JetBrains Air Docker **or** worktrees | None | **XL** | Container lifecycle on Windows | Optional alternative to worktrees — not required if worktrees ship |
| 35 | **Multiplayer / shared live sessions** | Conductor Pro multiplayer; Omnigent shareable live sessions | Single-operator local | **XL** | Presence + shared thread ACLs | Teams tier; after daemon |
| 36 | **Embedded browser / design mode** | Orca embedded browser / design mode; Emdash in-app browser | None | **XL** | Chromium view per worktree | Powerful but dilutive vs concurrency niche — see §4 |
| 37 | **Voice control** | Paseo voice (sourced) | None | **XL** | Speech → composer | Differentiator only; not table stake |
| 38 | **Agent-to-agent / meta-agent loops** | Traycer agent-to-agent; Omnigent Polly/Debby built-in multi-AI; AO plans/spawns workers | Isolated threads only | **XL** | Cross-thread bus + orchestration UI | After solid single-thread supervision + worktrees; easy to over-scope into owning a loop |
| 39 | **Plugin / MCP-SDK so agents drive the orchestrator** | Paseo plugins + MCP/CLI/SDK automation; Superset MCP spawn (optional peer); research lists MCP/SDK as **differentiator**, not universal table stake | Not shipped | **L–XL** | Host orchestration API/MCP for *control-plane* actions (spawn thread, approve) — do **not** become the coding-agent MCP host | Distinct from harness-owned tool MCP; keep scope tight |
| 40 | **WSL workspace support** | Windows power-user path; not a peer table stake but relevant to Windows-first claim | Win32 paths only; WSL excluded | **L** | Path translation + harness cwd in WSL | After ConPTY terminal; Windows-specific depth |

**Gap count in table:** **40** (including partials and near-essentials with peer evidence from the HofH research).

---

## 4. Non-gaps / don’t chase

Features that look competitive only if you mis-categorize MeldShell as an IDE harness or as the owner of the agent loop:

| Feature | Who has it (or adjacent) | Why not chase (for now) |
| --- | --- | --- |
| **Owning the agent loop** (planner, tool runner, sandbox internals) | Cursor, Windsurf, Cline, Aider, Goose, Copilot, OpenHands | Explicit anti-positioning; MeldShell wraps those runtimes |
| **MCP-as-product-table-stake** (hosting coding tools via MCP) | Common in *harnesses* (Cline/Goose/Cursor-class); orchestrators may forward or expose control-plane MCP (Paseo) | Old analysis overweighted this; chase only as thin orchestrator automation API (#39), not as “become Cline” |
| **Full IDE replacement** (LSP, debugger, primary editor) | Cursor, Windsurf, JetBrains IDEs; Air sits *beside* IDE intentionally | MeldShell is a workbench/control plane beside the editor |
| **Heavy Monaco / visual planning suite** (WYSIWYG plans, mockups, Excalidraw-class) | Nimbalyst emphasis | Planning IDE dilution; operators already have docs tools |
| **Token resale / hosted inference credits** | Many IDE vendors; Traycer paid credits adjacent | Conflicts with T3/Orca/MonoCode-style BYO local-first |
| **tmux-only UX** | Claude Squad | Complementary segment; Electron ADE already chosen |
| **Design-mode browser as MVP** | Orca | High cost; niche for frontend agents — XL defer |
| **Issue-tracker-as-primary UX** | Conductor/Orca/Emdash integrations | Integrations later; don’t make Linear the hub |
| **Proprietary commander LLM that owns routing** | Orkas (borderline peer — owns a commander loop) | Pulls product back into “owns the loop” |
| **Maestro-style MCP that turns Claude Code into a conductor** | Maestro (`kmeng/maestro`) — research demotes | Different architecture; not a desktop session inbox ADE |
| **MCO fan-out CLI** | `mco-org/mco` — research demotes | Invoked *by* agents; not an orchestrator ADE |
| **Light/chroma theme packs** | Most IDEs | Brand is monochrome Windows acrylic |
| **Listening local network service in MVP** | Paseo/Zeron remote paths | Security + scope; pair only with deliberate daemon/mobile XL track |
| **App-managed concurrent FS locking without isolation** | — (correctly excluded) | Wrong primitive; **worktrees** are the peer solution |
| **Racing Conductor on macOS-first polish first** | Conductor | Whitespace is Windows-first depth |

---

## 5. Historical recommended build order (superseded)

Several entries in this original sequence are now implemented. Use the reconciliation at the top and the [current roadmap](roadmap.md#remaining-product-and-engineering-work); do not restart completed work from this list.

Pragmatic sequence: finish S-band control-plane hygiene, land the review ship path, then the two L items that define the category.

1. **Approval policy UI** — expose existing setting (S).
2. **Plan/collaboration mode UI** — expose existing setting (S).
3. **Persist tabs + one-click resume interrupted turns** — finish crash/continuity UX (S).
4. **Workspace delete + title lock** — fleet hygiene (S).
5. **Usage / rate-limit surfacing** — keep fleets operable (S–M).
6. **Dedicated diff review pane** — match T3/Zeron/Orca/Conductor/Air/Nimbalyst review bottleneck (M).
7. **Review notes → queued agent turn** — close orchestrator-side review loop (M).
8. **Commit helpers** (then PR once branches/worktrees exist) — table stake #10 (M→L).
9. **Second harness adapter: Claude Code** — make “harness of harnesses” true in-product (L).
10. **Git worktrees bound to threads** — isolation table stake #4 (L); unlocks safe parallelism, then PR workflow, attach/discover, terminal, and remote/daemon XL tracks.

**Defer intentionally:** mobile/daemon/SSH (XL) until local multi-harness + worktrees + review/ship are credible; embedded browser; voice; agent-to-agent meta-loops; Omnigent-depth policy engine; cross-platform until Windows depth matches Conductor-class polish on the reverse OS; harness-owned MCP hosting.

---

## 6. Appendix — Old analysis mistakes to discard

From `/workspace/meldShell-feature-gaps.md` and inventory “category peers” notes — **do not reuse**:

1. **Wrong peer set** — Weighting Cursor, Windsurf, Cline, Aider, Goose, Copilot, VS Code Agent Sessions, OpenHands Agent Canvas as primary comps. Those **own or are** harnesses/IDEs. Mention only to draw the category boundary.
2. **Maestro as a heavy peer** — Research demotes Maestro: MCP that turns *Claude Code* into a conductor over workers; not a BYO multi-harness desktop/web inbox ADE.
3. **MCP as universal ADE table stake** — Inflated by harness-world norms. For a harness-of-harnesses, coding-tool MCP is usually **harness-owned**; orchestrator-relevant MCP/SDK is optional automation of the *control plane* (Paseo-style), not a day-one parity checkbox.
4. **IDE table stakes smuggled in** — Treating Monaco editor, design-mode browser, full file IDE, or “replace the editor” as essential. JetBrains Air’s own pitch is orchestration **beside** the IDE.
5. **Inventory competitive notes still list IDE peers** — `FEATURE_INVENTORY.md` §Competitive Positioning still names Cursor/Windsurf/Copilot/Aider/Continue; supersede that framing with T3 Code, Zeron, MonoCode, Orca, Paseo, Conductor, Nimbalyst, Emdash, AO, Omnigent, Traycer, Claude Squad, JetBrains Air.
6. **Underweighting multi-harness BYO** — Old build order put terminal/worktrees ahead of a second harness in spirit of “ADE surfaces.” In the correct category, **≥2 external harness adapters** is table stake #1; a single-Codex inbox is a strong *Codex client*, not yet a harness of harnesses.
7. **Overweighting harness-only UX patterns** — Cline Plan/Act, Cursor checkpoints, Goose MCP counts, etc. as primary justification. Prefer T3 mid-thread harness switch, Zeron multi-device approve, Orca/Conductor worktrees+PR, Nimbalyst/AO boards, Omnigent policies, Paseo daemon/mobile parity.

### Quick map — orchestrator table stakes (§4 research) vs MeldShell 0.1.0

| Table stake | MeldShell 0.1.0 |
| --- | --- |
| Multi-harness BYO adapters | **Missing** (Codex only) — architecture ready |
| Concurrent session inbox | **Strong** |
| Workspace / project binding | **Strong** |
| Worktree / isolation | **Missing** |
| Unified approvals / HITL | **Strong** (policy UI partial) |
| Notifications / attention states | **Strong** |
| Diff / change review | **Partial** (transcript only) |
| Persistence & resume | **Strong** (own sessions); attach/import weak |
| Provider-neutral thread UI | **Strong** (one harness wired) |
| Git ship path (commit/PR) | **Missing** |
| Local-first BYO credentials | **Strong** |
| Remote / second-screen client | **Missing** |

---

*Generated for harness-of-harnesses competitive planning. Competitor features cited only where sourced in `/workspace/harness-of-harnesses-research.md`; unknowns were not invented.*
