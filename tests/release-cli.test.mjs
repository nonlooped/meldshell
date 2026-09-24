import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("../scripts/release.mjs", import.meta.url))
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "meldshell-release-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, "work")
  const remote = join(root, "remote.git")
  mkdirSync(cwd)
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  git("init", "--initial-branch=main")
  git("config", "user.name", "Release test")
  git("config", "user.email", "release@example.test")
  git("config", "commit.gpgsign", "false")
  git("config", "tag.gpgsign", "false")
  git("config", "core.hooksPath", join(root, "no-hooks"))
  mkdirSync(join(cwd, "apps/desktop"), { recursive: true })
  for (const path of ["package.json", "apps/desktop/package.json"]) {
    writeFileSync(join(cwd, path), JSON.stringify({ version: "0.1.0" }))
  }
  writeFileSync(
    join(cwd, "package-lock.json"),
    JSON.stringify({
      version: "0.1.0",
      packages: { "": { version: "0.1.0" }, "apps/desktop": { version: "0.1.0" } },
    }),
  )
  writeFileSync(
    join(cwd, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n- A fix.\n\n[Unreleased]: https://example.test\n",
  )
  git("add", ".")
  git("commit", "-m", "Initial")
  git("init", "--bare", remote)
  git("remote", "add", "origin", remote)
  git("push", "origin", "main")
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" })
  return { cwd, remote, git, run }
}

test("preview is read-only and reports the release channel", (t) => {
  const { git, run } = fixture(t)
  const before = git("rev-parse", "HEAD")
  const result = run("patch", "--dry-run", "--push")
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /prerelease/)
  assert.equal(git("rev-parse", "HEAD"), before)
  assert.equal(git("status", "--porcelain"), "")
  assert.equal(git("tag", "--list"), "")
  assert.equal(git("ls-remote", "--tags", "origin"), "")
})

test("push cuts consistent manifests, notes, and an annotated remote tag", (t) => {
  const { cwd, git, run } = fixture(t)
  const result = run("minor", "--push")
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /normal release/)
  assert.equal(git("status", "--porcelain"), "")
  assert.equal(git("cat-file", "-t", "v0.2.0"), "tag")
  assert.equal(
    git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0],
    git("rev-parse", "HEAD"),
  )
  assert.match(git("ls-remote", "--tags", "origin"), /refs\/tags\/v0.2.0/)
  for (const path of ["package.json", "apps/desktop/package.json", "package-lock.json"]) {
    assert.equal(JSON.parse(readFileSync(join(cwd, path))).version, "0.2.0")
  }
  assert.equal(run("notes", "0.2.0").stdout, "- A fix.\n")
})

test("invalid options and unpublished main commits fail before mutation", (t) => {
  const { git, run } = fixture(t)
  assert.match(run("patch", "--psuh").stderr, /Unknown option/)
  git("commit", "--allow-empty", "-m", "Unpublished")
  const before = git("rev-parse", "HEAD")
  assert.match(run("patch", "--push").stderr, /match origin\/main/)
  assert.equal(git("rev-parse", "HEAD"), before)
  assert.equal(git("status", "--porcelain"), "")
  assert.equal(git("tag", "--list"), "")
})

test("rejected push preserves the local release and gives a retry command", (t) => {
  const { remote, git, run } = fixture(t)
  writeFileSync(join(remote, "hooks/pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o755 })
  const remoteBefore = git("ls-remote", "origin", "refs/heads/main")
  const result = run("patch", "--push")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Retry: git push --atomic origin main v0.1.1/)
  assert.equal(git("cat-file", "-t", "v0.1.1"), "tag")
  assert.equal(git("ls-remote", "origin", "refs/heads/main"), remoteBefore)
})

test("local-only release remains available without a remote", (t) => {
  const { git, run } = fixture(t)
  git("remote", "remove", "origin")
  const result = run("patch")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(git("cat-file", "-t", "v0.1.1"), "tag")
  assert.match(result.stdout, /Publish with: git push --atomic origin main v0.1.1/)
})

test("manifest mismatch fails without partially cutting the changelog", (t) => {
  const { cwd, git, run } = fixture(t)
  writeFileSync(join(cwd, "apps/desktop/package.json"), JSON.stringify({ version: "0.0.9" }))
  git("add", ".")
  git("commit", "-m", "Mismatched version")
  const before = git("rev-parse", "HEAD")
  assert.match(run("patch").stderr, /Version mismatch/)
  assert.equal(git("rev-parse", "HEAD"), before)
  assert.equal(git("status", "--porcelain"), "")
})

test("existing remote release tags are rejected before cutting", (t) => {
  const { git, run } = fixture(t)
  git("tag", "v0.1.1")
  git("push", "origin", "v0.1.1")
  git("tag", "--delete", "v0.1.1")
  const before = git("rev-parse", "HEAD")
  assert.match(run("patch", "--push").stderr, /Remote tag v0.1.1 already exists/)
  assert.equal(git("rev-parse", "HEAD"), before)
  assert.equal(git("status", "--porcelain"), "")
  assert.equal(git("tag", "--list"), "")
})
