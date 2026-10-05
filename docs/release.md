# Releasing MeldShell

Use this guide to publish a desktop release, prepare an installer candidate, or understand update delivery. For a routine code or documentation change, use [Contributing](../CONTRIBUTING.md#choose-checks-by-impact). For the site and account service, use [deployment](deployment.md).

## Choose the release path

The [Release workflow](../.github/workflows/release.yml) owns packaging and publishing. Its [release script](../scripts/release.mjs) owns eligibility, version changes, and release notes.

| Path | When it runs | Result |
| --- | --- | --- |
| Stable | Daily, when Unreleased contains entries; also available manually | Next minor version, release commit and tag, public latest release |
| Nightly | After successful main-push CI and on an hourly schedule when eligible; also available manually | Prerelease for the upcoming minor version; no version commit |
| Build-only | Manual, from the selected ref | Installer workflow artifacts without a tag or publication |

The workflow defines exact schedules and artifact retention. Automatic nightlies require application changes since the nearest release tag and at least 30 minutes since that release. Documentation and workflow changes alone do not trigger them. CI-triggered nightlies skip a commit superseded on `main`.

For a manual run, open **Actions → Release → Run workflow** and choose the channel. Stable and nightly releases require `main`; build-only accepts another ref. **Cut a nightly even when no app files changed** bypasses the change requirement for a manual nightly, but cannot reuse an existing timestamped tag.

Publishing requires full CI evidence for the source commit and successful packaging on Windows and Linux. A successful main-push CI run is reused; otherwise the workflow invokes CI. This automated evidence does not establish that every manual scenario below was tested. CI monitoring by an agent follows [AGENTS.md](../AGENTS.md#verification).

## Changelog and versions

The [changelog policy](../AGENTS.md#changelog-and-releases) determines which changes need entries. Write those entries for users under `## [Unreleased]`, using the existing Added, Changed, Fixed, or other applicable group.

Stable releases move Unreleased entries into a dated version section, update the root and desktop manifests and their lockfile entries, and publish `vX.Y.Z`. The current policy increments the minor version. Nightlies use `vX.Y.0-nightly.YYYYMMDDHHMM` for the next minor release and set that version only in the build.

Leave version edits and released changelog sections to the release tooling. Changing the version policy itself belongs in the script and its [tests](../tests/release-cli.test.mjs).

## Remote service cutover

If a desktop change requires new account API or relay behavior, deploy compatible services before publishing that desktop. Follow [Deploying remote services](deployment.md) for the Worker, database, Pages configuration, and evidence of a working deployment. A static site build does not establish API or relay compatibility.

## Build and assemble

Use this path when installer or runtime behavior needs an actual candidate. A release-workflow edit alone does not require a local candidate.

Build on the target platform using the normal development installation. The configured artifacts are Windows x64 NSIS and Linux x64 AppImage:

```sh
npm run package:win
```

or, on Linux:

```sh
npm run package:linux
```

Each command builds before packaging. Output goes to the repository's `release/` directory. [electron-builder.yml](../apps/desktop/electron-builder.yml) defines packaged files and native resources.

For full local candidate certification, select automated checks covering the candidate's changes and platform. Existing CI evidence for the same source can supply the repository checks; do not rerun an unrelated suite merely because an installer was produced. Desktop journeys need a desktop build and follow the [journey guide](../tests/e2e/README.md).

Inspect the packaged runtime where relevant: SQLite comes from Node; the terminal and ONNX native libraries need disk-accessible resources; Windows includes the WSL host payload. Agent CLIs are discovered on the user's machine rather than shipped as the app's provider runtime.

Keep installers, blockmaps, and updater metadata from the same build together. The workflow verifies artifacts, adds SHA-256 checksums and nightly channel metadata when needed, uploads a draft, then publishes it. Installed updaters need publicly accessible release assets.

## Manual candidate evidence

Choose cases affected by the change and the platforms being claimed. Use disposable workspaces and a separate app profile. Agent execution of manual or UI checks follows the repository verification policy; authenticated provider work can consume account quota.

| Area | Evidence to record |
| --- | --- |
| Installation and native resources | App starts from the packaged artifact, storage opens, terminal process runs, applicable native features load, uninstall preserves intended user data |
| Providers | For each affected harness: discovery and unavailable states, a real turn, permissions or questions, cancellation, and native session resume |
| Durability and isolation | Restart preserves history and queued input; interruption is represented accurately; one provider's failure does not break siblings or replay uncertain submissions |
| Shared desktop and browser behavior | Affected flows work in the intended client; desktop-only capabilities remain explicit |
| Remote service | Account and device isolation, linking, command routing, reconnect, and revocation for affected flows |
| Workspaces and tools | Files, Git, worktrees, scripts, and terminals act on the selected host and thread location |
| Windows and WSL | Applicable setup, switching, path translation, and recovery cases from the [WSL guide](wsl.md#develop-or-verify-the-integration) |
| Presentation and updates | Affected keyboard, theme, layout, transcript, or update-channel behavior on the relevant platform |

Record source commit and local changes, artifact name and SHA-256, OS and provider versions, checks performed, and observed results. Mark skipped or failing cases explicitly. A local build's results apply to that artifact; a rebuilt or published installer needs its own evidence for artifact-specific claims.

## Updates and failed releases

Installed builds check GitHub Releases periodically. **Settings → App & updates → Release channel** selects Stable or Nightly. A nightly install defaults to Nightly; selecting Stable permits returning to the latest stable release. The [updater](../apps/desktop/src/main/updater.ts) owns timing, channel persistence, and availability.

A checks or packaging failure prevents publication. A later failure can leave a tag, release commit, or unpublished draft, so inspect the failed stage before retrying. The workflow can reuse a pushed tag and replace assets on a draft, but refuses to overwrite a published release. A stable release push also fails if `main` advanced beyond the commit it prepared.

Scheduled runs skip a commit already recorded as a failed release for that channel. A new commit or an explicit rerun/manual run can retry. Use the workflow's plan reason and failed stage to distinguish an intentional skip from an error.
