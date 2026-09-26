# MeldShell

MeldShell is a local desktop workbench for running concurrent coding-agent conversations across workspace folders. It integrates Codex, Claude Code, and Cursor through their installed runtimes.

Each MeldShell thread keeps a separate native session for each harness. Switching back resumes that harness's history; messages from other harnesses are not transferred.

## What it provides

- A searchable inbox, thread tabs, split panes, and per-thread activity.
- Streaming conversations, tool details, approvals, questions, attachments, and queued follow-ups.
- SQLite history, durable queues, worker recovery, and native session resume.
- Workspace files, file previews, diffs, Git staging, commits, push, and history.
- Per-thread Git worktrees, with setup and run scripts from `meldshell.json`, and per-thread terminals.
- A per-thread browser preview, Open in editor, scheduled prompts, and customizable keyboard shortcuts.
- Provider catalogs, account usage where available, and appearance preferences.
- Remote browser access to a linked desktop or headless host, with host folder browsing, terminals, and run scripts. Linked desktops also support interactive host browser previews, updates, and administration.

Windows 11 x64 NSIS and Linux x64 AppImage are the configured release targets. Windows uses acrylic; Linux uses a solid backdrop. Release targets and implemented features do not imply completed certification. See the [release checklist](docs/release.md).

On Windows, choose **Windows (native)** or **WSL (Linux)** in **Settings → General → Execution environment**. Windows mode runs everything locally without WSL; WSL mode keeps the app on Windows and runs agents, Git, terminals, and thread storage in Linux. Switching restarts the app and keeps each environment’s data separate. See the [Windows and WSL setup guide](docs/wsl.md).

## Run from source

Use Node.js 24 or newer:

```sh
npm install
npm run dev
```

Installation downloads Electron and rebuilds SQLite for Electron's Node ABI. Install and authenticate the coding runtimes separately; MeldShell does not bundle them. Provider settings show connection status and a refresh action.

See [Contributing](CONTRIBUTING.md) for development checks and [Release](docs/release.md) for packaging.

## Documentation

| Task | Reference |
| --- | --- |
| Change processes, storage, IPC, or recovery | [Host](packages/host/src/host.ts), [contracts](packages/contracts/src/ipc.ts) |
| Work on provider behavior | [Provider packages](packages) |
| Change desktop UI or transcript output | [Renderer styles](packages/ui/src/app/styles.css), [Markdown renderer](packages/ui/src/ui/Markdown.tsx) |
| Build or deploy the site | [Pages configuration](apps/site/wrangler.jsonc), [account worker](apps/control/wrangler.jsonc) |
| See what changed between versions | [Changelog](CHANGELOG.md) |
| Work as an agent | [AGENTS.md](AGENTS.md) |
