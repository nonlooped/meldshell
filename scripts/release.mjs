// Cuts a MeldShell release: `npm run release -- <patch|minor|major|X.Y.Z>` moves the changelog's
// Unreleased entries under the new version, bumps the app version, commits, and tags.
// `node scripts/release.mjs notes X.Y.Z` prints that version's changelog entries.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const REPOSITORY = "https://github.com/nonlooped/meldshell"
// The app version lives in the root and desktop manifests; other workspaces are unversioned.
const VERSIONED_WORKSPACES = ["", "apps/desktop"]
const STABLE = /^(\d+)\.(\d+)\.(\d+)$/

export function nextVersion(current, bump) {
  const parts = STABLE.exec(current)?.slice(1).map(Number)
  if (!parts) throw new Error(`Current version ${current} is not a stable X.Y.Z version`)
  const [major, minor, patch] = parts
  if (bump === "major") return `${major + 1}.0.0`
  if (bump === "minor") return `${major}.${minor + 1}.0`
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`
  const target = STABLE.exec(bump ?? "")
    ?.slice(1)
    .map(Number)
  if (!target) throw new Error("Pass patch, minor, major, or an X.Y.Z version")
  const order = target[0] - major || target[1] - minor || target[2] - patch
  if (order <= 0) throw new Error(`${bump} must be greater than the current ${current}`)
  return bump
}

/** Splits the changelog into its preamble, `## ` sections, and trailing link definitions. */
function parseChangelog(changelog) {
  const [body, ...rest] = changelog.split(/\n(?=\[Unreleased\]: )/)
  const [preamble, ...sections] = body.split(/\n(?=## )/)
  return { preamble, sections, links: rest.join("\n") }
}

function sectionBody(section) {
  return section.slice(section.indexOf("\n") + 1).trim()
}

export function releaseNotes(changelog, version) {
  const section = parseChangelog(changelog).sections.find((candidate) =>
    candidate.startsWith(`## [${version}] - `),
  )
  const notes = section && sectionBody(section)
  if (!notes) throw new Error(`CHANGELOG.md has no entries for ${version}`)
  return `${notes}\n`
}

/** `previousTag` links the new version to a comparison; untagged history gets a release link. */
export function cutChangelog(changelog, version, date, previousTag = null) {
  const { preamble, sections, links } = parseChangelog(changelog)
  const [unreleased, ...released] = sections
  if (!unreleased?.startsWith("## [Unreleased]")) {
    throw new Error("CHANGELOG.md must start its sections with ## [Unreleased]")
  }
  const entries = sectionBody(unreleased)
  if (!/^- /m.test(entries)) throw new Error("CHANGELOG.md has no Unreleased entries to release")
  const versionLink = previousTag
    ? `${REPOSITORY}/compare/${previousTag}...v${version}`
    : `${REPOSITORY}/releases/tag/v${version}`
  const otherLinks = links.split("\n").filter((line) => line && !line.startsWith("[Unreleased]: "))
  return [
    preamble.trimEnd(),
    "",
    "## [Unreleased]",
    "",
    `## [${version}] - ${date}`,
    "",
    entries,
    "",
    ...released.map((section) => `${section.trimEnd()}\n`),
    `[Unreleased]: ${REPOSITORY}/compare/v${version}...HEAD`,
    `[${version}]: ${versionLink}`,
    ...otherLinks,
    "",
  ].join("\n")
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()

function release(bump) {
  if (git("status", "--porcelain")) throw new Error("Commit or stash local changes first")
  if (git("branch", "--show-current") !== "main") throw new Error("Release from main")

  const current = readJson("package.json").version
  const version = nextVersion(current, bump)
  if (git("tag", "--list", `v${version}`)) throw new Error(`Tag v${version} already exists`)
  const date = new Date().toISOString().slice(0, 10)
  const previousTag = git("tag", "--list", `v${current}`) || null
  writeFileSync(
    "CHANGELOG.md",
    cutChangelog(readFileSync("CHANGELOG.md", "utf8"), version, date, previousTag),
  )

  const lock = readJson("package-lock.json")
  for (const workspace of VERSIONED_WORKSPACES) {
    const manifest = workspace ? `${workspace}/package.json` : "package.json"
    writeJson(manifest, { ...readJson(manifest), version })
    lock.packages[workspace].version = version
  }
  lock.version = version
  writeJson("package-lock.json", lock)

  git("add", "CHANGELOG.md", "package.json", "apps/desktop/package.json", "package-lock.json")
  git("commit", "--quiet", "--message", `chore(release): v${version}`)
  git("tag", "--annotate", `v${version}`, "--message", `MeldShell ${version}`)
  console.log(`Tagged v${version}. Publish with: git push --atomic origin main v${version}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const [command, argument] = process.argv.slice(2)
    if (command === "notes")
      process.stdout.write(releaseNotes(readFileSync("CHANGELOG.md", "utf8"), argument))
    else release(command)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
