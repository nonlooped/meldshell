# Agent instructions

## Scope and follow-through

Treat a request to implement, fix, or update something as authorization to finish the relevant local work. Use the conversation and repository to resolve routine choices. Ask only when a missing decision materially changes scope or correctness; continue independent work while waiting.

User instructions take precedence over skill guidelines. Apply skills to the requested task, without adding interviews, reports, redesigns, or approval steps that it does not need. If a local instruction blocks progress, cite its file and exact rule and explain the unresolved issue. Existing authorization carries forward.

Keep unrelated working-tree changes intact. Before an external action that still needs authorization, prepare the concrete result for review.

## Project context

MeldShell supervises external coding harnesses. Preserve provider-native behavior and payloads, durable thread state, and process isolation.

Read documentation by task:

- [Architecture](docs/architecture.md) for process, persistence, and provider changes.
- [Interface design](docs/design.md) for UI changes; existing renderer tokens define exact values.
- [Claude integration](docs/claude-provider.md) for that provider's behavior and limitations.
- [Contributing](CONTRIBUTING.md) for development setup and live-test constraints.
- [Release checklist](docs/release.md) when preparing an installer for release.

The roadmap and feature-gap analysis include historical plans. Check implementation before treating a planned feature as missing or a milestone as verified.

## Verification

Review the diff and use the smallest existing check that covers a concrete risk.

- Documentation-only changes need a diff and reference review, not executable checks.
- Leave visual verification and manual testing to the user unless they explicitly ask the agent to perform it. Do not launch Browser, Chrome, Electron, Playwright, screenshot capture, or standalone UI test harnesses to verify changes without that request, including for layout, navigation, or accessibility risks.
- When visual or interaction evidence is needed, finish the implementation work possible from the code, then ask the user for a screenshot or a short, specific manual check. Use their feedback to continue fixing the issue. Do not build a substitute test environment or repeatedly ask for evidence already provided.
- Routine copy, styling, spacing, icon, or component edits may use targeted static checks and existing unit tests for concrete code risks. These do not replace the user's visual testing; report clearly when UI behavior has not been verified.
- Add tests for meaningful regressions that would fail with the broken behavior. Avoid tests that repeat implementation details or merely prove code runs.
- Run codebase-wide lints, builds, typechecks, suites, or aggregate checks only when requested or when targeted checks cannot cover the impact. State that reason first. Release certification follows its own checklist.
- Batch verification after coherent changes. Once relevant checks pass, finish; repeat or broaden only for new changes, failures, or unresolved risks.
- Report what was checked and any unresolved failure.

## Library documentation

Use Context7 for current library, framework, SDK, API, CLI, or cloud-service documentation when the task depends on their syntax, configuration, migration, or behavior. Resolve the library ID first unless supplied, then query the relevant concept and version. Prefer primary documentation as a fallback when Context7 is unavailable or incomplete. For OpenAI model and Codex guidance, use official OpenAI documentation.

Local refactoring, business-logic debugging, code review, and general programming questions do not require library lookups unless a specific dependency behavior needs verification.

## Communication and delegation

Lead with the result and use concise, plain prose. Include evidence and limitations that affect the conclusion; use lists or tables when they make comparison easier.

Follow the session's delegation policy. When delegation is authorized and useful, give independent tasks clear ownership and integrate their results. A skill must not require extra agents or a fixed agent count for routine work.
