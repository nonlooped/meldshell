# Contributing to MeldShell

MeldShell targets Windows 11 x64 and requires Node.js 24 or newer. Install dependencies with `npm install`; this also downloads Electron and rebuilds SQLite for Electron's ABI.

Before opening a change, review the diff and choose the smallest existing check that covers the affected behavior. Follow the [verification rules](AGENTS.md#verification); full builds are not required for routine changes.

Use `npm run lint` for Biome's desktop and package lint checks, `npm run format` to format supported files, and `npm run format:check` to check formatting. The root `biome.json` preserves the previous formatting preferences and excludes generated Codex schemas and lockfiles. Markdown and YAML are not formatted by Biome. React Compiler diagnostics still come from the compiler during builds; Biome does not replace every React ESLint rule.

Functions with a cognitive complexity score above 20 fail lint through `noExcessiveCognitiveComplexity`.

`npm run check:fast` runs lint, formatting, and workspace typechecks. `npm run check` also builds the desktop bundles and checks unused dependencies and exports with Knip. Use the full check for changes spanning package or process boundaries.

Validate UI interactions and authenticated provider behavior manually when needed. Provider requests can consume account quota.

Keep provider-native payloads intact when adding canonical event mappings. New app-server schemas must be regenerated with the supported Codex CLI and committed under `packages/provider-codex/schema`.

Agent contributors start with [AGENTS.md](AGENTS.md). When changing skills or rules, follow the ownership and review notes in [agent documentation maintenance](docs/agent-documentation.md).
