import assert from "node:assert/strict"
import { test } from "node:test"
import { issueBranchName, issueBrief, toIssueSummary } from "../packages/host/src/issues"
import { closesIssue, linkIssue } from "../packages/host/src/pull-requests"

const issue = { number: 42, title: "Login redirect loops", url: "https://github.com/o/r/issues/42" }

test("a pull request body closes the thread's issue exactly once", () => {
  assert.equal(linkIssue("Fixes the redirect.", issue), "Fixes the redirect.\n\nCloses #42")
  assert.equal(linkIssue("", issue), "Closes #42")
  assert.equal(linkIssue("Body\n\nfixes #42\n", issue), "Body\n\nfixes #42\n")
  assert.equal(linkIssue("Resolves o/r#42.", issue), "Resolves o/r#42.")
  assert.equal(linkIssue("Body", null), "Body")
  // Mentioning the issue, or closing a different one, is not a link that closes it.
  assert.equal(closesIssue("See #42", 42), false)
  assert.equal(closesIssue("Closes #421", 42), false)
  assert.equal(closesIssue("CLOSED: #42", 42), true)
})

test("an issue becomes a readable branch name", () => {
  assert.equal(issueBranchName(issue), "meldshell/42-login-redirect-loops")
  assert.equal(
    issueBranchName({
      ...issue,
      title: "Crash when the café's “settings” page opens on Windows 11!",
    }),
    "meldshell/42-crash-when-the-cafe-s-settings-page",
  )
  assert.equal(issueBranchName({ ...issue, title: "日本語" }), "meldshell/42")
})

test("the issue brief carries the description, labels, and the latest comments", () => {
  const brief = issueBrief({
    ...issue,
    body: "Signing in sends you back to /login.",
    author: { login: "ana" },
    labels: [{ name: "bug" }, { name: "auth" }],
    comments: Array.from({ length: 12 }, (_, index) => ({
      author: { login: "bo" },
      body: `Comment ${index + 1}`,
    })),
  })
  assert.match(brief, /^This thread works on GitHub issue #42: Login redirect loops/)
  assert.match(brief, /Labels: bug, auth/)
  assert.match(brief, /<issue author="ana">\nSigning in sends you back to \/login\.\n<\/issue>/)
  assert.match(brief, /The latest 10 of 12 comments:/)
  assert.doesNotMatch(brief, /Comment 2\n/)
  assert.match(brief, /Comment 12/)
  assert.match(issueBrief({ ...issue, body: "" }), /\(No description\.\)/)
})

test("issue summaries keep named labels", () => {
  assert.deepEqual(
    toIssueSummary({
      ...issue,
      author: null,
      labels: [{ name: "bug", color: "d73a4a" }, { color: "fff" }],
    }),
    { ...issue, author: "", labels: [{ name: "bug", color: "d73a4a" }], updatedAt: "" },
  )
})
