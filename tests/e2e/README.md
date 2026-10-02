# Application journeys

[TesterArmy e2e](https://tester.army/e2e) owns test discovery, isolation, fixture steps, assertions, deadlines, and reports. Playwright is the Electron driver inside our custom engine; there is no Playwright test runner or mocked renderer bridge. The control engine boots Wrangler's real local Worker, D1, and Durable Objects.

## Run

Use Node 24+, Git, and the normal development install (`npm install`). Build the desktop before running it:

```sh
npm run build
npm test
```

Linux needs Electron's shared libraries and a display; in headless Linux use `xvfb-run --auto-servernum npm test`. CI installs Electron and rebuilds its native dependencies, then runs the journeys on Ubuntu and Windows. No browser download, cloud account, OAuth login, or AI model key is needed. Provider turns are not dispatched by this suite.

Focused commands:

```sh
npm test -- tests/e2e/journeys.e2e.ts --target electron
npm test -- tests/e2e/remote.e2e.ts --target control
npm run test:e2e:list
npm run typecheck:e2e
npm run test:tooling
```

The repository's UI verification policy applies to local Electron runs. Listing and typechecking do not launch Electron. The HTTP-only control target can run without a display or a desktop build.

## Coverage and isolation

Ten journeys replace 72 application test files. They test outcomes across boundaries rather than mapping old unit assertions one for one:

| Journey | Boundaries and outcomes |
| --- | --- |
| Returning user | Real preload IPC, workspace/thread mutations, worker/database persistence, full Electron restart, typed core errors from the restarted RPC client, renamed entries in the thread palette |
| Archive and delete | Durable archive status, deletion, sibling preservation, survivor in the thread palette after restart |
| Preferences | Accessible Settings controls, saved settings, restart, rendered theme |
| Workspace files | Actual files with spaces and Unicode, preview/list/rename/delete, rejection of writes outside the workspace |
| Isolated work | Actual Git worktree, checkout isolation, persisted worktree identity and file access after restart |
| Model catalog | Custom model edits, restart, removal without altering existing models |
| Terminal process | Actual shell process and file output in the selected workspace, resize and close |
| Scheduled work | Paused schedule, edits, restart, safe future run time, deletion, sibling preservation |
| Device lifecycle | Real account API, local D1/DO, independent devices, revoke and re-register |
| Rejected writes and sign-out | Invalid input, untrusted origin, unchanged state, session revocation |

Each attempt gets a temporary directory. Desktop attempts create a fresh Git repository, SQLite data directory, and Electron user profile; a restart within an attempt retains these directories. Control attempts apply committed migrations and seed one offline account session in a separate local D1 store. Teardown closes the processes before removing their data. Tests run with one worker and no retries so failure is visible.

Reports are written to `.e2e/` (JSON, JUnit, Markdown) and uploaded by CI. Fixture IPC/API operations appear as e2e steps. These custom engines do not currently record browser traces or screenshots. AI actions are optional in e2e; these journeys use deterministic actions and assertions and need no agent configuration.

The three root tooling suites still use Node's runner, separately from application tests. They cover release/changelog tooling and CI selection. Removed provider-protocol, update, rich-transcript, remote-WebSocket, and bundled-WSL unit checks are not individually reproduced. Real provider authentication/turns, relay reconnection, website-only flows, and Windows/WSL switching remain verification gaps; these journeys do not certify them.
