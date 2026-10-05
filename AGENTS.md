# MeldShell agent instructions

MeldShell is a desktop and remote workspace for Codex, Claude Code, Cursor, and Pi. It supervises their native runtimes and keeps conversations durable across provider switches, disconnects, and restarts.

This file is the shared repository guidance for coding agents. Read linked material when the task needs it; the links are entry points, not a startup checklist. Source, manifests, and configuration are authoritative for current implementation and commands.

## Work through completion

An implementation request authorizes the local investigation, edits, and focused checks needed to finish it. Resolve routine choices from the request and existing code. Continue through failures caused by the change rather than stopping at a first draft. Preserve unrelated working-tree changes.

Ask when missing information materially changes scope or correctness; continue independent work while awaiting the answer. Carry forward authorization already given. For an external action that still needs approval, first prepare the concrete result the user can review.

User instructions take precedence over repository guidance and skills. Apply skills only to the requested work and follow the session's delegation policy. If a local instruction prevents completion, name its file, quote the rule, and explain the unresolved decision rather than silently narrowing the task.

## Preserve the product's boundaries

- **Native provider behavior.** Keep original payloads available when deriving shared events or transcript output. Preserve session identity per thread and harness, provider-specific capabilities, and the originating turn's approval routing. A shared UI must not invent support a provider lacks.
- **Durable state.** Keep database writes in the core and orchestration in the host. Storage changes must preserve existing histories, queued input, and session mappings. Recovery must distinguish interrupted work from completed work; avoid resubmitting a turn whose delivery is uncertain.
- **Process isolation.** Provider failures should settle affected work without breaking other providers. Keep the renderer sandboxed, context-isolated, and without Node integration; privileged operations belong behind the typed bridge.
- **Shared clients.** The desktop and remote site use the same renderer. Account for both consumers when changing shared contracts or UI, and keep desktop-only capabilities explicit. Remote operations must retain account, device, and workspace scoping.
- **Execution location.** File paths, Git operations, terminals, and provider processes must refer to the selected host and thread workspace or worktree. Windows UI paths and WSL execution paths are not interchangeable.

## Find the relevant implementation

| When changing | Start here |
| --- | --- |
| Setup, commands, or check selection | [Contributing](CONTRIBUTING.md), especially [checks by impact](CONTRIBUTING.md#choose-checks-by-impact) |
| Host lifecycle, worker supervision, or dispatch | [Host entry point](packages/host/src/host.ts), [provider supervision](packages/host/src/worker-provider.ts), [core client](packages/host/src/core-client.ts) |
| Storage, recovery, or migrations | [Core](packages/core/src), [persistence and startup recovery](packages/core/src/database/persistence.ts), [migrations](packages/core/src/database/migrations.ts) |
| A provider's protocol or session behavior | Its package: [Codex](packages/provider-codex), [Claude](packages/provider-claude), [Cursor](packages/provider-cursor), or [Pi](packages/provider-pi); [shared process runtime](packages/provider-runtime/src) |
| Transcript interpretation or rich output | [Event projections](packages/projection/src), [Markdown renderer](packages/ui/src/ui/Markdown.tsx) |
| UI or desktop integration | [Shared renderer](packages/ui/src), [styles and tokens](packages/ui/src/app/styles.css), [IPC contract](packages/contracts/src/ipc.ts), [desktop preload](apps/desktop/src/preload/index.ts) |
| Remote access, accounts, or relay | [Remote access guide](docs/remote-access.md), [remote contract](packages/contracts/src/remote.ts), [host connection](packages/host/src/remote-connection.ts), [account worker](apps/control/src/index.ts) |
| Windows or WSL execution | [Windows and WSL guide](docs/wsl.md) |
| Releases or installer candidates | [Release guide](docs/release.md) |
| Site, account API, or relay deployment | [Deployment guide](docs/deployment.md), [site configuration](apps/site/wrangler.jsonc), [account worker configuration](apps/control/wrangler.jsonc) |

Use renderer tokens and shared components for visual values. Follow [provider schema regeneration](CONTRIBUTING.md#provider-changes) when changing generated Codex protocols.

For library, framework, SDK, API, CLI, or cloud-service guidance, use Context7: resolve the library ID first unless supplied, then query the relevant concept and version. Use primary documentation if Context7 is unavailable or incomplete, and official OpenAI documentation for OpenAI and Codex. Local refactoring, business logic, and code review need external documentation only when dependency behavior is uncertain.

## Verification

Choose evidence for the behavior being changed. Before running checks, briefly state the risk and the smallest existing check that covers it; use the focused commands in Contributing. Add regression coverage when it can expose the broken behavior. Documentation edits need only a diff and reference review.

Run repository-wide lint, builds, typechecks, suites, or aggregates only when requested or when targeted checks cannot cover the impact; explain the reason first. Batch checks after coherent changes. Once the relevant checks pass, finish unless new changes, failures, or unresolved risks justify another pass.

Visual verification and manual testing belong to the user unless explicitly requested of the agent. Do not launch a browser, Electron, Playwright, screenshots, or a substitute UI harness for verification without that request. Complete the code work first; when visual evidence is necessary, request a specific manual check or screenshot and use the feedback without requesting the same evidence again. Static checks do not establish UI behavior.

Use the release checklist when preparing or certifying an actual release candidate. An installer, release-tooling, or documentation edit alone does not request candidate certification.

Watch, poll, or wait for CI only when the user explicitly asks. A push, PR, or release request does not authorize CI monitoring; provide the available run or workflow link and leave its outcome unverified.

Finish by reporting the result, the checks performed, and remaining failures or verification limits. Do not claim unperformed checks passed.

## Changelog and releases

Include an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for user-visible product changes. Internal refactors, tests, CI, and documentation alone need no entry. Leave released sections and version fields to the scheduled [Release workflow](.github/workflows/release.yml); see the release guide for publishing behavior.
