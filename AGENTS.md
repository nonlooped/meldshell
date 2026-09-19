# Working in MeldShell

MeldShell supervises Codex, Claude Code, and Cursor in separate processes. Preserve native provider payloads and session behavior, durable thread state, and renderer isolation.

## Scope and completion

An implementation request authorizes the relevant local work through completion. Resolve routine choices from the conversation and source. Ask when a missing decision changes scope or correctness, and continue independent work while waiting. Preserve unrelated working-tree changes.

User instructions take precedence over skills. Keep skills within the requested task and follow the session's delegation policy. Existing authorization carries forward. Prepare a concrete result before requesting any still-needed authorization for an external action. If a local rule blocks progress, cite its file and exact rule and explain the unresolved issue.

## Read by task

- [Architecture](docs/architecture.md): process boundaries, IPC, persistence, recovery, or provider integration.
- [Claude](docs/claude-provider.md) and [Cursor](docs/cursor-provider.md): the selected provider's protocol, permissions, sessions, and limitations.
- [Design](docs/design.md): desktop UI changes. Renderer tokens and shared components own exact values.
- [Transcript rendering](docs/markdown-rendering.md): Markdown, file references, diagrams, math, or rich output.
- [Contributing](CONTRIBUTING.md): setup, check selection, or schema regeneration.
- [Release](docs/release.md): installer preparation and candidate certification.
- [Website](docs/website.md): site builds and deployment.
- [Documentation maintenance](docs/agent-documentation.md): changes to instructions, skills, or documentation.

[Roadmap](docs/roadmap.md) describes open product work. The competitive analysis and release records are dated evidence, not implementation instructions or certification of this checkout.

## Verification

Use the smallest existing check that covers the change's concrete risk. Documentation changes need a diff and reference review only. Add regression tests when they can expose the broken behavior.

Visual verification and manual testing belong to the user unless explicitly requested of the agent. Do not launch a browser, Electron, Playwright, screenshots, or a substitute UI harness for verification without that request. Finish code work first; if visual evidence is needed, request a specific manual check or screenshot and use the feedback without asking for the same evidence again. Targeted static checks do not certify UI behavior.

Run repository-wide lint, builds, typechecks, suites, or aggregate checks only when requested or when targeted checks cannot cover the impact; state the reason first. Release certification follows its checklist. Batch checks after coherent changes, then finish once relevant checks pass. Repeat only for new changes, failures, or unresolved risks.

Report what changed, what was checked, and any remaining failure or verification limit.

## Dependency documentation

Use Context7 when correctness depends on a library, framework, SDK, API, CLI, or cloud service's current behavior. Resolve its library ID first unless supplied, then query the relevant concept and version. Use primary documentation if Context7 is unavailable or incomplete, and official OpenAI documentation for OpenAI and Codex guidance.

Local refactoring, business logic, and code review need no external lookup unless a dependency behavior is uncertain.
