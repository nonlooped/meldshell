# Remote control

Each computer runs a MeldShell host: in the desktop's main process, or headless on a server. Hosts keep files, provider credentials, native sessions, transcripts, approvals, and queues. Signed-in browsers reach a host through the account service's relay and reuse the desktop renderer.

## Services and trust

The account service in `apps/control` uses Better Auth for email/password, optional Google sign-in, email verification, password reset, and the OAuth device flow that links hosts. It is one long-lived Node process with a SQLite database on a persistent volume, behind an HTTPS reverse proxy with WebSocket support. Run one instance per database: presence and the relay live in memory.

The Astro website stays static. Set `PUBLIC_CONTROL_URL` at build time to the account service. Serve both on the **same site**, such as `app.example.com` and `control.example.com`; browser sessions use credentialed requests, and unrelated domains can be blocked by third-party-cookie policies.

The relay is trusted, not end-to-end encrypted. **Its operator has full control of every linked host**: it can read prompts, output, and requested files, and can send commands that start agents or run Git. So can anyone who signs in to your account; there is no second factor. The relay does not persist conversation payloads. It stores accounts, hashed device credentials, device names, and last-seen times. Keep reverse-proxy body logging disabled.

## Account service

Use Node 24 or newer.

```sh
npm ci --workspace=@meldshell/control --include-workspace-root=false --ignore-scripts
cp apps/control/.env.example apps/control/.env
npm run control
```

Set `BETTER_AUTH_SECRET` to at least 32 random characters, `BETTER_AUTH_URL` to the service's public origin, and `MELDSHELL_SITE_URL` to the website origin. Production (`NODE_ENV=production`) requires HTTPS origins plus `SMTP_URL` and `SMTP_FROM`. The service listens on `127.0.0.1:3001` by default; set `BIND_ADDRESS=0.0.0.0` in a container that only its proxy can reach.

For Google, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the service only, and register `BETTER_AUTH_URL/api/auth/callback/google` as a redirect URI. Account linking is disabled, so use one sign-in method per account.

Set `MELDSHELL_TRUST_PROXY=1` only when the proxy replaces `X-Forwarded-For` and the service is not directly reachable; otherwise rate limits use the connection address. Back up the database and secret. Better Auth migrates its schema at startup.

For local development, configure `apps/control/.env` and run `npm run dev:all`. It starts the desktop, account service, and website, and stops all three when one exits. The website is at `http://localhost:4321/dashboard`.

To bring this computer online without opening the desktop, run `npm run dev:host` instead. It starts a headless host on the development desktop's data directory (or `MELDSHELL_DATA_DIR`), so it appears as the same device with the same workspaces and threads, and links it first if needed. Quit the desktop first; one host owns a data directory at a time.

## Linking a desktop

Set `VITE_CONTROL_URL` when building the desktop; development defaults to `http://localhost:3001`. In **Settings → Account & devices**, choose **Sign in with your browser**. MeldShell shows a code and opens the website's `/device` page, where you sign in, check the code, and choose **Connect this computer**. The host exchanges the approval for a device credential, signs the temporary session out, and connects to the relay.

Later launches reconnect automatically. **Open** on an online device in `/dashboard` opens its inbox. Browser disconnects never stop agents; closing the desktop stops its host after the usual active-work confirmation.

**Remove** on the dashboard revokes a device and closes its connections; the desktop then shows **Access was removed**. **Sign out** on the desktop deletes the local credential. Linking again rotates the credential. Password recovery revokes browser sessions, not devices.

## Headless hosts

Install the headless workspace and rebuild SQLite for Node, as the unprivileged user that owns the workspaces and provider CLI logins:

```sh
npm ci --workspace=@meldshell/headless --include-workspace-root=false --ignore-scripts
npm rebuild better-sqlite3
npm run host -- link --control https://control.example.com --data-dir /var/lib/meldshell
npm run host -- --data-dir /var/lib/meldshell --workspace /srv/project
```

`link` prints a URL and code to approve in a browser; restart a running host afterwards. `--workspace` adds a folder; later starts do not need it. The data directory defaults to `~/.local/share/meldshell` (or `MELDSHELL_DATA_DIR`). One host may own a data directory at a time; the lock is released by the OS when the process dies. Use local disk. Supervise the process with systemd or a container runtime; SIGTERM stops providers and settles state. Hosts only make outbound connections.

## Credentials and behavior

The data directory holds `device-id` and a mode-0600 `remote-credential.json`; keep it private to its OS user.

A device is online while its host holds a relay connection. Relay heartbeats every 15 seconds drop dead sockets, and browser sessions are rechecked at the same interval, so signing out ends relay access within 15 seconds. Offline hosts are not woken, and nothing is queued in the cloud.

Commands are validated at the relay and host. Frames are limited to 8 MB and send buffers to 16 MB; a slow client is disconnected instead of stalling the host. On reconnect, a browser refetches current state and open transcripts through the existing sequence cursors.

Snapshot reads pilot a shared Effect RPC contract inside the v1 relay envelope; deploy the browser and host from the same release. Other operations retain their existing command protocol. The relay still authenticates connections and routes responses by client and request.

Device credentials use Better Auth's API key plugin. A device record binds a stable device ID to one key ID; user-created keys cannot acquire that binding. Startup imports existing credential hashes transactionally, including revocation state, so linked hosts keep their credentials. API key HTTP endpoints are not exposed; device registration and removal own rotation and revocation. Presence remains in the device table.

Commands are never resent automatically. If the connection drops before a result arrives, the browser reports it and the draft remains; check the conversation before sending again. Approvals are answered once across clients, using the running turn's harness, and stay pending if delivery to the provider fails. Browser attachments are images sent as content. Adding workspaces and updating the app remain desktop-only.

## Tests and manual acceptance

Automated tests cover account isolation, device linking and revocation, presence, relay routing, approval delivery, event coalescing, host restart, and exclusive ownership, using fake provider workers.

Manual acceptance still covers production OAuth and email delivery, real providers, packaged desktop builds, and phone and laptop layouts: link a desktop and a headless host to one account, drive each from a phone and a laptop (prompts, queue, question, approval, changes), drop the connection mid-turn, and confirm the same conversation on the desktop. Revoke one host and confirm the other stays reachable.

Deferred: native mobile apps, cross-device history sync, cloud-queued commands, remote wake-up, and end-to-end encryption.

## Dependency references

The integration follows Better Auth's [installation](https://better-auth.com/docs/installation), [Google](https://better-auth.com/docs/authentication/google), [device authorization](https://better-auth.com/docs/plugins/device-authorization), [API keys](https://better-auth.com/docs/plugins/api-key), and [migration](https://better-auth.com/docs/concepts/database#programmatic-migrations) documentation. Reconnection uses [partysocket](https://github.com/cloudflare/partykit/tree/main/packages/partysocket).
