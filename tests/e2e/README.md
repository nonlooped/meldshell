# Application journeys

Use these tests for behavior that crosses the UI, IPC, host, storage, or account-service boundaries. Small logic regressions can use the existing Node tests instead; see [check selection](../../CONTRIBUTING.md#choose-checks-by-impact).

The suite uses the `e2e` runner with two custom engines. [e2e.config.ts](../../e2e.config.ts) owns discovery, targets, concurrency, deadlines, and reporters.

## Select a target

| Target | What runs | Prerequisites |
| --- | --- | --- |
| `electron` | The built desktop, real preload bridge, workers, SQLite database, and shell processes | Development install, Git, desktop build, and a display with Electron's system libraries |
| `control` | The account Worker with local D1 and Durable Objects | Development install; no desktop build or display |

For a desktop journey:

```sh
npm run build
npm test -- tests/e2e/journeys.e2e.ts --target electron
```

For account API journeys:

```sh
npm test -- tests/e2e/remote.e2e.ts --target control
```

On headless Linux, prefix the desktop test command with `xvfb-run --auto-servernum`. [CI](../../.github/workflows/ci.yml) is the reference for platform preparation. Agent execution of desktop tests follows [AGENTS.md](../../AGENTS.md#verification).

To inspect the suite without launching either target:

```sh
npm run test:e2e:list
npm run typecheck:e2e
```

`npm test` selects the whole journey suite. `npm run test:tooling` selects the separate aggregate of Node tests listed in the root manifest.

## Isolation and coverage

The [desktop engine](desktop.ts) creates a temporary Git workspace, app profile, and database for each attempt. Restarts inside an attempt retain those directories so tests can verify persistence. Teardown closes Electron and removes the fixture. Playwright drives Electron inside this engine; the renderer uses the real preload API.

The [control engine](control.ts) starts Wrangler's local test harness, applies committed D1 migrations, and seeds an offline account session. It does not require production credentials or an OAuth login. HTTP steps record method and path without logging credentials or request bodies.

[Desktop journeys](journeys.e2e.ts) cover workspace and thread lifecycle, settings and themes, onboarding, files and search, worktrees, model settings, terminals, schedules, and detached thread windows. [Account journeys](remote.e2e.ts) cover device registration, naming and revocation, rejected mutations, and sign-out. Read the test assertions for the exact coverage; passing a journey does not certify every feature in its area.

The journeys do not submit model turns. Desktop startup can still probe locally installed providers, so these fixtures are not a sandbox for arbitrary provider behavior. Real authentication, model execution, relay reconnection, production OAuth, website-only flows, and WSL switching need separate evidence when relevant.

## Change a journey or investigate a failure

Express the user outcome at the boundary that could fail. Use the existing fixtures for setup and cleanup. When persistence is the risk, assert after restarting; when isolation is the risk, assert that the sibling resource or outside workspace is unchanged.

Reports are written under `.e2e/` and uploaded by CI. The custom engines do not currently capture browser traces or screenshots. Read the failing step and fixture before changing a timeout: the control request deadline accommodates local Worker startup, while the runner owns the overall journey deadline.

Use the smallest reproduction that exposes the failure, then rerun the affected journey after fixing it. A test report establishes the assertions it ran; record any remaining manual or integration gap separately.
