# Contributing to MeldShell

Use this guide to set up development, choose checks, or change a provider integration. Repository boundaries and agent behavior live in [AGENTS.md](AGENTS.md); packaging and deployment have their own guides.

## Run from source

Use the Node and npm versions supported by the root [package.json](package.json). The project currently targets Node 24 or newer. From the repository root:

```sh
npm install
npm run dev
```

Installation downloads Electron and prepares the terminal addon. SQLite comes from the Node runtime; there is no separate SQLite addon to rebuild. Development starts the actual desktop and can discover your installed provider CLIs. Use a separate `MELDSHELL_DATA_DIR` when experimenting with application data.

Choose the entry point for the work:

| Work | Entry point |
| --- | --- |
| Desktop app | `npm run dev` |
| Desktop, account worker, and remote site together | `npm run dev:all` |
| Headless host, account worker, and remote site together | `npm run dev:host` |
| Site by itself | `npm run dev --workspace=@meldshell/site` |
| Windows app with Linux tools | [Windows and WSL](docs/wsl.md) |
| Account configuration and deployment | [Remote services](docs/deployment.md) |

The combined development commands serve the dashboard at `http://localhost:4321/dashboard`. Real sign-in needs the local account configuration described in the deployment guide. The headless development command shares the development desktop's data directory by default; close the desktop first or select a separate `MELDSHELL_DATA_DIR`.

## Choose checks by impact

Select checks for the changed behavior under the [repository verification policy](AGENTS.md#verification). These are alternatives, not a checklist for every edit.

| Evidence needed | Focused command |
| --- | --- |
| Documentation diff | `git diff --check -- path/to/document.md`, then review links and claims |
| Supported source formatting and lint rules | `npx --no-install biome check path/to/file.ts path/to/file.tsx` |
| A Node test | `node --import tsx --test tests/settings.test.ts` (substitute the relevant test file) |
| Shared renderer types | `npm run typecheck --workspace=@meldshell/ui` |
| Desktop main and preload types | `npm run typecheck:node --workspace=@meldshell/desktop` |
| Desktop renderer types | `npm run typecheck:web --workspace=@meldshell/desktop` |
| Another workspace's types | Its `typecheck` script, if defined in that workspace's manifest |
| Journey discovery or types | `npm run test:e2e:list` or `npm run typecheck:e2e` |
| Desktop or account integration | Select the relevant target in the [journey guide](tests/e2e/README.md) |
| Release tooling | `node --import tsx --test tests/changelog.test.ts tests/release-cli.test.mjs` |

Find candidate tests with `rg --files tests packages` and inspect what they exercise. Shared contract changes can affect more than one consumer. Builds provide evidence for bundling, assets, and compiler behavior that a typecheck alone cannot cover.

Commands have different scopes:

- Root `lint` and `format:check` include `.`; appending a filename does not narrow them. Direct Biome invocations avoid that trap. [biome.json](biome.json) defines supported paths and exclusions.
- `test:tooling` is an aggregate of Node tests covering application behavior as well as release and CI tooling. Its current file list is in [package.json](package.json).
- `npm test` runs the application journeys. It is separate from the Node tests.
- `check:fast` runs repository-wide lint, formatting, and workspace typechecks. `check` adds Knip and the desktop build. Neither runs the journeys.

[CI](.github/workflows/ci.yml) uses the [scope planner](scripts/ci-scope.mjs) to select affected PR checks. Main pushes and manual CI runs use full coverage. Consult those files when changing selection behavior instead of maintaining another copy of the selection rules here.

## Provider changes

Keep provider-specific protocol handling in its provider package and shared presentation in [projection](packages/projection/src). Session ownership, approval routing, and failure recovery cross the [host](packages/host/src/worker-provider.ts) and [core](packages/core/src/turns.ts). Preserve the boundaries in AGENTS.md when changing those paths.

Codex protocol updates have a generated-file dependency:

1. Export the required app-server JSON schemas with the supported Codex CLI into [schema](packages/provider-codex/schema). Check the installed CLI's schema-generation help and current official documentation for its options.
2. Run `npm run generate:protocol --workspace=@meldshell/provider-codex` to regenerate the declarations from those schemas.
3. Use `npm run check:protocol --workspace=@meldshell/provider-codex` to detect drift. Include both schema and declaration changes in the diff.

The [generator](packages/provider-codex/scripts/generate-protocol.mjs) defines the schema set. Updating a generated declaration alone loses the change on regeneration.

## Shared UI and dependencies

Desktop and the remote site import [@meldshell/ui](packages/ui/package.json). Put shared renderer dependencies there and account for both clients when changing shared components. Runtime dependencies needed by the WSL payload also appear in [apps/host/runtime](apps/host/runtime); its manifest and lockfile must match the installed versions used by the payload build.

Use manifests and the lockfile for current versions. Check current dependency documentation when compatibility matters; historical upgrade explanations are not a compatibility guarantee.

For a user-visible change, follow the [changelog rule](AGENTS.md#changelog-and-releases). For an actual release or installer candidate, use [Releasing MeldShell](docs/release.md).
