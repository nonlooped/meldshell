# Contributing to MeldShell

Use Node.js 24 or newer. `npm install` downloads Electron and rebuilds SQLite for its ABI; `npm run dev` starts the desktop app. Windows 11 x64 and Linux x64 are the configured packaging targets.

## Choose checks by impact

Follow [AGENTS.md's verification policy](AGENTS.md#verification). Commands live in [package.json](package.json); use an existing targeted test or workspace check when it covers the risk.

Choose commands from the affected behavior, using exact paths:

| Change | Focused verification |
| --- | --- |
| Markdown documentation | `git diff --check` and review changed links; no build or test |
| Supported source files | `npx --no-install biome check path/to/file.ts path/to/file.tsx` |
| One behavior | `node --import tsx --test path/to/affected.test.ts` (also accepts `.test.mjs` and multiple paths) |
| Desktop renderer types | `npm run typecheck:web --workspace=@meldshell/desktop` |
| Desktop main/preload types | `npm run typecheck:node --workspace=@meldshell/desktop` |
| Package or service types | `npm run typecheck --workspace=@meldshell/<workspace>` when that workspace defines it |
| Release script | `node --import tsx --test tests/changelog.test.ts tests/release-cli.test.mjs` |

Find relevant tests with `rg --files <affected-directory> tests` and inspect their coverage. Shared contracts may require checks in their consumers. A build is appropriate for bundling, assets, or compiler behavior that tests and typechecks cannot cover; name that risk first. Installer artwork/configuration edits do not require a full candidate certification unless one was requested.

`npm test -- path/to/test.ts` still includes the root script's entire test list; use the direct Node command above to select files. Likewise, appending a path to root `lint` or `format:check` retains their `.` scope. `check:fast` is a repository-wide aggregate despite its name. Stop after the selected checks pass; CI owns the full regression pass.

Biome handles supported source formatting and linting, including a cognitive-complexity limit of 20. It does not format Markdown or YAML. Generated Codex schemas and lockfiles are excluded. React Compiler diagnostics come from builds.

`check:fast` combines lint, formatting, and workspace typechecks. `check` adds the desktop build and Knip; it does not run `npm test`. Choose these aggregate commands only under the repository verification policy. [CI](.github/workflows/ci.yml) runs all of them, plus tests on Windows, for every pull request and `main` push.

Authenticated provider checks can consume account quota. UI and manual verification follow the repository policy; report unverified behavior explicitly.

## Provider changes

Preserve native payloads when mapping canonical events. Review process, session, and recovery behavior in the [host](packages/host/src/host.ts) and [contracts](packages/contracts/src/ipc.ts); provider implementations live under [packages](packages).

Regenerate changed Codex app-server schemas with the supported CLI and commit them under `packages/provider-codex/schema`. Consult the CLI's schema-generation help before changing generated files.

## Versions and changelog

Add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) with every user-visible change. Releases are cut automatically: a daily stable release publishes the Unreleased entries, and hourly nightlies publish new commits. See [the release guide](docs/release.md).

For installer work, use the [release checklist](docs/release.md).
