# Changelog

All notable changes to MeldShell are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as described in the [release guide](docs/release.md#versioning).

## [Unreleased]

### Added

- A workspace can define setup and run scripts in a `meldshell.json` file at the root of its repository: `{ "scripts": { "setup": "npm install", "run": "npm run dev" } }`. `run` can also name several commands to choose from, such as `{ "app": "npm run dev", "docs": "npm run docs" }`. MeldShell reads the file from the workspace folder, so it can be committed or kept untracked. Scripts run through `/bin/sh`, or `cmd.exe` on Windows.
- The setup script runs in every new thread worktree as soon as the worktree is created, to install dependencies or copy ignored files such as `.env` that a fresh checkout lacks. The thread's start screen and branch bar show that setup is running, stopped, or failed, with its output and actions to stop it or run it again. Messages can be sent once it ends. If MeldShell quits during setup, the thread shows setup as stopped.
- The **Run** button in the title bar starts the run script in the thread's terminal, in its worktree when it has one. With several named run scripts, it opens a menu to choose one, and each starts in its own terminal. Running a script again shows its terminal instead of starting a second copy. The remote web client has no Run button because it has no terminals.
- Scripts and thread terminals receive `MELDSHELL_ROOT_PATH` (the workspace's main checkout), `MELDSHELL_WORKSPACE_PATH` (the folder the thread works in), `MELDSHELL_THREAD_ID`, `MELDSHELL_BRANCH` in a worktree, and `MELDSHELL_PORT`, the first of ten ports assigned to the thread. The port stays the same across restarts and rarely matches another thread's.

## [0.8.0] - 2026-09-24

### Fixed

- 0.7.0 was never published because its release checks failed. This release delivers every change listed under 0.7.0 below.

## [0.7.0] - 2026-09-24

### Added

- A new thread can work on its own branch: choose **Own branch** below an empty thread's composer before the first message. MeldShell creates a Git worktree for it from the workspace's current commit, so threads running at the same time never edit the same files. Every harness in that thread, the Files and Changes sidebars, file links, and `@` completions use the thread's worktree.
- Threads on their own branch show a branch mark in the inbox and a branch bar in the source control sidebar, with actions to merge the branch into the branch it started from or remove the worktree. A merge that conflicts is undone instead of leaving the workspace half-merged.
- A worktree folder deleted outside MeldShell is marked missing at startup, and its thread will not start turns until the folder is restored and MeldShell restarts. A thread whose worktree was removed cannot start turns either; start a new thread to keep working.
- Each thread has its own terminal, below its conversation. Open it with the terminal button in the title bar, a split pane's menu, or Ctrl+\`. It starts in the thread's worktree when it has one, otherwise in the workspace folder, using your default shell (`$SHELL`; on Windows, PowerShell 7, Windows PowerShell, or Command Prompt, whichever is found first). Its colours, font, text size, and scale follow the app's theme and settings. The remote web client has no terminals.
- Split a terminal right or down to run several shells side by side, drag the dividers to resize them, and close them one at a time. Running `exit` closes its pane; a shell that exits with an error keeps its pane open with the exit code until you press a key.
- Terminals keep running while you work in other threads, hide the panel, or close the thread's tab, and come back with their output and running programs as you left them. They end when you close them, when their thread is deleted or its workspace removed, or when MeldShell quits, which does not ask first.
- While a terminal has focus, control keys such as Ctrl+W, Ctrl+K, Ctrl+N, and Ctrl+P go to the shell instead of MeldShell; Ctrl+Tab and Ctrl+\` still switch tabs and toggle the terminal. Ctrl+Shift+C and Ctrl+Shift+V copy and paste, and on Windows Ctrl+C copies selected text and Ctrl+V pastes. Ctrl-click opens a link.

### Changed

- The light theme is softer on the eyes: a dimmed warm-grey base replaces the near-white background, panels and inputs are no longer pure white, and body text is slightly softer. Secondary text, the accent, and status colours are darker so they stay readable on the new base.
- New thread opens a thread right away in the most recently used workspace instead of asking for a workspace first. Until its first message, the workspace name in the thread's start screen heading opens a menu to move it to any workspace. Moving a thread that has its own branch creates a new worktree in the new workspace's repository, and moving it or switching it back to **Workspace folder** deletes the unused worktree and branch; both are refused while that worktree has uncommitted files.
- Push publishes a branch with no upstream to `origin`, or to the only remote, and sets it as the upstream.
- Deleting a thread that has its own worktree removes the worktree folder but keeps its branch, and is refused while the worktree has uncommitted changes. Removing a workspace does the same for all of its threads' worktrees.
- Settings › Providers shows each provider's connection status and version without expanding it, and opens providers that need attention. Connection problems say what to do next.
- Each model has one Shown, Hidden, or Off choice instead of separate Hidden and Enabled switches, and the model list shows identifiers, compact reasoning ranges, and Default, Custom, and Fast labels. Long lists can be filtered.
- Only custom models can be removed; built-in models are turned off instead, because the provider adds them back.
- The inbox and source control sidebars slide open and closed when toggled instead of snapping.
- Ctrl+P and Ctrl+K open a compact search bar at the top of the window. Ctrl+P finds files by name in the current thread's workspace or worktree and opens the chosen file in a tab. Ctrl+K, and the inbox's Search button, find threads by title and messages anywhere in their transcripts; choosing a message opens its thread at that message. Ctrl+K replaces the transcript search dialog, which also means results can no longer be limited to one workspace or paged beyond the first 50 matches.

### Fixed

- Keep title bar buttons beside the native window controls on Windows and Linux, and against the right edge in the remote web view.
- Restore built-in models only resets the provider it was chosen for instead of every provider.
- Adding a model or editing an identifier warns when the provider already has a model with that identifier instead of silently ignoring it, and built-in identifiers can no longer be changed.
- With Cursor, `/` lists Cursor's commands and `$` lists its skills, including built-in skills. Before, skills also showed up under `/` as commands.
- With Codex, `/` says that Codex has no slash commands and points to `$` for skills instead of showing "No matching commands".
- MeldShell no longer responds to browser shortcuts. Ctrl+W closes only a thread tab and never the app, Ctrl+R no longer reloads the interface, Ctrl+= and Ctrl+- no longer zoom the page, Ctrl+Shift+I no longer opens developer tools, F11 no longer enters full screen, and Alt no longer reveals a hidden menu bar.
- Files dropped onto the window are refused instead of showing a copy cursor, and links and images no longer drag out as web addresses.

## [0.6.0] - 2026-09-24

### Changed

- General is now first in Settings, and Account & devices uses the same setting rows as the other sections instead of cards.

## [0.5.0] - 2026-09-24

### Added

- The composer autocompletes workspace files and folders after `@`, the selected harness's skills after `$`, and its commands after a leading `/`. Accepted suggestions become pills in the message and are deleted as a unit.

### Fixed

- Show the MeldShell mark instead of the default artwork on the app icon and Windows setup and uninstall screens.

## [0.4.0] - 2026-09-23

### Added

- A sent prompt flies from the composer into its place in the transcript.
- A prompt sent while a thread is running drops into the queue button, and the queue count springs in.
- Collapsible sections grow open and fold shut, and a finished turn folds its working log into its summary.
- Staging or unstaging a file flies it between the Git lists, and removed rows fold away.
- Closing a tab narrows it away; renamed thread titles crossfade in the inbox and tabs.
- Inbox status badges spring in and out, attachment chips animate out when removed, and copy buttons swap to their confirmation.
- Jumping to a prompt from the prompt rail briefly rings its message.
- The diff viewer folds unchanged lines behind expandable rows, offers unified and split layouts, and can toggle line wrapping.
- The file tree shows Git status letters, indent guides, and more specific file icons.
- Subscription usage explains its bars with a legend.
- A Retry now action reconnects an offline computer to the relay immediately.
- The file tree supports arrow-key navigation and announces itself as a tree to assistive technology.
- Left and Right arrow keys page through images in the image viewer.

### Fixed

- Keep remote access working after a host reconnects while its previous connection is still closing.

### Changed

- Bundle Mona Sans and Monaspace Neon so every platform uses the same interface and code fonts instead of a system fallback.
- Use a restrained blue accent with a softer focus ring, and one selection style across tabs, the inbox, and the settings navigation.
- Make New thread the inbox's primary action, show search as a plain button, and style the workspace filter as a select.
- Narrow the transcript's reading width, group each turn more tightly, lighten inline code, render file references as links, and label work summaries with an icon.
- Enter sends a message and Shift+Enter adds a line; the send shortcut setting and composer keycaps are removed.
- Mark each provider's least restricted permission in amber, show reasoning speed only when Fast is on, and remove the composer's toolbar divider.
- Keep model picker provider headings in view while scrolling.
- Explain why Commit is unavailable, show stage and discard actions on hover, and show branch labels and commit ages in the graph.
- Center settings content, move the way back to the top of settings, and show the relay privacy note as a callout.
- Show every subscription reset as a countdown, with the exact time on hover.
- Host the website, account API, and relay together at meldshell.nonlooped.xyz on Cloudflare: the site on Pages, and the account API and relay in a Worker with Durable Objects and D1.
- Sign in with Google or Discord; accounts that share a verified email are linked. Desktop builds connect to meldshell.nonlooped.xyz by default. Computers linked to the old account service must be linked again.
- Hosts no longer stream events through the relay while no browser is connected; browsers refetch state when they connect.

### Removed

- Email and password accounts, email verification, and password reset.

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

[Unreleased]: https://github.com/nonlooped/meldshell/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/nonlooped/meldshell/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/nonlooped/meldshell/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/nonlooped/meldshell/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/nonlooped/meldshell/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/nonlooped/meldshell/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nonlooped/meldshell/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nonlooped/meldshell/releases/tag/v0.2.0
