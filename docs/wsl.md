# Windows and WSL

The Windows MeldShell app offers **Windows (native)** and **WSL (Linux)** modes in **Settings → General → Execution environment**. Choose a mode, then **Restart and switch**. Restarting closes terminals and interrupts any running agent turns after confirmation. Threads, settings, provider sign-ins, and remote-account identity stay separate in each environment; switching back restores access to that environment’s data. No history is moved or merged.

New installations default to Windows mode, where agents, tools, Git, editors, and terminals run directly on Windows without WSL. Native terminals use PowerShell (with Command Prompt as a fallback). Existing installations with a saved WSL distribution or `MELDSHELL_WSL_DISTRO` retain WSL mode until you choose otherwise. The mode is saved in `environment.json` in the Windows user-data directory; an explicit Windows choice takes precedence over the distribution environment variable.

In WSL mode, MeldShell runs its host in one selected WSL distribution. Codex, Claude Code, Cursor CLI, their tools and MCP servers, Git, worktrees, setup scripts, terminals, and development servers run there. MeldShell does not automatically fall back to Windows tools when WSL is unavailable. The Linux desktop continues to run its host locally.

## Set up the distribution

Install WSL and your preferred distribution using [Microsoft's installation guide](https://learn.microsoft.com/windows/wsl/install). Inside that distribution, install:

- Linux Node.js 24 or newer and npm, available in an interactive Bash login shell.
- Python 3, make, and a C++ compiler for the Linux terminal addon. On Ubuntu or Debian these are provided by `python3` and `build-essential`.
- Git and whichever agent CLIs you use. Sign in to each CLI inside WSL.

MeldShell uses the distribution's default Linux user and its Bash startup files. Linux-side CLI overrides and credentials belong in that environment. The desktop does not forward Windows credential or provider environment variables. Mounted Windows PATH entries under `/mnt/<drive>` are removed from the host's PATH to avoid discovering Windows tool installations. MeldShell does not change WSL's system-wide interoperability settings or prevent commands you explicitly configure from invoking Windows programs.

Select WSL mode and restart, then choose the distribution if one has not been saved. First launch copies the matching host from the installed app into WSL, downloads locked runtime dependencies, and builds the terminal addon. Internet access is needed for this step. Later launches reuse the prepared host; changed host code or Node ABI gets a new installation and removes the previous ones. No account or network listener is needed for the desktop connection.

If setup fails, the error dialog offers retry, another distribution, **Use Windows**, or quit. **Use Windows** explicitly saves Windows mode and restarts with the native host; there is no automatic fallback. To select a different distribution on a later launch, set the Windows environment variable `MELDSHELL_WSL_DISTRO` to its exact name, or remove `wsl.json` from MeldShell's Windows user-data directory while the app is closed to choose again. In WSL mode, the override takes precedence over the saved distribution choice. Each distribution has separate threads, settings, and provider sessions.

## Projects, files, and tools in WSL

The folder and attachment pickers start in the selected Linux user's home through `\\wsl.localhost\<distribution>`. Both `\\wsl.localhost` and `\\wsl$` paths are accepted. A selection from another distribution is rejected. Local Windows drive paths are translated by that distribution's `wslpath`, so custom mount locations work. Prefer projects under `/home/<user>` for Linux filesystem performance; see [Microsoft's filesystem guidance](https://learn.microsoft.com/windows/wsl/filesystems).

File references and provider payloads use Linux paths. Agent configuration, credentials, and sessions are read from the Linux home. Terminals use Linux PTYs and `$SHELL`; their run scripts receive Linux workspace and worktree paths. Editors are discovered and launched in Linux. A Linux GUI editor or file manager may require WSLg. Windows editors are not launched by MeldShell's editor action.

Windows browser previews can usually reach Linux development servers through `localhost`. If a preview fails, check the server and your [WSL networking configuration](https://learn.microsoft.com/windows/wsl/networking); MeldShell does not change firewall or WSL networking settings.

## Data and recovery

Windows mode uses the existing database and remote-account identity in the Windows app user-data directory (or `MELDSHELL_DATA_DIR`, if configured), along with provider credentials in the Windows environment. Switching back to Windows makes pre-WSL Windows history available again.

The database and remote-account identity live under `~/.local/share/meldshell` in WSL. Set `MELDSHELL_WSL_DATA_DIR` in the Linux startup environment to use another absolute Linux directory. The headless host (`npm run host`) defaults to the same directory; do not run both against one database at the same time. Give the headless host its own `--data-dir` inside that distribution. Host installations are cached under `~/.cache/meldshell/hosts`; a cache unused for 14 days is removed the next time MeldShell prepares a new one. Existing Windows databases are left in place and are not automatically migrated or merged with Linux history. Back up the WSL data directory when the app is closed.

Closing MeldShell stops its Linux host, agents, and terminals. It does not shut down the distribution or stop unrelated WSL programs. If WSL stops or the connection breaks, terminals report an exit and in-flight requests fail. Requests are never automatically resent: check the thread before retrying a prompt. The next connection starts the host again and uses the existing durable-state recovery. Provider credentials and the chosen distribution are not reset.

## Development and verification

On Windows, `npm run dev` and `npm run build` prepare the WSL host payload; other platforms skip it unless `MELDSHELL_BUILD_WSL_HOST=1` is set. `npm run build:wsl-host --workspace=@meldshell/desktop` rebuilds just that payload. Its three external runtime dependencies are pinned in `apps/host/runtime/package.json` and its lockfile; keep those versions aligned with the workspace dependencies when updating them.

CI's "Test the bundled WSL host" step in [ci.yml](../.github/workflows/ci.yml) installs the built payload the way the bootstrap does and runs `tests/wsl-host.test.ts` against it, including a Linux PTY. Run the same commands locally to reproduce it. Manual Windows validation should still cover first launch, a project with spaces and non-ASCII characters, a real provider turn and interruption, an isolated worktree with setup/run scripts, terminal resize and Ctrl+C, attachments, Linux editor launch, WSL shutdown during work, app restart, and clean app shutdown. Automated pipe and path tests do not certify Windows/WSL integration.
