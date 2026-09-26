# Contributing to MeldShell

Use Node.js 24 or newer. `npm install` downloads Electron and rebuilds SQLite for its ABI; `npm run dev` starts the desktop app. Windows 11 x64 and Linux x64 are the configured packaging targets.

The Windows desktop can run natively on Windows or use a Linux host in WSL; switch in Settings → General → Execution environment. Windows development and production builds include that host's payload (other platforms build it only with `MELDSHELL_BUILD_WSL_HOST=1`); its first launch installs the locked Linux runtime dependencies inside WSL. See [Windows and WSL](docs/wsl.md) for prerequisites, data locations, and the bundled-host check.

## Choose checks by impact

Follow [AGENTS.md's verification policy](AGENTS.md#verification). Commands live in [package.json](package.json); use an existing targeted test or workspace check when it covers the risk.

Choose commands from the affected behavior, using exact paths:

| Change | Focused verification |
| --- | --- |
| Markdown documentation | `git diff --check` and review changed links; no build or test |
| Supported source files | `npx --no-install biome check path/to/file.ts path/to/file.tsx` |
| One behavior | `node --import tsx --test path/to/affected.test.ts` (also accepts `.test.mjs` and multiple paths) |
| Core database behavior | `npm run test --workspace=@meldshell/core -- src/affected.spec.ts` |
| Shared renderer types | `npm run typecheck --workspace=@meldshell/ui` |
| Desktop renderer types | `npm run typecheck:web --workspace=@meldshell/desktop` |
| Desktop main/preload types | `npm run typecheck:node --workspace=@meldshell/desktop` |
| Package or service types | `npm run typecheck --workspace=@meldshell/<workspace>` when that workspace defines it |
| Release script | `node --import tsx --test tests/changelog.test.ts tests/release-cli.test.mjs` |

Find relevant tests with `rg --files <affected-directory> tests` and inspect their coverage. Shared contracts may require checks in their consumers. A build is appropriate for bundling, assets, or compiler behavior that tests and typechecks cannot cover; name that risk first. Installer artwork/configuration edits do not require a full candidate certification unless one was requested.

`npm test -- path/to/test.ts` still includes the root script's entire test list; use the direct Node command above to select files. Likewise, appending a path to root `lint` or `format:check` retains their `.` scope. `check:fast` is a repository-wide aggregate despite its name. Stop after the selected checks pass; CI owns the full regression pass.

Biome handles supported source formatting and linting, including a cognitive-complexity limit of 20. It does not format Markdown or YAML. Generated Codex schemas and lockfiles are excluded. React Compiler diagnostics come from builds.

`check:fast` combines lint, formatting, and workspace typechecks. `check` adds the desktop build and Knip; it does not run `npm test`. Choose these aggregate commands only under the repository verification policy. [CI](.github/workflows/ci.yml) selects checks for pull requests and `main` pushes using [the scope planner](scripts/ci-scope.mjs). Workspace changes select their transitive consumers for typechecks and tests, and only affected desktop/site builds run. Static analysis keeps repository scope because Knip checks cross-workspace usage. Windows tests run for desktop/headless dependencies and root/release tests; isolated site or control changes use Linux. Release-workflow edits run release tests without app builds. Documentation changes only run the selector (changelog edits also run release tests). Root dependency/configuration changes and CI planner/workflow edits run all checks. Manual CI runs and reusable release checks always run the full suite. The selector uses the PR merge base or the complete push range, includes deleted and renamed paths, and falls back to all checks if comparison is unavailable.

Authenticated provider checks can consume account quota. UI and manual verification follow the repository policy; report unverified behavior explicitly.

Core tests use `@effect/vitest` and `.spec.ts` filenames. Provide the shared `TestDatabase` layer per test to keep SQLite state isolated. Use `TestClock` for Effect clock behavior; other packages continue to use Node’s test runner. The root `npm test` runs both runners.

`@effect/vitest` currently requires Vitest 3. Its browser mocker has an [upstream advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) whose fix is only available in newer majors. Core tests explicitly use Node with the API and browser modes disabled. Revisit the pin when Effect supports a patched Vitest major.

`electron-vite` 5 requires Vite 7, so the desktop and shared UI use Vite 7 and `@vitejs/plugin-react` 5 until Electron Vite supports Vite 8. `@astrojs/check` currently supports TypeScript through 6, so the workspace uses TypeScript 6. The Node type definitions follow the supported Node 24 runtime.

The shared renderer lives in `packages/ui`. Desktop and the remote site import `@meldshell/ui`; its package owns renderer dependencies. Each app passes its version information to `mount`.

## Provider changes

Preserve native payloads when mapping canonical events. Review process, session, and recovery behavior in the [host](packages/host/src/host.ts) and [contracts](packages/contracts/src/ipc.ts); provider implementations live under [packages](packages).

Regenerate changed Codex app-server schemas with the supported CLI and commit them under `packages/provider-codex/schema`. Consult the CLI's schema-generation help before changing generated files. After updating the JSON schemas, run `npm run generate:protocol --workspace=@meldshell/provider-codex` to regenerate their TypeScript types. `npm run check:protocol --workspace=@meldshell/provider-codex` detects drift without changing files.

## Versions and changelog

Add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) with every user-visible change. Releases are cut automatically: a daily stable release publishes the Unreleased entries, and hourly nightlies publish new commits. See [the release guide](docs/release.md).

For installer work, use the [release checklist](docs/release.md).
