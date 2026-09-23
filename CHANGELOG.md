# Changelog

All notable changes to MeldShell are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as described in the [release guide](docs/release.md#versioning).

## [Unreleased]

## [0.3.0] - 2026-09-23

### Changed

- Pilot typed Effect RPC for remote snapshot reads while preserving relay authentication and the no-resend rule for commands.
- Manage linked-device credentials with Better Auth API keys, migrating existing credentials without relinking.
- Use library-maintained public IP classification for web titles, including embedded IPv4 checks.
- Use Effect's database migrator with legacy history conversion and pre-migration backups.

### Fixed

- Closing the app or headless host now waits for the database process to stop, so an immediate restart on Windows no longer finds the database locked.

## [0.2.0] - 2026-09-23

### Added

- Remote control: sign in to a MeldShell account, link a desktop or headless host, and drive its threads, queues, approvals, files, and Git from the browser.
- Headless host that runs the same provider runtime as the desktop app without a window.
- In-app updates from GitHub Releases and a Linux x64 AppImage alongside the Windows installer.
- A Done mark on threads that finish out of view, and an optional chime when such a thread finishes, fails, or asks for approval.
- A prompt rail beside wide transcripts that marks each user message, previews it on hover, and jumps to it.
- Collapsed turns summarize their work, such as "Ran 3 commands · edited 2 files".
- Split thread panes group into shared tabs, and staged or unstaged changes open in diff tabs.
- The send button queues a message while a turn is running.

### Changed

- Transcripts load their full history in forward pages instead of a recent window.
- Subscription usage shows every allowance in one grid, with elapsed window time behind each bar, and collapses providers that cannot report usage.
- New threads inherit the model, effort, and speed of the most recently submitted turn.
- Failures appear in a shared notice card whose message wraps in full and can be copied.
- Refreshed workbench styling: a dot-matrix running indicator, keycap shortcut hints, lighter label weights, and pane dragging.
- Completed work and tool details start collapsed.
- The Cursor integration uses the ACP SDK for requests and approvals.

### Fixed

- Opening a line link keeps the rich file preview.

## [0.1.0] - 2026-09-04

- Initial internal Windows candidate. It was never tagged or published.

[Unreleased]: https://github.com/nonlooped/meldshell/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/nonlooped/meldshell/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nonlooped/meldshell/releases/tag/v0.2.0
