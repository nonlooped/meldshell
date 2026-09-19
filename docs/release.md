# Release checklist

Use this checklist when certifying a release candidate. It does not set the verification scope for routine edits; those follow [AGENTS.md](../AGENTS.md#verification). Historical results apply only to the recorded artifact, not later working-tree changes.

## Build the candidate

1. Use Windows 11 x64 with Node.js 24 or newer.
2. Run `npm ci` and `npm run check`.
3. Run `npm run package:win`.
4. Verify the unsigned installer and unpacked application in the repository-root `release` directory. Confirm that SQLite loads successfully outside ASAR and that the package does not ship a Claude Code native executable.
5. Complete the manual matrix below. Authenticated provider requests can consume account quota.

Commands are defined in [package.json](../package.json); packaging is configured in [electron-builder.yml](../apps/desktop/electron-builder.yml). Record manual results against the exact candidate artifact.

## Clean-machine matrix

Use a fresh Windows user profile for each case. Confirm that stored threads remain usable in every provider state.

- Codex absent: the inbox opens and reports the missing executable.
- Codex outdated: the inbox opens and reports the minimum supported version.
- Codex unauthenticated: the inbox opens and reports that login is required.
- Codex ready: the picker matches `model/list`, model capabilities and service tiers match the
  provider response, and a turn streams, completes, resumes after restart, interrupts, requests
  approval, and accepts an attachment.
- Claude absent: the inbox opens and reports the missing Claude Code CLI.
- Claude incompatible: a discovered install that cannot complete the probe reports an error with the CLI path and version; other providers remain usable.
- Claude unauthenticated or unavailable: the inbox and Codex threads remain usable, and the Claude provider card reports the failure with a refresh action.
- Claude ready: the installed Claude Code CLI starts from PATH (or the override); a turn streams, completes, resumes after restart, interrupts, requests approval, answers a question, and accepts attachments. Check Code/Plan modes and the available permission, reasoning, and speed controls.
- Provider switching: a MeldShell thread can use both harnesses between turns; returning to either resumes that harness's own history without importing the other provider's messages.
- Provider worker failure: affected work settles, the other provider remains usable, and reconnect does not replay a submitted turn automatically.
- Usage: both provider cards refresh and show allowance windows or an explicit unavailable/error state appropriate to the account.
- Forced exit: a running turn becomes interrupted and queued input survives relaunch.
- Background attention: completion and approval notifications focus the correct thread.
- Workspace lifecycle: rename and pin changes persist; removal is blocked during running work and otherwise removes stored history while retaining disk files.
- Search and preferences: full-text matches open the correct turn, archived history remains searchable, and appearance/send preferences survive restart. Tabs and unsent drafts are currently temporary.
- Interface and scale: check keyboard navigation, light/dark/system themes, reduced motion, long transcripts, and the 10,000-thread responsiveness target. Record observed limits; transcript virtualization currently still fetches all pages of a selected history.
- Uninstall: the per-user application is removed without requiring elevation. User data remains available unless removed manually.

Record the source commit and any local changes, installer SHA-256 and size, Codex version, installed Claude Code version, Windows build, commands run, and matrix results in a dated file under [releases](releases/0.1.0.md). Mark skipped and failing checks explicitly. MeldShell installers are unsigned; Windows SmartScreen warnings are expected until code signing is introduced. The [0.1.0 record](releases/0.1.0.md) is historical and does not certify the current checkout.
