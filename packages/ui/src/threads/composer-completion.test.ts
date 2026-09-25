import assert from "node:assert/strict"
import { test } from "node:test"
import {
  applyCompletion,
  completionTrigger,
  filterCommands,
  pathMention,
  skillAttachments,
  tokenRanges,
} from "./composer-completion"

test("an @ token anywhere completes workspace paths", () => {
  const text = "compare @src/ma and b"
  assert.deepEqual(completionTrigger(text, 15), {
    kind: "path",
    start: 8,
    end: 15,
    query: "src/ma",
  })
  assert.equal(completionTrigger("email@example", 13), null)
})

test("a slash completes commands only at the start of a message", () => {
  assert.deepEqual(completionTrigger("  /rev", 6), {
    kind: "command",
    start: 2,
    end: 6,
    query: "rev",
  })
  assert.equal(completionTrigger("run /review", 11), null)
  assert.equal(completionTrigger("/usr/bin", 8), null)
})

test("completion replaces the whole token and reuses following whitespace", () => {
  const text = "look at @sr please"
  const trigger = completionTrigger(text, 10)!
  assert.deepEqual(applyCompletion(text, trigger, "@src/main.ts "), {
    text: "look at @src/main.ts please",
    caret: 21,
  })
  const end = completionTrigger("@sr", 3)!
  assert.deepEqual(applyCompletion("@sr", end, "@src/"), { text: "@src/", caret: 5 })
})

test("paths with spaces are quoted", () => {
  assert.equal(pathMention("docs/my notes.md"), '@"docs/my notes.md"')
  assert.equal(pathMention("src/"), "@src/")
})

test("a dollar sign anywhere completes skills", () => {
  assert.deepEqual(completionTrigger("use $pd", 7), {
    kind: "skill",
    start: 4,
    end: 7,
    query: "pd",
  })
})

test("pills match only accepted tokens standing alone, and commands only first", () => {
  const tokens = [
    { kind: "path", text: "@src/main.ts" },
    { kind: "command", text: "/review" },
    { kind: "skill", text: "$pdf", skill: "/skills/pdf/SKILL.md" },
  ] as const
  const text = "/review @src/main.ts and @src/main.tsx with $pdf then /review"
  assert.deepEqual(
    tokenRanges(text, tokens).map((range) => text.slice(range.start, range.end)),
    ["/review", "@src/main.ts", "$pdf"],
  )
  assert.deepEqual(skillAttachments(`${text} $pdf`, tokens), [
    { type: "skill", value: "/skills/pdf/SKILL.md", name: "pdf" },
  ])
  assert.deepEqual(skillAttachments("$pdfs", tokens), [])
})

test("commands rank name prefixes before description matches", () => {
  const commands = [
    { kind: "command", name: "compact", description: "Summarize the review so far" },
    { kind: "skill", name: "plugin:review", description: "" },
    { kind: "command", name: "review", description: "" },
  ] as const
  assert.deepEqual(
    filterCommands(commands, "rev").map((command) => command.name),
    ["review", "plugin:review", "compact"],
  )
})
