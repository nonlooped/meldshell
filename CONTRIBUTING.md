# Contributing to MeldShell

Use Node.js 24 or newer. `npm install` downloads Electron and rebuilds SQLite for its ABI; `npm run dev` starts the desktop app. Windows 11 x64 and Linux x64 are the configured packaging targets.

## Choose checks by impact

Follow [AGENTS.md's verification policy](AGENTS.md#verification). Commands live in [package.json](package.json); use an existing targeted test or workspace check when it covers the risk.

Biome handles supported source formatting and linting, including a cognitive-complexity limit of 20. It does not format Markdown or YAML. Generated Codex schemas and lockfiles are excluded. React Compiler diagnostics come from builds.

`check:fast` combines lint, formatting, and workspace typechecks. `check` adds the desktop build and Knip; it does not run `npm test`. Choose these aggregate commands only under the repository verification policy. The [release workflow](.github/workflows/release.yml) runs the full check and tests separately.

Authenticated provider checks can consume account quota. UI and manual verification follow the repository policy; report unverified behavior explicitly.

## Provider changes

Preserve native payloads when mapping canonical events. Process, session, and recovery constraints are in [Architecture](docs/architecture.md); provider-specific behavior is in [Claude](docs/claude-provider.md) and [Cursor](docs/cursor-provider.md).

Regenerate changed Codex app-server schemas with the supported CLI and commit them under `packages/provider-codex/schema`. Consult the CLI's schema-generation help before changing generated files.

For installer work, use the [release checklist](docs/release.md).
