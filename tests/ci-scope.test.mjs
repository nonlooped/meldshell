import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { changedFiles, selectChecks, workspaces } from "../scripts/ci-scope.mjs"

test("release-only edits select just the two release suites", () => {
  const scope = selectChecks([
    ".github/workflows/release.yml",
    "scripts/release.mjs",
    "tests/changelog.test.ts",
    "tests/release-cli.test.mjs",
    "CHANGELOG.md",
  ])
  assert.equal(scope.static, true)
  assert.equal(scope.desktop, false)
  assert.equal(scope.site, false)
  assert.equal(scope.e2e, false)
  assert.deepEqual(scope.typechecks, [])
  assert.deepEqual(scope.tests, ["tests/changelog.test.ts", "tests/release-cli.test.mjs"])
})

test("documentation and unrelated automation do not select app checks", () => {
  const scope = selectChecks(["docs/release.md", "AGENTS.md", ".github/dependabot.yml"])
  assert.equal(scope.static, false)
  assert.equal(scope.test, false)
  assert.equal(scope.e2e, false)
  assert.equal(scope.windows, false)
  assert.equal(scope.desktop, false)
  assert.equal(scope.site, false)
})

test("site and control changes stay in their workspace", () => {
  for (const name of ["site", "control"]) {
    const scope = selectChecks([`apps/${name}/src/index.ts`])
    assert.equal(scope.static, true)
    assert.equal(scope.e2e, true)
    assert.equal(scope.desktop, false)
    assert.equal(scope.site, name === "site")
    assert.equal(scope.windows, false)
    assert.equal(scope.test, false)
    assert.deepEqual(scope.tests, [])
    assert.deepEqual(scope.typechecks, [`@meldshell/${name}`])
  }
})

test("shared renderer dependencies select both builds and transitive typechecks", () => {
  const scope = selectChecks(["packages/projection/src/index.ts"])
  assert.equal(scope.desktop, true)
  assert.equal(scope.site, true)
  assert.equal(scope.windows, true)
  assert(scope.typechecks.includes("@meldshell/ui"))
  assert(scope.typechecks.includes("@meldshell/headless"))
  assert(!scope.typechecks.includes("@meldshell/control"))
})

test("provider changes select desktop and headless but not site or control", () => {
  const scope = selectChecks(["packages/provider-codex/schema/protocol.json"])
  assert.equal(scope.protocol, true)
  assert.equal(scope.desktop, true)
  assert.equal(scope.site, false)
  assert(scope.typechecks.includes("@meldshell/headless"))
  assert(!scope.typechecks.includes("@meldshell/control"))
})

test("global inputs, CI machinery, and forced runs select every workspace", () => {
  for (const files of [
    ["package-lock.json"],
    ["e2e.config.ts"],
    ["tsconfig.base.json"],
    [".github/workflows/ci.yml"],
    ["scripts/ci-scope.mjs"],
    ["tests/ci-scope.test.mjs"],
    [],
  ]) {
    const scope = selectChecks(files, files.length === 0)
    for (const key of ["static", "protocol", "desktop", "site", "test", "windows", "e2e"])
      assert.equal(scope[key], true)
    assert.equal(scope.typechecks.length, workspaces().length)
    assert.deepEqual(scope.tests, [
      "tests/ci-scope.test.mjs",
      "tests/markdown-blocks.test.ts",
      "tests/file-previews.test.ts",
      "tests/onboarding.test.ts",
      "tests/dictation.test.ts",
      "tests/claude-provider.test.mts",
      "tests/settings.test.ts",
      "tests/pull-requests.test.ts",
      "tests/issues.test.ts",
      "tests/review-notes.test.ts",
      "tests/side-questions.test.ts",
      "tests/content-search.test.ts",
      "tests/loadouts.test.ts",
      "tests/changelog.test.ts",
      "tests/release-cli.test.mjs",
    ])
  }
})

test("formatting config only selects static analysis; changelog selects release tests", () => {
  assert.equal(selectChecks(["biome.json"]).static, true)
  assert.equal(selectChecks(["biome.json"]).test, false)
  assert.equal(selectChecks([".editorconfig"]).static, true)
  assert.equal(selectChecks(["CHANGELOG.md"]).test, true)
})

test("comparison covers complete pushes, PR merge bases, deletions, and both rename paths", () => {
  const cwd = process.cwd()
  const directory = mkdtempSync(join(tmpdir(), "ci-scope-"))
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim()
  try {
    git("init", "-b", "main")
    git("config", "user.email", "test@example.com")
    git("config", "user.name", "Test")
    mkdirSync(join(directory, "apps/site"), { recursive: true })
    writeFileSync(join(directory, "apps/site/old.ts"), "original\n")
    git("add", ".")
    git("commit", "-m", "base")
    const base = git("rev-parse", "HEAD")
    git("checkout", "-b", "feature")
    mkdirSync(join(directory, "apps/control"), { recursive: true })
    git("mv", "apps/site/old.ts", "apps/control/new.ts")
    git("commit", "-m", "move")
    writeFileSync(join(directory, "extra.ts"), "extra\n")
    git("add", ".")
    git("commit", "-m", "second push commit")
    const head = git("rev-parse", "HEAD")
    git("checkout", "main")
    writeFileSync(join(directory, "main-only.ts"), "main\n")
    git("add", ".")
    git("commit", "-m", "unrelated base change")
    const main = git("rev-parse", "HEAD")
    process.chdir(directory)
    const expected = ["apps/control/new.ts", "apps/site/old.ts", "extra.ts"]
    assert.deepEqual(changedFiles({ before: base, after: head }, "push").sort(), expected)
    assert.deepEqual(
      changedFiles(
        { pull_request: { base: { sha: main }, head: { sha: head } } },
        "pull_request",
      ).sort(),
      expected,
    )
    assert.equal(changedFiles({ before: "0".repeat(40) }, "push"), null)
    assert.equal(changedFiles({}, "workflow_dispatch"), null)
  } finally {
    process.chdir(cwd)
    rmSync(directory, { recursive: true, force: true })
  }
})

test("CLI writes full fallback outputs when the push base is unavailable", () => {
  const directory = mkdtempSync(join(tmpdir(), "ci-output-"))
  try {
    const event = join(directory, "event.json")
    const output = join(directory, "output")
    writeFileSync(event, JSON.stringify({ before: "1".repeat(40), after: "2".repeat(40) }))
    execFileSync(process.execPath, ["scripts/ci-scope.mjs"], {
      env: {
        ...process.env,
        CI_FULL: "false",
        GITHUB_EVENT_NAME: "push",
        GITHUB_EVENT_PATH: event,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: join(directory, "summary"),
      },
      stdio: "pipe",
    })
    const lines = readFileSync(output, "utf8").trim().split("\n")
    const scope = JSON.parse(lines.find((line) => line.startsWith("scope=")).slice(6))
    assert.equal(scope.desktop, true)
    assert.equal(scope.site, true)
    assert.equal(scope.typechecks.length, workspaces().length)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("tooling selection matches the explicit npm script", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"))
  const scope = selectChecks(["packages/host/src/host.ts"])
  assert.deepEqual(scope.tests, scripts["test:tooling"].split(" --test ")[1].split(" "))
})

test("every desktop build selection is covered by e2e", () => {
  for (const entry of workspaces()) {
    const scope = selectChecks([`${entry.path}/src/index.ts`])
    if (scope.desktop) assert.equal(scope.e2e, true, entry.path)
  }
})

test("test CLI runs explicit JavaScript files without installed dependencies and skips empty selections", () => {
  const directory = mkdtempSync(join(tmpdir(), "ci-runner-"))
  try {
    const runner = join(directory, "ci-scope.mjs")
    writeFileSync(runner, readFileSync("scripts/ci-scope.mjs"))
    const file = join(directory, "selected.test.mjs")
    writeFileSync(file, 'import test from "node:test"; test("selected tooling suite", () => {})')
    writeFileSync(join(directory, "unselected.test.mjs"), 'throw new Error("must not run")')
    for (const tests of [[file], []]) {
      const output = execFileSync(process.execPath, [runner, "test"], {
        cwd: directory,
        env: { ...process.env, NODE_TEST_CONTEXT: undefined, CI_SCOPE: JSON.stringify({ tests }) },
        encoding: "utf8",
      })
      if (tests.length) assert.match(output, /selected tooling suite/)
      else assert.equal(output, "")
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
