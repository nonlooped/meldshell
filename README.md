# MeldShell

MeldShell is a local desktop workbench for running concurrent coding-agent conversations across workspace folders. It integrates Codex, Claude Code, and Cursor through their installed runtimes.

Each MeldShell thread keeps a separate native session for each harness. Switching back resumes that harness's history; messages from other harnesses are not transferred.

## What it provides

- A searchable inbox, thread tabs, split panes, and per-thread activity.
- Streaming conversations, tool details, approvals, questions, attachments, and queued follow-ups.
- SQLite history, durable queues, worker recovery, and native session resume.
- Workspace files, file previews, diffs, Git staging, commits, push, and history.
- Provider catalogs, account usage where available, and appearance preferences.

Windows 11 x64 NSIS and Linux x64 AppImage are the configured release targets. Windows uses acrylic; Linux uses a solid backdrop. Release targets and implemented features do not imply completed certification. See the [release checklist](docs/release.md) and [historical candidate record](docs/releases/0.1.0.md).

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
| Understand capabilities and open work | [Roadmap](docs/roadmap.md) |
| Change processes, storage, IPC, or recovery | [Architecture](docs/architecture.md) |
| Work on provider behavior | [Claude](docs/claude-provider.md), [Cursor](docs/cursor-provider.md) |
| Change desktop UI or transcript output | [Design](docs/design.md), [Markdown](docs/markdown-rendering.md) |
| Build or deploy the site | [Website](docs/website.md) |
| Work as an agent | [AGENTS.md](AGENTS.md) |
| Maintain rules and skills | [Documentation maintenance](docs/agent-documentation.md) |
