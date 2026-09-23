import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { cutChangelog, nextVersion, releaseNotes } from "../scripts/release.mjs"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("the app version is consistent and has changelog entries", () => {
  const { version } = JSON.parse(read("package.json"))
  const lock = JSON.parse(read("package-lock.json"))
  assert.equal(JSON.parse(read("apps/desktop/package.json")).version, version)
  assert.equal(lock.packages[""].version, version)
  assert.equal(lock.packages["apps/desktop"].version, version)
  const changelog = read("CHANGELOG.md")
  assert.match(changelog, /^## \[Unreleased\]$/m)
  assert.ok(releaseNotes(changelog, version).trim())
})

test("versions only move forward", () => {
  assert.equal(nextVersion("0.2.3", "patch"), "0.2.4")
  assert.equal(nextVersion("0.2.3", "minor"), "0.3.0")
  assert.equal(nextVersion("0.2.3", "major"), "1.0.0")
  assert.equal(nextVersion("0.2.3", "0.10.0"), "0.10.0")
  assert.throws(() => nextVersion("0.2.3", "0.2.3"), /greater/)
  assert.throws(() => nextVersion("0.2.3", "1.0.0-beta.1"), /X\.Y\.Z/)
})

test("cutting a release moves Unreleased entries under the new version", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "- Something new.",
    "",
    "## [0.1.0] - 2026-01-01",
    "",
    "- First.",
    "",
    "[Unreleased]: https://github.com/nonlooped/meldshell/compare/v0.1.0...HEAD",
    "[0.1.0]: https://github.com/nonlooped/meldshell/releases/tag/v0.1.0",
    "",
  ].join("\n")
  const cut = cutChangelog(changelog, "0.2.0", "2026-02-01", "v0.1.0")
  assert.equal(releaseNotes(cut, "0.2.0"), "### Added\n\n- Something new.\n")
  assert.equal(releaseNotes(cut, "0.1.0"), "- First.\n")
  assert.match(cut, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-02-01\n/)
  assert.match(cut, /^\[Unreleased\]: .+\/compare\/v0\.2\.0\.\.\.HEAD$/m)
  assert.match(cut, /^\[0\.2\.0\]: .+\/compare\/v0\.1\.0\.\.\.v0\.2\.0$/m)
  assert.match(cut, /^\[0\.1\.0\]: .+\/releases\/tag\/v0\.1\.0$/m)
  assert.throws(() => cutChangelog(cut, "0.3.0", "2026-03-01"), /no Unreleased entries/)
})
