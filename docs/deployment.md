# Deploying remote services

Use this guide for local account setup or production changes to the remote site, account API, and relay. Desktop publishing is covered in [Releasing MeldShell](release.md).

## Service boundaries

The site and API share an origin. The Pages [API function](../apps/site/functions/api/[[path]].ts) forwards `/api/*`, including relay WebSockets, through the `CONTROL` service binding to the account Worker. The Worker uses D1 for account data and Durable Objects for account and device services.

[Site configuration](../apps/site/wrangler.jsonc) defines the output directory and service binding. [Worker configuration](../apps/control/wrangler.jsonc) defines bindings, migrations, and the public account origin. The Worker has no direct public route in this configuration.

## Local development

Copy [the environment example](../apps/control/.dev.vars.example) to `apps/control/.dev.vars` and supply:

- `BETTER_AUTH_URL`: the site origin, normally `http://localhost:4321`.
- `BETTER_AUTH_SECRET`: a random secret of at least 32 characters.
- Both client ID and client secret for each OAuth provider you enable, using the Google or Discord variable names in the example.

Register callback URLs under that origin at `/api/auth/callback/google` or `/api/auth/callback/discord`. The [auth implementation](../apps/control/src/auth.ts) rejects incomplete credential pairs and requires an HTTPS origin outside localhost.

Run `npm run dev:all` for the desktop, site, and Worker, or `npm run dev:host` for a headless host instead of the desktop. Both serve the dashboard at `http://localhost:4321/dashboard`. The site's [development proxy](../apps/site/astro.config.mjs) forwards API and WebSocket requests to the local Worker. `npm run control` applies local migrations before starting that Worker.

The headless development script uses the development desktop's data directory unless overridden. Run only one host against it, or give the headless process a separate `MELDSHELL_DATA_DIR`. Device linking enables remote control until revoked; use the intended development account and origin.

For API changes that do not need real sign-in, the [control journeys](../tests/e2e/README.md) provide local fixtures without OAuth credentials.

## Production configuration

Dashboard settings are external state. The values below describe the intended repository setup; confirm them in the target Cloudflare account when deploying.

| Pages setting | Intended value |
| --- | --- |
| Project | Name in `apps/site/wrangler.jsonc` |
| Production branch | `main` |
| Root directory | `apps/site` |
| Build output | `dist` |
| Build command | `cd ../.. && npm ci --ignore-scripts && npm run build --workspace=@meldshell/site` |
| Build environment | `NODE_VERSION=24`, `SKIP_DEPENDENCY_INSTALL=1` |
| Build watch paths | Include the site, shared UI, contracts, root manifest, and lockfile; revise when the site's dependencies change |

Pages supports [Git-based build configuration](https://developers.cloudflare.com/pages/get-started/git-integration/) and [build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/). Bindings are configured through the [Wrangler file](https://developers.cloudflare.com/pages/functions/wrangler-configuration/). These control different parts of deployment; a valid local configuration does not establish that the connected project uses the intended branch or build settings.

Set the public custom domain and `BETTER_AUTH_URL` to the same origin, configure the Worker secrets, and register that origin's OAuth callbacks. Confirm the D1 database binding points to the intended database.

## Deploy a compatible change

1. Review the [D1 migrations](../apps/control/migrations) and compatibility with desktop versions that are still installed. Keep the old client path usable during a service cutover.
2. Deploy the account Worker with `npm run deploy --workspace=@meldshell/control`. The [script](../apps/control/package.json) applies **remote D1 migrations before deploying**; this changes production data.
3. Deploy the compatible site through the connected Pages project. Its Git integration is separate from GitHub Actions CI; the repository does not configure it to wait for CI. Confirm the deployed commit and binding before releasing a desktop that depends on them.
4. Verify the changed behavior at the public origin. Configuration at `/api/remote/v1/config` should show the intended sign-in providers. For auth or relay changes, relevant evidence includes sign-in, device linking, a command reaching the correct host, and disconnect or revocation behavior.

A deployment record should identify the site commit, Worker deployment, database migrations, target origin, and checks performed. Separate local test results from production observations. A working home page alone does not verify authentication, database access, or the relay.
