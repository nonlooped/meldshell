import assert from "node:assert/strict"
import { test } from "node:test"
import { parsePullRequestDraft, toPullRequest } from "../packages/host/src/pull-requests"

test("a pull request's checks reduce to one state each, failures first", () => {
  const pullRequest = toPullRequest({
    number: 7,
    title: "feat: add things",
    url: "https://github.com/o/r/pull/7",
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    reviewDecision: "CHANGES_REQUESTED",
    latestReviews: [
      { author: { login: "ana" }, state: "CHANGES_REQUESTED" },
      { author: { login: "bo" }, state: "DISMISSED" },
    ],
    mergeable: "CONFLICTING",
    statusCheckRollup: [
      { __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
      { __typename: "CheckRun", name: "test", status: "IN_PROGRESS", conclusion: "" },
      { __typename: "CheckRun", name: "build", status: "COMPLETED", conclusion: "TIMED_OUT" },
      { __typename: "CheckRun", name: "docs", status: "COMPLETED", conclusion: "SKIPPED" },
      { __typename: "StatusContext", context: "deploy", state: "PENDING", targetUrl: "https://x" },
      { __typename: "StatusContext", context: "cla", state: "ERROR" },
    ],
  })
  assert.deepEqual(
    pullRequest.checks.map((check) => `${check.name}:${check.state}`),
    ["build:failed", "cla:failed", "deploy:pending", "test:pending", "lint:passed", "docs:skipped"],
  )
  assert.equal(pullRequest.checks.find((check) => check.name === "deploy")?.url, "https://x")
  assert.equal(pullRequest.state, "open")
  assert.equal(pullRequest.reviewDecision, "changes-requested")
  assert.deepEqual(pullRequest.reviews, [{ author: "ana", state: "changes-requested" }])
  assert.equal(pullRequest.conflicts, true)
})

test("draft, merged, and closed pull requests keep their state", () => {
  const base = { number: 1, title: "t", url: "u", statusCheckRollup: null, reviewDecision: "" }
  assert.equal(toPullRequest({ ...base, state: "OPEN", isDraft: true }).state, "draft")
  assert.equal(toPullRequest({ ...base, state: "MERGED", isDraft: true }).state, "merged")
  assert.equal(toPullRequest({ ...base, state: "CLOSED" }).state, "closed")
  assert.equal(toPullRequest({ ...base, state: "OPEN" }).reviewDecision, null)
})

test("a generated draft splits into its title line and description", () => {
  assert.deepEqual(parsePullRequestDraft("feat: add PRs\n\nBefore: none.\n\nAfter: some."), {
    title: "feat: add PRs",
    body: "Before: none.\n\nAfter: some.",
  })
  assert.deepEqual(
    parsePullRequestDraft('```markdown\n# Title: "Add PRs"\n\n**Description:** It adds them.\n```'),
    { title: "Add PRs", body: "It adds them." },
  )
  assert.deepEqual(parsePullRequestDraft("\n\nJust a title\n"), { title: "Just a title", body: "" })
  assert.throws(() => parsePullRequestDraft("   "))
})
