# Windows and WSL

Use this guide to choose where MeldShell executes work, prepare a WSL distribution, or diagnose the Windows-to-Linux connection.

## Choose an execution environment

In the Windows desktop, open **Settings → App & updates → Execution environment**, choose **Windows (native)** or **WSL (Linux)**, then **Restart and switch**. Switching closes terminals and interrupts active turns after confirmation.

| Mode | Where work runs | State and credentials |
| --- | --- | --- |
| Windows | Native Windows agents, Git, editors, and terminals | Windows app data and provider sign-ins |
| WSL | Linux tools in the selected distribution | That distribution's data and provider sign-ins |

Switching does not move or merge history. Returning to an environment restores access to its threads and settings. The Linux desktop runs its host locally.

New Windows installations default to native mode. A saved choice in `environment.json` takes precedence over distribution hints. Without a saved mode, an existing `wsl.json` choice or `MELDSHELL_WSL_DISTRO` selects WSL. See [environment selection](../apps/desktop/src/main/runtime/environment-settings.ts) for the precedence.

## Prepare WSL

Install a distribution using [Microsoft's WSL installation guide](https://learn.microsoft.com/windows/wsl/install). In that distribution's default user's environment, make these available to an interactive Bash login shell:

- Linux Node.js 24 or newer and npm.
- Python 3, make, and a C++ compiler for the terminal addon.
- Git and the agent CLIs you intend to use, signed in inside Linux.

Select WSL mode and choose the distribution when prompted. First launch copies the matching host payload from the app, installs locked dependencies, and builds the terminal addon. This needs internet access. Subsequent launches reuse a cache identified by payload contents, Node ABI, and architecture. The desktop connection uses process pipes and does not require an account or network listener.

The host uses Linux startup files for tools and credentials. MeldShell clears `WSLENV` when starting the host, except for a development marker in builds run from source, and filters mounted Windows paths under `/mnt/<drive>` from its tool-search PATH. Configure Linux-side tools there; explicitly configured commands can still invoke Windows programs.

## Projects and paths

Prefer projects in the Linux filesystem, such as `/home/<user>/projects`, when using Linux tools. Microsoft's [filesystem guidance](https://learn.microsoft.com/windows/wsl/filesystems) explains the performance tradeoff.

Folder and attachment pickers use the selected distribution's home through `\\wsl.localhost\<distribution>`. MeldShell also accepts `\\wsl$\<distribution>` paths and converts local Windows drive paths with that distribution's `wslpath`. Paths belonging to another distribution are rejected.

Provider payloads, terminals, worktrees, and scripts use Linux paths. Editor actions launch Linux editors; GUI applications may need WSLg. Browser previews depend on the development server and [WSL networking](https://learn.microsoft.com/windows/wsl/networking). MeldShell does not configure the firewall or WSL networking.

## Data and recovery

| Data | Location |
| --- | --- |
| Native host database and remote identity | App user-data directory, overridden by `MELDSHELL_DATA_DIR` |
| Windows mode and distribution selection | `environment.json` and `wsl.json` in app user data |
| WSL host database and remote identity | `~/.local/share/meldshell` (`meldshell-dev` when run from source), overridden by Linux-side `MELDSHELL_WSL_DATA_DIR` |
| Prepared WSL host payloads | `~/.cache/meldshell/hosts` |

The WSL data override must be an absolute Linux path. The standalone headless host defaults to the same Linux data directory, so give it a separate `--data-dir` when running alongside the desktop host. Back up application data while its host is stopped.

Payload caches are separate from conversation data. Preparing a new cache removes other caches unused for more than 14 days; it does not remove all older installations on every launch.

Closing MeldShell stops its host, agents, and terminals without shutting down the distribution. If WSL or its pipe connection stops, pending requests fail and terminals report an exit. Reconnection does not replay requests. Check a thread's state before resubmitting a prompt whose delivery is uncertain.

## Resolve a startup problem

| Symptom | Check or action |
| --- | --- |
| Linux Node or npm is missing | Confirm the selected distribution's default user can find Linux executables from an interactive Bash login shell |
| Terminal addon preparation fails | Install the compiler prerequisites in that distribution and retry |
| The wrong distribution starts | In WSL mode, `MELDSHELL_WSL_DISTRO` overrides the saved distribution; change it or remove `wsl.json` while the app is closed to choose again |
| A distribution hint has no effect | An explicitly saved Windows mode wins; select WSL in Settings first |
| WSL is unavailable | The error dialog offers retry, another distribution, **Use Windows**, or quit; there is no automatic fallback |
| A project or credential appears missing after switching | Check the active environment and its data directory before attempting recovery |

The [WSL launcher](../apps/desktop/src/main/runtime/wsl.ts), [bootstrap](../apps/desktop/src/main/runtime/wsl-bootstrap.ts), and [Linux desktop host](../apps/host/src/desktop.ts) are the implementation references for these behaviors.

## Develop or verify the integration

Windows development and desktop builds prepare the WSL payload. Elsewhere, set `MELDSHELL_BUILD_WSL_HOST=1` to include it. To rebuild only that payload, use `npm run build:wsl-host --workspace=@meldshell/desktop`. Its [build script](../apps/desktop/scripts/build-wsl-host.mjs) checks the pinned runtime dependencies against installed versions.

The [journey suite](../tests/e2e/README.md) exercises the native desktop, not bundled WSL installation or environment switching. For a WSL change, choose manual evidence for the affected path: first preparation, file translation, provider execution, worktree scripts, terminals, or shutdown and reconnect. Record the distribution, Node version, and app artifact used. Follow the repository's [verification policy](../AGENTS.md#verification) for agent-run UI checks.
