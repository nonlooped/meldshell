# Working in MeldShell

MeldShell supervises Codex, Claude Code, and Cursor in separate processes. Preserve native provider payloads and session behavior, durable thread state, and renderer isolation.

## Scope and completion

An implementation request authorizes the relevant local work through completion. Resolve routine choices from the conversation and source. Ask when a missing decision changes scope or correctness, and continue independent work while waiting. Preserve unrelated working-tree changes.

User instructions take precedence over skills. Keep skills within the requested task and follow the session's delegation policy. Existing authorization carries forward. Prepare a concrete result before requesting any still-needed authorization for an external action. If a local rule blocks progress, cite its file and exact rule and explain the unresolved issue.

## Read by task

- [Host and contracts](packages/host/src/host.ts) and [IPC](packages/contracts/src/ipc.ts): process boundaries, persistence, recovery, and provider integration.
- [Provider implementations](packages): the selected provider's protocol, permissions, sessions, and limitations.
- [Renderer styles](apps/desktop/src/renderer/src/app/styles.css): desktop UI changes. Renderer tokens and shared components own exact values.
- [Markdown renderer](apps/desktop/src/renderer/src/ui/Markdown.tsx): Markdown, file references, diagrams, math, or rich output.
- [Contributing](CONTRIBUTING.md): setup, check selection, or schema regeneration.
- [Release](docs/release.md): versioning, changelog entries, installer preparation, and candidate certification.
- [Site deployment configuration](apps/site/wrangler.jsonc) and [account worker configuration](apps/control/wrangler.jsonc): Cloudflare Pages, Worker, D1, and relay setup.
- [Remote contracts](packages/contracts/src/remote.ts) and [account worker](apps/control/src/index.ts): accounts, relay, device linking, and headless hosts.

## Verification

Before running checks, choose the smallest existing check that covers the change's concrete risk and state that scope in one sentence. Use the [focused command examples](CONTRIBUTING.md#choose-checks-by-impact). Documentation changes need a diff and reference review only. Add regression tests when they can expose the broken behavior.

Visual verification and manual testing belong to the user unless explicitly requested of the agent. Do not launch a browser, Electron, Playwright, screenshots, or a substitute UI harness for verification without that request. Finish code work first; if visual evidence is needed, request a specific manual check or screenshot and use the feedback without asking for the same evidence again. Targeted static checks do not certify UI behavior.

Run repository-wide lint, builds, typechecks, suites, or aggregate checks only when requested or when targeted checks cannot cover the impact; state the reason first. Editing installer configuration, release tooling, or documentation does not itself request candidate certification. Run the release checklist only when preparing or certifying an actual release candidate. Batch checks after coherent changes, then finish once relevant checks pass. Repeat only for new changes, failures, or unresolved risks.

Do not watch, poll, or wait for CI or GitHub Actions runs unless the user explicitly asks. Pushing changes, opening a PR, or cutting a release does not authorize CI monitoring. Report the available run or workflow link and finish without waiting; leave the CI outcome unverified unless it was actually checked at the user's request.

Report what changed, what was checked, and any remaining failure or verification limit.

## Changelog

A user-visible change adds an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) in the same change. Do not edit released sections or version fields by hand; `npm run release` does that.

## Dependency documentation

Use Context7 when correctness depends on a library, framework, SDK, API, CLI, or cloud service's current behavior. Resolve its library ID first unless supplied, then query the relevant concept and version. Use primary documentation if Context7 is unavailable or incomplete, and official OpenAI documentation for OpenAI and Codex guidance.

Local refactoring, business logic, and code review need no external lookup unless a dependency behavior is uncertain.
