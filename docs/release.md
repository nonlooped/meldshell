# Releasing MeldShell

Use this checklist for an installer candidate. Routine edits follow [AGENTS.md](../AGENTS.md#verification). A recorded result applies only to its exact artifact.

## Automatic releases

The [Release](../.github/workflows/release.yml) workflow runs from `main`:

- **Stable**, daily at 00:17 UTC: if [CHANGELOG.md](../CHANGELOG.md) has `## [Unreleased]` entries, it releases them as the next minor version (`0.9.0` → `0.10.0`). It moves the entries under the new version and date, bumps every version field, pushes `chore(release): vX.Y.0` to `main` with an annotated tag, and publishes the GitHub Release as the latest release. Days without Unreleased entries release nothing.
- **Nightly**, after pushes to `main` and hourly at minute 47: if files outside `docs/`, `.github/`, and Markdown changed since the nearest release tag, stable or nightly, an automatic run publishes a prerelease only when that release is at least 30 minutes old. Push runs wait two minutes and skip if a newer commit arrived, combining rapid pushes into one build. The 30-minute limit prevents another automatic nightly immediately afterward, while the push trigger covers scheduled events that GitHub delays or drops. Manual nightly runs use the change rule without the delay or 30-minute limit. The version is `vX.Y.0-nightly.YYYYMMDDHHMM` for the upcoming minor version, set only in the build; nothing is committed, and the tag points at the triggering `main` commit. Its notes list the Unreleased entries and the commits since the previous release. Nightlies are never marked latest and are kept.

Each release runs the full [CI](../.github/workflows/ci.yml) suite and packages both platforms from the same commit. It is tagged and published only if everything passes, so a failure leaves no tag, commit, or release. The schedule does not retry a commit whose release failed. A new commit on `main`, a rerun, or a manual run with the same channel does.

The stable job pushes its release commit only as a fast-forward of the commit it tested. If `main` moved during the run, the push fails, nothing is published, and the next day's run releases the newer commit. A rerun after a failed upload reuses the tag it already pushed and refuses to change a published release.

To release now, open **Actions → Release → Run workflow**, select the `main` branch and `nightly`, then run it. Check **Cut a nightly even when no app files changed** to force a fresh nightly from the current `main` commit, including when the last nightly already used that commit. Leave it unchecked to use the scheduled change rule. Manual `stable` runs use the Unreleased entry rule. The force option cannot reuse a tag created in the same UTC minute; wait until the next minute and run it again. `build-only` packages installers from any ref as seven-day workflow artifacts without releasing. GitHub disables scheduled workflows in a public repository after 60 days without repository activity; re-enable Release from the Actions tab if that happens.

If account API or relay behavior changed, complete the [remote service cutover](#remote-service-cutover) before the next scheduled stable release. Routine releases do not need local builds or suites. Use the candidate path below when installer or runtime changes need manual evidence. Keep the manual matrix as the coverage reference and record skipped cases; a routine release does not imply that every manual case was certified.

## Remote service cutover

When a release changes the account API or relay, put the compatible site and account worker in production before the scheduled release of a desktop build that points to them. The Worker configuration is [apps/control/wrangler.jsonc](../apps/control/wrangler.jsonc), and the Pages configuration is [apps/site/wrangler.jsonc](../apps/site/wrangler.jsonc).

1. Confirm the D1 database ID and configure the Worker secrets: `BETTER_AUTH_SECRET` (at least 32 characters), plus both client ID and secret for at least one of Google or Discord. Register `https://meldshell.nonlooped.xyz/api/auth/callback/google` and `https://meldshell.nonlooped.xyz/api/auth/callback/discord` with the respective providers you enable.
2. Apply D1 migrations and deploy the account Worker with `npm run deploy --workspace=@meldshell/control`. This command changes the production database; review its pending migrations first.
3. Build the site with `npm run build --workspace=@meldshell/site`, then deploy `apps/site/dist` to the `meldshell` Pages project. Its `/api/*` Function needs the `CONTROL` service binding to `meldshell-control`.
4. Route `meldshell.nonlooped.xyz` to Pages. Confirm `/api/remote/v1/config` returns the enabled providers, and complete a real sign-in and device link before that release. A successful static home page alone does not verify the account API.

## Versioning

MeldShell has one app version, kept in the root and desktop `package.json` files and the lockfile. Tags are `vX.Y.Z` for stable releases and `vX.Y.Z-nightly.YYYYMMDDHHMM` for nightlies, following [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every stable release bumps the minor version; a nightly precedes the stable release it leads up to. A major version, such as 1.0.0 for the first public release, needs a change to [scripts/release.mjs](../scripts/release.mjs).

Every user-visible change adds an entry under `## [Unreleased]` in [CHANGELOG.md](../CHANGELOG.md), using the Keep a Changelog groups `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. Write each entry for users, not in terms of the implementation. Internal refactors, tests, CI, and documentation need no entry. A change without an entry still reaches nightlies but does not start a stable release. A [test](../tests/changelog.test.ts) keeps the version fields and changelog consistent.

## Updates

Installed builds check GitHub Releases every four hours. Stable installs follow the latest stable release. Settings › About › **Nightly builds** switches to the nightly channel, which follows GitHub prereleases. A nightly install follows nightlies by default. Turning the switch off installs the latest stable release even though it is older. The choice is stored in `update-channel.json` in the app's user data folder.

## Build and assemble

Native Windows and Linux runners package NSIS x64 and AppImage x64 artifacts while CI runs. The publish job verifies the installers and updater metadata, then stages them with blockmaps and SHA256SUMS in a draft before publishing it. Nightlies also carry `nightly.yml` and `nightly-linux.yml`, copies of the `latest` metadata that the updater reads for a prerelease. A failed upload leaves the draft unpublished.

For a local candidate:

1. Use Node.js 24 or newer on Windows 11 x64 for NSIS and x64 Linux for AppImage.
2. Install with `npm ci`. For full local candidate validation, run `npm run knip`, `npm run check:fast`, and `npm test` once. The packaging command in the next step includes the desktop build. When using workflow artifacts, use the workflow's automated verdict instead of repeating these checks locally.
3. Run `npm run package:win` on Windows or `npm run package:linux` on Linux.
4. Inspect the repository-root `release` output. Confirm SQLite loads outside ASAR and no Claude Code native executable is packaged.
5. Record hashes and complete the applicable manual matrix against those exact artifacts. Results from a local or `build-only` build apply only to that build; record any checks on the published installers separately.

Keep each installer/AppImage with the `latest.yml` or `latest-linux.yml` produced by the same build. Installed applications cannot use draft assets; public downloads and updates need a publicly accessible destination. Never embed a GitHub access token in the app.

Configuration lives in [electron-builder.yml](../apps/desktop/electron-builder.yml). Pull requests and `main` pushes run [CI](../.github/workflows/ci.yml): static checks, Linux build and tests, and Windows tests. It skips documentation-only changes.

## Manual candidate matrix

Use fresh operating-system user profiles. Run the provider matrix on Windows and startup/update cases on Linux; record additional Linux coverage and all skipped cases. Authenticated requests may consume account quota. Agent execution of manual/UI checks still requires the explicit request described in AGENTS.md.

| Area | Acceptance evidence |
| --- | --- |
| Codex unavailable | Missing, outdated, and unauthenticated states leave stored threads readable and explain the required action |
| Codex ready | Catalog/capabilities match discovery; streaming, completion, restart resume, interruption, approval, and attachments work |
| Claude unavailable | Missing CLI, failed compatibility probe, and authentication errors identify the problem while other providers remain usable |
| Claude ready | PATH/override discovery, streaming, completion, restart resume, interruption, approvals, questions, attachments, Code/Plan, and supported settings work |
| Cursor unavailable | Missing CLI, wrong executable/handshake, and authentication failures leave other providers usable |
| Cursor ready | Catalog and exact model IDs, Agent/Plan/Ask, streaming, permissions, questions/plans, cancellation, attachments, and restart session loading work |
| Provider switching | Switching among installed harnesses resumes each native history without importing other providers' messages |
| Worker failure | Affected work settles, other providers continue, and reconnect does not replay ambiguous submissions |
| Usage | All configured provider cards refresh or show an account-appropriate unavailable/error state |
| Forced exit | Running turns become interrupted; queued input survives restart |
| Attention | Completion and approval notifications focus the correct thread; out-of-view completion marks clear on viewing, and optional sounds respect the preference |
| Remote control | A linked desktop and headless host appear only to their account; browser prompts, queues, questions, approvals, files, and Git operations reach the right host; reconnect and revocation preserve host work |
| Workspace lifecycle | Rename/pin persist; active work blocks removal; removal keeps disk files |
| Search/preferences | Matches open the right turn, archives remain searchable, preferences survive restart; temporary tabs/drafts are accurately represented |
| Files/Git | Previews and line links open correctly; staging, unstaging, discard, commit, push, and history reflect the test repository |
| Layout/accessibility | Keyboard navigation, split panes, themes, reduced motion, transparency fallback, and text scaling remain usable |
| History/scale | Forward-paged full-history loading and search navigation preserve complete turns; measure the 10,000-thread target, long-history fetch cost, and large-turn limits |
| Updates | Both platforms check, download, and restart; up-to-date/feed-error states recover; cancelling the active-turn warning keeps the app running; development stays offline from the feed |
| Uninstall | Windows per-user uninstall needs no elevation and retains user data unless separately removed |

Use a disposable repository for Git operations and a separate application profile for fixture conversations.

## Record and publish

Keep a candidate record with the source commit and local changes, artifact names, sizes, SHA-256 hashes, operating-system versions, installed provider versions, commands, and each matrix result. Mark skipped and failing checks explicitly.

Only describe a candidate as verified to the extent its record supports. Unsigned Windows installers may trigger SmartScreen.
