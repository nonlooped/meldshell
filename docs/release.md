# Release checklist

Use this checklist for an installer candidate. Routine edits follow [AGENTS.md](../AGENTS.md#verification). A recorded result applies only to its exact artifact.

## Versioning

MeldShell has one app version, kept in the root and desktop `package.json` files and the lockfile. Tags are `vX.Y.Z` and follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0.0, a minor bump marks new features or incompatible changes to stored data, settings, or remote protocols, and a patch bump marks fixes only. 1.0.0 marks the first public release.

Every user-visible change adds an entry under `## [Unreleased]` in [CHANGELOG.md](../CHANGELOG.md), using the Keep a Changelog groups `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. Write each entry for users, not in terms of the implementation. Internal refactors, tests, CI, and documentation need no entry.

To cut a release from a clean, up-to-date `main`, run `npm run release -- <patch|minor|major|X.Y.Z>`. The script moves the Unreleased entries under the new version and date, bumps every version field, commits `chore(release): vX.Y.Z`, and creates an annotated tag. Push both with `git push --atomic origin main vX.Y.Z`. A [test](../tests/changelog.test.ts) keeps the version fields and changelog consistent.

## Build and assemble

[Release installers](../.github/workflows/release.yml) runs for a stable `vX.Y.Z` tag matching root and desktop package versions. Its Linux validation job runs unused-code, lint, formatting, type, and test checks. Native Windows and Linux runners build and package NSIS x64 and AppImage x64 artifacts. The final job assembles installers, updater metadata, blockmaps, and SHA256SUMS into one draft GitHub Release.

A rerun can replace draft assets but refuses to overwrite a published release. Tagging and publishing are external actions; perform them within the authorization for the release task.

For a local candidate:

1. Use Node.js 24 or newer on Windows 11 x64 for NSIS and x64 Linux for AppImage.
2. Install with `npm ci`. Run `npm run check` and `npm test` for candidate validation.
3. Run `npm run package:win` on Windows or `npm run package:linux` on Linux.
4. Inspect the repository-root `release` output. Confirm SQLite loads outside ASAR and no Claude Code native executable is packaged.
5. Record hashes and complete the applicable manual matrix against those exact artifacts.

Keep each installer/AppImage with the `latest.yml` or `latest-linux.yml` produced by the same build. Publish both platforms together after review. Installed applications cannot use draft assets; public downloads and updates need a publicly accessible destination. Never embed a GitHub access token in the app.

Configuration lives in [electron-builder.yml](../apps/desktop/electron-builder.yml). Routine [CI](../.github/workflows/ci.yml) and tagged release validation have different scopes; inspect their definitions when changing automation.

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
