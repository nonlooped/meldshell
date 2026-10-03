# Changelog

All notable changes to MeldShell are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as described in the [release guide](docs/release.md#versioning).

## [Unreleased]

### Added

- Every turn now snapshots the thread's files when it starts and when it finishes, the way T3Code checkpoints do. A turn's changed-files list comes from those snapshots, so it includes edits made by shell commands. The restore icon beside a turn's changes rewinds the folder to before that turn in one click, and right-clicking a turn can also return to its end. A line marks where the files now stand and an Undo pill puts back what was there. Snapshots live under Git refs that stay out of branch history, skip ignored files and folders outside Git, and are removed when their thread is deleted.

- A thread can move to another agent partway through. Pick a model from a different provider and the composer says it will pick up from the previous agent; its first turn receives a summary of every turn it has not seen (each request, the files changed, the commands run, and the reply), and a line above that message opens the exact summary it was given. Switching back later sends only what happened in between.

- Rewind a thread from any of your messages. The rewind icon on a prompt (or Rewind to this message in its menu) takes that turn and every later one out of the conversation, returns the files to before it when they were snapshotted, and puts the message back in the composer to edit and send again. The next turn starts a fresh agent session from a summary of the turns that remain, and Undo brings the turns, files, and session back until you send something new.

- Messages sent while the agent is working can now queue or steer. Enter follows a new default in Settings (queue), Ctrl or Cmd with Enter does the other, and a menu beside the send button picks either for one message or changes the default. Steering goes into the same turn on Codex, and stops the turn and continues with your message on Claude Code and Cursor.

- Queued messages are listed above the composer, where each can be edited, sent now to steer the running turn, or removed, with a Clear all for the lot. Each queued message now starts as its own turn instead of being merged into one, and a queue left behind by an interrupted or failed turn waits for you to send it rather than showing only a count.

### Changed

- Choices show instead of tell. Settings picks a theme from small previews of each look, sets transcript text size with a row of Aa samples, and switches follow-ups between Queue and Steer with the explanation for only the chosen one. The composer's mode and permission menus say in one line what each choice does, and a turn's changed files each carry a small added/removed bar, with long lists folding after the first five files. Provider cards name their version and how many models are shown while closed, and each model's visibility is three icons instead of a menu. The schedule dialog previews the next few runs, a turn's working log folds runs of reads or searches into one line, and Always full permissions turns its description into a warning while it is on.

- The app moves with more life. Settings sections and the Files and Changes tabs slide their selection highlight to the chosen tab (which also restores the missing highlight in Settings), streaming replies rise into place block by block, and a finished turn swaps its spinner for what it did. Switches spring across and stretch while held, checkboxes and radio buttons pop their marks, the send button bounces once there is something to send, inbox threads glide to their new place when they move, toasts and notices rise in, an empty thread's heading settles in beneath the mark, and each agent on the launch screen bounces as it connects. Reduce motion turns all of it off.

- Internal catalog, session, setup, title, queue-priority, and approval writes now complete without rebuilding an unused application snapshot.

- In narrow windows the title bar keeps only the sidebar toggles and tabs: the editor, run, preview, and terminal buttons move into one Thread tools menu, and on phones the tab strip becomes a single button that names the open tab and lists the others.

- The composer's model, effort, and permission controls stay on one row at any width: they truncate first, then drop their chevrons, then show only their icons in narrow panes.

- The app adapts to narrow windows and phone screens. Below 960px the inbox and files sidebars take turns instead of crowding the thread, and below 640px they stack above it. Thread panes size their margins to their own width, split panes and the browser preview stack when a pane is too narrow for them side by side, and Settings turns its section list into a scrolling bar on phones. Dialogs, palettes, and toasts fit the window at any app scale, touch screens get larger tap targets, and the minimum window size is now 720×520.

## [0.14.0] - 2026-10-03

### Changed

- Streaming agent activity no longer reloads every thread, model, setting, and schedule on each tool event; mid-turn events refresh only that thread's transcript, and the full app state reloads when a turn finishes, an approval arrives or resolves, or a thread's title or mode changes.

- Transcripts, threads, the file tree, and source control show placeholder shapes while they load instead of loading text, and loaded content fades in. Placeholders wait briefly before appearing, so fast loads go straight to their content.

- Long streaming replies stay smooth: finished paragraphs, code blocks, and tables keep their formatting while only the newest block updates.

- Remove the unused native SQLite addon from desktop and WSL installations; database access uses the SQLite built into Node.

- Upgrade the app to stable Effect v4, consolidating SQL and RPC modules, explicitly scoping callback fibers, and preserving native provider extensions with open schemas.

### Fixed

- Avoid renderer stalls when streaming replies contain many unmatched opening brackets, such as log output.

- Preserve Markdown formatting for multiline or escaped reference labels, raw HTML, and code fences inside list items when rendering streaming replies block by block.

- Stop retained Pi sessions when switching providers, invoke selected Pi skills through their native slash commands, and reuse Pi’s discovered launcher when updating JavaScript and Windows installs.

### Added

- A full-screen first-run guide takes a fresh install to its first prompt: it shows which coding agents are installed and signed in, chooses a project folder, and sets the theme, text size, sounds, and permissions, then opens a new thread on a ready agent with the composer focused. Existing installs skip it, and Settings → General → Setup guide runs it again. Pi now shows its own logo instead of a generic icon.

- Pi (pi.dev) is the fourth native provider. MeldShell drives your installed Pi through its RPC mode in a separate worker, keeps one Pi session per thread and resumes it from Pi's own session file, and offers every model Pi has credentials for with its thinking levels. Pi's tools run as they do in Pi itself. Work your Pi extensions start on their own, such as after one of their commands or from a timer, appears as its own turn, and their dialogs appear as questions. Pi can be updated from Settings.

## [0.13.0] - 2026-10-02

### Changed

- The Working indicator now uses the app's blue, accent, and violet colors in both themes. The launch and website glows use the same palette.

### Added

- Right-click menus provide contextual actions across threads and workspace surfaces.

## [0.12.0] - 2026-09-27

### Changed

- The website hero now reads “Your coding agents, side by side.” and appears immediately. The main download button selects the Windows or Linux installer for the visitor’s operating system, and the bottom download panel has been removed.

- The website was redesigned. The landing page opens on three separate agent windows that meld into one MeldShell window, rendered from the app's own interface instead of screenshots, with the working indicator, streaming replies, an approval request, and a Codex question live; the frame catches light from the pointer, and product fragments scale to the viewport rather than reflowing. It uses the desktop's Mona Sans and Monaspace Neon faces, the same Lucide icons as the app, and the official OpenAI, Claude, Cursor, GitHub, Windows, and Linux marks. The download section links the Windows and Linux installers directly with their version and size, and the run-from-source card and footer are gone.

### Fixed

- Agent questions always allow a custom answer. Codex questions in the transcript now have their own answer fields and remain usable while Codex is working; replies reach the active turn immediately instead of waiting in the message queue.

### Added

- Remote control can browse host folders and add workspaces, open terminals and run scripts, manage the linked account, check and install desktop updates, change update channels, and restart or shut down the host. Windows/WSL switching is available remotely with confirmation. Remote terminals retain their processes for five minutes through connection loss and replay bounded output on reconnect; input is never retried. Desktop hosts provide an isolated, interactive browser preview rendered on the workstation, so local development servers stay on the host. Standalone headless hosts retain their service-manager update and lifecycle workflow.

- Switch between **Windows (native)** and **WSL (Linux)** in Settings → General → Execution environment. The choice is saved and applied with a confirmed restart; each environment keeps its own threads, settings, and provider sign-ins. Windows mode restores native agents, terminals, and editors without requiring WSL. Existing WSL installations keep their selected mode, and WSL setup errors offer an explicit **Use Windows** option.

- In WSL mode, the Windows desktop runs its host inside a selected WSL distribution. Agents, MCP tools, Git, worktrees, setup scripts, terminals, provider updates, and thread data use Linux; Windows is only the desktop interface. First launch chooses the distribution and prepares a matching Linux host; later app updates prepare a new cached Linux host and remove caches unused for 14 days, so stable and nightly installs do not rebuild each other's. File selections are translated into that distribution's paths, editors are discovered inside Linux, and a lost host connection fails pending requests without replaying them. WSL requires Linux Node.js 24+, npm, Python 3, make, and a C++ compiler. Existing Windows thread data is retained separately. See [Windows and WSL setup](docs/wsl.md).

## [0.11.0] - 2026-09-26

### Added

- Add an **Always full permissions** preference that applies full access without permission prompts to every harness on each new turn and hides the composer permission selector. Turning it off restores per-thread permission choices.

- Settings › Providers shows when a newer release of Codex, Claude Code, or Cursor CLI is available and can install it. The provider row has an **Update** button that runs the provider's own updater, or Homebrew's for a Homebrew install, without leaving MeldShell. The **Version** row names the installed and latest versions. A provider installed by a system package manager shows which one to use instead, and its row marks **Update available**. Versions are compared when a provider connects and every four hours after that; **Check for updates** compares them now. After an update, the provider reconnects with the new version when no turns are running.

- Cursor can ask you questions. Cursor does not offer its own question tool to apps like MeldShell, so MeldShell gives Cursor turns a question tool of its own. Its questions open the same dialog as Claude Code's, with option descriptions and room for your own answer.

### Fixed

- Cursor questions from MeldShell's tool no longer produce a false payload error in the transcript.
- Questions that Codex asks now appear in the transcript. Before, only its closing sentence showed, such as "You can choose an option or type your own answer.", and the question itself was lost. Each option is a button that sends it as your reply; with several questions, choose one option for each, then select **Send answers**. You can also type your own answer in the composer.
- When a turn ends with more than one final message, the earlier ones stay in the turn's working log instead of disappearing.
- The question dialog no longer shows the question's raw JSON above the choices. Its title names who is asking, each question shows its short label, every option is a full-width row, and writing your own answer is an **Other** choice that opens a text field. The questions now line up with the dialog's title and buttons.
- Provider updates prevent overlapping installers and reconnect automatically after running turns finish.
- Claude Code commands in the working log show the command they ran instead of "Ran a command", as Codex commands do. PowerShell commands on Windows are shown as commands too, and a command no longer appears a second time with a "Subagent" label.
- Claude's thinking appears in the working log as summarized text between steps instead of a collapsed "Reasoning" row. Codex and Cursor thinking is shown the same way when they report it.

- Malformed provider messages and stored approvals now report decoding errors with field paths instead of being treated as empty objects or trusted without validation.
- The remote workspace identifies its runtime as Web in Settings › About.
- When a Cursor model cannot write a commit message or a thread title, the failure shows right away. Before, the commit message button waited 75 seconds before reporting it.
- Files that Cursor edits show only the lines that changed, and files it creates show their contents. Before, an edit showed the whole file removed and added again, and a new file showed patch markers as if they were its text.
- Error messages from Git, files, and commit message generation no longer start with "Error:".
- When an MCP server fails to start in a Codex turn, the transcript no longer shows a "The provider reported an error" card with an "Invalid mcpServer/startupStatus/updated payload" message. Codex messages that report an error as plain text, such as MCP server status, MCP and account sign-in results, and Windows sandbox setup, are now read correctly.

### Changed

- MeldShell opens on a branded launch screen while it loads your threads and connects to Codex, Claude Code, and Cursor, then fades into the app once they are ready, instead of showing the app while providers are still connecting. Each enabled provider's icon lights up as it connects. A provider that has not answered after 12 seconds no longer holds the app back. Reduce motion turns the animation off.
- Showing or hiding a thread's terminal or browser preview slides the panel open and shut, as the sidebars do, instead of switching instantly. Reduce motion turns the animation off.
- The composer blends into the workbench in both themes with a faint surface tint, no backdrop blur or drop shadow, and a softer focus border without an outer ring.
- Updated dependencies across the desktop app, remote site, account worker, and providers. Mermaid 12 also adds support for its new diagram types while keeping existing diagrams' layout and appearance.
- Collapsing the inbox now leaves a narrow strip of its icons instead of hiding it. New thread, search, the workspace picker, and Settings stay where they were. Each thread shows as a tile with two letters from its title, such as "FL" for "Fix the login redirect", so threads can be told apart. A badge on the tile's corner shows what the thread is doing: a spinner while it runs, an alert when it needs approval, a cross when it failed, a blue dot when it finished while you were away, and an hourglass while queued. Hovering a thread shows its full title, its state, and how long ago it was updated. Threads sit closer together in the strip, so more of them fit. The New thread button's label is now left-aligned so its icon stays put.
- On macOS and Linux, stopping or restarting Codex, Claude Code, or Cursor also stops the processes they started, such as running commands, as it already did on Windows.
- The Windows installer and Linux AppImage are smaller because they no longer carry extra copies of interface libraries that are already built into the app. The AppImage shrinks from 214 MB to 150 MB.

## [0.10.0] - 2026-09-25

### Added

- Settings › About has a **Nightly builds** switch. Nightly builds are published every hour when MeldShell has changed, ahead of the daily stable release; they are less tested. With the switch on, MeldShell updates to each new nightly. Turning it off returns to the latest stable release on the next check, even though it is older than the nightly in use. An installed nightly build follows nightlies until the switch is turned off.
- In Claude Code and Cursor threads, the composer's permissions menu also chooses a mode. **Agent** makes changes, **Plan** has the agent plan before it changes files, and Cursor also offers **Ask**, which answers without changing files. The menu's button shows Plan or Ask while one is chosen. Codex threads have no modes because Codex does not take a mode from MeldShell. When Claude finishes a plan, it opens for review like Cursor's plans do: **Approve plan** lets Claude start working with the thread's tool permissions and returns the thread to Agent mode, and **Keep planning** keeps it in Plan mode.

### Fixed

- Cursor threads now run in the mode the thread is set to. Before, every Cursor turn ran in Agent mode.

### Changed

- Stable releases are published automatically once a day when there are new changes, and each one is a new minor version.
- The message composer is translucent and blurs the conversation scrolling behind it. With reduced transparency turned on, it keeps a solid background.

## [0.9.0] - 2026-09-24

### Added

- A workspace can define setup and run scripts in a `meldshell.json` file at the root of its repository: `{ "scripts": { "setup": "npm install", "run": "npm run dev" } }`. `run` can also name several commands to choose from, such as `{ "app": "npm run dev", "docs": "npm run docs" }`. MeldShell reads the file from the workspace folder, so it can be committed or kept untracked. Scripts run through `/bin/sh`, or `cmd.exe` on Windows.
- The setup script runs in every new thread worktree as soon as the worktree is created, to install dependencies or copy ignored files such as `.env` that a fresh checkout lacks. The thread's start screen and branch bar show that setup is running, with a spinner, or that it stopped or failed, with its output and actions to stop it or run it again. Messages can be sent once it ends. If MeldShell quits during setup, the thread shows setup as stopped.
- The **Run** button in the title bar starts the run script in the thread's terminal, in its worktree when it has one. With several named run scripts, it opens a menu to choose one, and each starts in its own terminal. Running a script again shows its terminal instead of starting a second copy, or replaces it if the script ended with an error. While a script runs, the Run button shows a green dot, and its menu marks the running scripts and can stop them. The remote web client has no Run button because it has no terminals.
- Scripts and thread terminals receive `MELDSHELL_ROOT_PATH` (the workspace's main checkout), `MELDSHELL_WORKSPACE_PATH` (the folder the thread works in), `MELDSHELL_THREAD_ID`, `MELDSHELL_BRANCH` in a worktree, and `MELDSHELL_PORT`, the first of ten ports assigned to the thread. The port stays the same across restarts and rarely matches another thread's.
- **Open in editor** in the title bar opens the thread's folder, its worktree when it has one, in an editor found on this computer: Visual Studio Code, VS Code Insiders, VSCodium, Cursor, Windsurf, Zed, Sublime Text, or a JetBrains IDE, or in the file manager. Editors are found through the command-line launchers they add to `PATH`. The editor chosen last is listed first, with its shortcut, and the menu says whether it opens the thread's worktree or the workspace folder. The remote web client has no Open in editor button.
- Settings › Keyboard shortcuts lists every shortcut by group and changes one when you select it and press new keys. A shortcut can also be removed or restored to its default, and **Restore all defaults** resets them all. Shortcuts are drawn as keycaps, and the keys held while recording show as they are pressed. Choosing keys that another command uses moves them to the new command, and the row says which command lost its shortcut, with **Undo**. Shortcuts need Ctrl, Alt, or the system key unless they use a function key, and cannot take Escape or the text editing keys Ctrl+A, C, V, X, Y, and Z. Tooltips show the shortcuts you chose.
- New shortcuts: Ctrl+B shows or hides the inbox, Ctrl+Alt+B shows or hides files and changes, and Ctrl+Shift+E opens the thread's folder in the editor used last.
- Each thread has a browser preview beside its conversation. Show it with the globe button in the title bar, a split pane's menu, or Ctrl+Shift+B. It has back, forward, reload, an address bar, developer tools, and a button that opens the page in your browser. A bar under the toolbar shows that a page is loading, and a page that cannot load explains why, such as nothing answering at its address or an untrusted certificate. When a thread's terminal prints a local address, such as Vite's `http://localhost:5173/`, the preview offers it in the address bar's server menu, opens it if no page is chosen yet, and switches to it if the current page cannot be reached. Otherwise it suggests `http://localhost:` followed by the thread's `MELDSHELL_PORT`. Links that open a new window open in your browser instead. Preview pages keep their cookies and storage apart from MeldShell's and reload when you return to their thread. The remote web client has no preview.
- Prompts can be scheduled. The alarm clock in a thread's composer schedules the draft to be sent to that thread once at a chosen time, every few minutes or hours (at most every 5 minutes), or daily at a time of day on chosen weekdays. MeldShell sends it with the thread's current model and settings, as if typed into the composer, so a busy thread queues it. The schedule dialog shows when the prompt will first run as you choose. The thread shows a one-line summary of its scheduled prompts above the composer that opens into the full list, and inbox rows show an alarm clock for threads with a prompt still to run. Settings › Scheduled prompts lists them all by thread, with when each runs next, whether its last run could be sent, and a button to open the thread. One-time prompts that were sent stay only in Settings. Each can be paused, resumed, edited, or deleted. Scheduled prompts run only while MeldShell is running; a run missed while it was closed happens once when it next starts. Daily times follow this computer's time zone. Attachments are not scheduled. Deleting a thread deletes its schedules.
- Inbox rows have an archive button beside their menu, or a restore button for archived threads. Ctrl+E archives the thread in front, or returns it to the inbox if it is archived. After a thread is archived, a notice offers **Undo** for a few seconds.

### Changed

- Sending a message to an archived thread returns it to the inbox, as does a scheduled prompt that runs in one, so new results are not filed away unseen.
- The **Archived** section of the inbox starts collapsed, and archived titles are dimmer than inbox titles. When no threads are left in the inbox, it says you are caught up and offers a new thread. Beside pinned or archived threads, the rest are headed **Inbox**.
- Inbox threads that need you stand out like unread mail: a thread waiting for approval, one that failed, or one that finished while you were elsewhere shows its title in full brightness with a colored bar on its left edge.
- Settings › About no longer lists keyboard shortcuts; they are in Settings › Keyboard shortcuts. Shortcuts now match their exact keys, so Ctrl+Shift+K no longer opens thread search as Ctrl+K does. The inbox's search hint shows the thread search shortcut you chose.

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

[Unreleased]: https://github.com/nonlooped/meldshell/compare/v0.14.0...HEAD
[0.14.0]: https://github.com/nonlooped/meldshell/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/nonlooped/meldshell/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/nonlooped/meldshell/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/nonlooped/meldshell/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/nonlooped/meldshell/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/nonlooped/meldshell/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/nonlooped/meldshell/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/nonlooped/meldshell/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/nonlooped/meldshell/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/nonlooped/meldshell/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/nonlooped/meldshell/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nonlooped/meldshell/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nonlooped/meldshell/releases/tag/v0.2.0
