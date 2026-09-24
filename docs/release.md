# Releasing MeldShell

Use this checklist for an installer candidate. Routine edits follow [AGENTS.md](../AGENTS.md#verification). A recorded result applies only to its exact artifact.

## Usual release path

1. Commit the intended changes and Unreleased entries, and push `main`.
2. If account API or relay behavior changed, complete the [remote service cutover](#remote-service-cutover).
3. Optionally preview with `npm run release -- minor --dry-run` (use `patch` for fixes or an explicit version).
4. Run `npm run release -- minor --push`. This cuts the release and pushes the commit and tag together. The printed Actions link shows builds and publication; agent monitoring follows the [repository verification policy](../AGENTS.md#verification).

The preview prints the release notes and whether the version reaches stable downloads. It changes nothing and does not check the remote. Publishing requires a clean `main` matching freshly fetched `origin/main`, consistent version fields, Unreleased entries, and an unused version tag. If pushing fails after the cut, the script retains the local commit/tag and prints the exact push command to retry; do not bump again.

The tag workflow owns full automated validation and packaging. Routine releases do not need duplicate local builds or suites before tagging. Use the candidate path below when installer or runtime changes need manual evidence. Keep the manual matrix as the coverage reference and record skipped cases; a routine release does not imply that every manual case was certified.

## Remote service cutover

When a release changes the account API or relay, put the compatible site and account worker in production before tagging a desktop build that points to them. The Worker configuration is [apps/control/wrangler.jsonc](../apps/control/wrangler.jsonc), and the Pages configuration is [apps/site/wrangler.jsonc](../apps/site/wrangler.jsonc).

1. Confirm the D1 database ID and configure the Worker secrets: `BETTER_AUTH_SECRET` (at least 32 characters), plus both client ID and secret for at least one of Google or Discord. Register `https://meldshell.nonlooped.xyz/api/auth/callback/google` and `https://meldshell.nonlooped.xyz/api/auth/callback/discord` with the respective providers you enable.
2. Apply D1 migrations and deploy the account Worker with `npm run deploy --workspace=@meldshell/control`. This command changes the production database; review its pending migrations first.
3. Build the site with `npm run build --workspace=@meldshell/site`, then deploy `apps/site/dist` to the `meldshell` Pages project. Its `/api/*` Function needs the `CONTROL` service binding to `meldshell-control`.
4. Route `meldshell.nonlooped.xyz` to Pages. Confirm `/api/remote/v1/config` returns the enabled providers, and complete a real sign-in and device link before tagging. A successful static home page alone does not verify the account API.

## Versioning

MeldShell has one app version, kept in the root and desktop `package.json` files and the lockfile. Tags are `vX.Y.Z` and follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0.0, a minor bump marks new features or incompatible changes to stored data, settings, or remote protocols, and a patch bump marks fixes only. 1.0.0 marks the first public release.

Every user-visible change adds an entry under `## [Unreleased]` in [CHANGELOG.md](../CHANGELOG.md), using the Keep a Changelog groups `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. Write each entry for users, not in terms of the implementation. Internal refactors, tests, CI, and documentation need no entry.

Before 1.0.0, `0.x.0` tags publish as normal GitHub Releases and `0.x.y` tags with `y > 0` publish as prereleases. Prereleases are not the latest stable download or update.

To cut a release from a clean, up-to-date `main`, run `npm run release -- <patch|minor|major|X.Y.Z>`. The script moves the Unreleased entries under the new version and date, bumps every version field, commits `chore(release): vX.Y.Z`, and creates an annotated tag. Add `--push` to also publish the commit and tag, or push both later with `git push --atomic origin main vX.Y.Z`. A [test](../tests/changelog.test.ts) keeps the version fields and changelog consistent.

## Build and assemble

[Release](../.github/workflows/release.yml) runs for a stable `vX.Y.Z` tag on `main` that matches the app version and has changelog entries. It runs the full [CI](../.github/workflows/ci.yml) suite while native Windows and Linux runners package NSIS x64 and AppImage x64 artifacts. Once both pass, the final job verifies the installers and updater metadata, stages them with blockmaps and SHA256SUMS in a draft, then publishes the release with the version's changelog entries and the classification above. A failed upload leaves the draft unpublished.

If the checks or packaging fail, the final job still publishes the version's changelog entries as a release without installers, with a warning linking to the failed run. It is never marked latest, so the updater, which follows the latest release, stays on the previous installers. A rerun that succeeds adds the installers to that release and publishes it normally. A fix that needs a new commit needs a new version; the notes-only release stays for the failed one.

Running the workflow manually from the Actions tab packages installers from any ref as seven-day workflow artifacts without creating a release; use it to test packaging and applicable manual flows before tagging. A rerun can replace draft assets but refuses to overwrite a published release that has installers. Tagging starts automatic publication after the checks pass; perform it within the authorization for the release task.

For a local candidate:

1. Use Node.js 24 or newer on Windows 11 x64 for NSIS and x64 Linux for AppImage.
2. Install with `npm ci`. For full local candidate validation, run `npm run knip`, `npm run check:fast`, and `npm test` once. The packaging command in the next step includes the desktop build. When using workflow artifacts, use the workflow's automated verdict instead of repeating these checks locally.
3. Run `npm run package:win` on Windows or `npm run package:linux` on Linux.
4. Inspect the repository-root `release` output. Confirm SQLite loads outside ASAR and no Claude Code native executable is packaged.
5. Record hashes and complete the applicable manual matrix against those exact artifacts before tagging. Results from a pretag build apply only to that build; record any checks on the published installers separately.

Keep each installer/AppImage with the `latest.yml` or `latest-linux.yml` produced by the same build. The workflow publishes both platforms together after automated verification. Installed applications cannot use draft assets; public downloads and updates need a publicly accessible destination. Never embed a GitHub access token in the app.

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
