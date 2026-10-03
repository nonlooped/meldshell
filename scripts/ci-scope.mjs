import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync, readdirSync } from "node:fs"
import { pathToFileURL } from "node:url"

export function workspaces() {
  return ["apps", "packages"].flatMap((root) =>
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const path = `${root}/${entry.name}`
        const manifest = JSON.parse(readFileSync(`${path}/package.json`, "utf8"))
        return { path, ...manifest }
      }),
  )
}

export function selectChecks(files, full = false, entries = workspaces()) {
  const global =
    full ||
    files.some((path) =>
      [
        "package.json",
        "package-lock.json",
        ".npmrc",
        "tsconfig.base.json",
        "e2e.config.ts",
        ".github/workflows/ci.yml",
        "scripts/ci-scope.mjs",
        "tests/ci-scope.test.mjs",
      ].includes(path),
    )
  const source = files.filter((path) => !path.endsWith(".md") && !path.startsWith("docs/"))
  const affected = new Set(
    entries
      .filter((entry) => global || source.some((path) => path.startsWith(`${entry.path}/`)))
      .map((entry) => entry.name),
  )
  // Include transitive consumers: UI/projection changes affect both renderer builds.
  let size
  do {
    size = affected.size
    for (const entry of entries) {
      const dependencies = { ...entry.dependencies, ...entry.devDependencies }
      if (Object.keys(dependencies).some((name) => affected.has(name))) affected.add(entry.name)
    }
  } while (size !== affected.size)
  const selected = entries.filter((entry) => affected.has(entry.name))
  const releaseTests = ["tests/changelog.test.ts", "tests/release-cli.test.mjs"]
  const release =
    global ||
    files.some((path) =>
      [
        ".github/workflows/release.yml",
        "scripts/release.mjs",
        "tests/changelog.test.ts",
        "tests/release-cli.test.mjs",
        "CHANGELOG.md",
      ].includes(path),
    )
  const rootTests =
    global ||
    selected.some(
      (entry) =>
        entry.path.startsWith("packages/") || ["apps/desktop", "apps/host"].includes(entry.path),
    ) ||
    source.some(
      (path) =>
        (path.startsWith("tests/") || path.startsWith("scripts/")) &&
        path !== "scripts/release.mjs" &&
        !releaseTests.includes(path),
    )
  const tests = rootTests
    ? [
        "tests/ci-scope.test.mjs",
        "tests/markdown-blocks.test.ts",
        "tests/onboarding.test.ts",
        "tests/dictation.test.ts",
        "tests/pull-requests.test.ts",
        "tests/review-notes.test.ts",
        ...releaseTests,
      ]
    : release
      ? releaseTests
      : []
  const desktop = affected.has("@meldshell/desktop")
  const e2e = global || selected.length > 0 || source.some((path) => path.startsWith("tests/e2e/"))
  return {
    static:
      global ||
      selected.length > 0 ||
      source.some((path) => /\.(?:[cm]?[jt]sx?|jsonc?|css|html)$/.test(path)) ||
      source.includes(".editorconfig"),
    protocol: global || source.some((path) => path.startsWith("packages/provider-codex/")),
    desktop,
    e2e,
    site: affected.has("@meldshell/site"),
    windows: global || desktop || affected.has("@meldshell/headless") || rootTests || release,
    test: tests.length > 0,
    typechecks: selected.filter((entry) => entry.scripts?.typecheck).map((entry) => entry.name),
    tests,
  }
}

export function changedFiles(event, eventName) {
  let range
  if (eventName === "pull_request") {
    range = `${event.pull_request.base.sha}...${event.pull_request.head.sha}`
  } else if (eventName === "push" && event.before && !/^0+$/.test(event.before)) {
    range = `${event.before}..${event.after}`
  } else return null
  // Disable rename detection so both old and new directories receive coverage.
  return execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", range], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
}

function main() {
  const mode = process.argv[2]
  if (mode === "typecheck" || mode === "test") {
    const scope = JSON.parse(process.env.CI_SCOPE)
    const npm = process.platform === "win32" ? "npm.cmd" : "npm"
    const runNpm = (args) =>
      execFileSync(npm, args, { stdio: "inherit", shell: process.platform === "win32" })
    if (mode === "typecheck") {
      for (const workspace of scope.typechecks)
        runNpm(["run", "typecheck", `--workspace=${workspace}`])
    } else {
      // The selector's JavaScript-only checks run before dependencies are installed.
      const loader = scope.tests.some((file) => file.endsWith(".ts")) ? ["--import", "tsx"] : []
      if (scope.tests.length)
        execFileSync(process.execPath, [...loader, "--test", ...scope.tests], {
          stdio: "inherit",
        })
    }
    return
  }
  const full = process.env.CI_FULL === "true"
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
  let files = null
  if (!full) {
    try {
      files = changedFiles(event, process.env.GITHUB_EVENT_NAME)
    } catch {
      console.error("Unable to compare revisions; running all checks.")
    }
  }
  const scope = selectChecks(files ?? [], full || files === null)
  const output = Object.entries(scope)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n")
  appendFileSync(process.env.GITHUB_OUTPUT, `${output}\nscope=${JSON.stringify(scope)}\n`)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Selected checks\n\n\`\`\`json\n${JSON.stringify(scope, null, 2)}\n\`\`\`\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
