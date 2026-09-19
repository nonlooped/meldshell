# MeldShell

MeldShell is a local Agentic Development Environment for running many coding-agent threads across many workspace folders from one Windows desktop application.

It integrates OpenAI Codex through `codex app-server`, Claude Code through the Anthropic Agent SDK, and Cursor through ACP. Each provider keeps a separate native session within a MeldShell thread. Switching providers resumes that provider's history; it does not transfer the other provider's context.

## Project documents

- [Product and roadmap](docs/roadmap.md)
- [System architecture](docs/architecture.md)
- [Interface design](docs/design.md)
- [Release checklist](docs/release.md)
- [0.1.0 release candidate](docs/releases/0.1.0.md)
- [Contributing](CONTRIBUTING.md)
- [Agent instructions](AGENTS.md)
- [Agent documentation maintenance](docs/agent-documentation.md)

## Development status

The 0.1 MVP implementation includes:

- Electron desktop shell
- Effect application services
- React 19 with React Compiler
- Base UI primitives with a MeldShell-owned monochrome visual system
- Windows acrylic backdrop
- Supervised Codex, Claude Code, and Cursor integrations in separate worker processes
- Streaming transcripts, structured tool activity, approvals, interruption, and retry
- Durable queued turns with crash recovery
- File, image, and skill attachments
- Cursor-loaded thread history and virtualized transcripts
- Windows background notifications and an unsigned per-user NSIS installer

## Claude Code

Choose a Claude model in the composer. Connection details and a retry button are available under Settings > Providers > Claude. The SDK uses your Claude Code sign-in or configured API credentials. See [Claude integration](docs/claude-provider.md) for supported features and current gaps.

## Commands

```sh
npm install
npm run dev
npm run typecheck
npm run build
npm run check
npm run package:win
```

`npm install` uses Electron's installer CLI and Electron Rebuild to fetch the desktop runtime and compile SQLite for Electron's Node ABI. MeldShell discovers `codex` on `PATH`. The Claude Agent SDK bundles its native Claude Code executable.

Windows 11 on x64 is the only supported MVP target. Other platforms are not intentionally blocked, but they are not release targets.
