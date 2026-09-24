import assert from "node:assert/strict"
import { test } from "node:test"
import { cursorCommands } from "./skills.ts"

test("labelled Cursor commands become skills and keep their SKILL.md path", () => {
  const commands = cursorCommands(
    [
      { name: "copy-request-id", description: "Copy the last request ID to clipboard" },
      { name: "simplify", description: "Find low-info comments. (global)", argumentHint: "scope" },
      { name: "create-rule", description: "Create Cursor rules. (builtin skill)" },
      { name: "pdf", description: "Work with PDF files. (user skill)" },
    ],
    [
      {
        kind: "skill",
        name: "pdf",
        description: "Work with PDF files.",
        path: "/home/u/.claude/skills/pdf/SKILL.md",
      },
      {
        kind: "skill",
        name: "local",
        description: "A workspace skill",
        path: "/w/.cursor/skills/local/SKILL.md",
      },
    ],
  )
  assert.deepEqual(commands, [
    {
      kind: "command",
      name: "copy-request-id",
      description: "Copy the last request ID to clipboard",
    },
    {
      kind: "command",
      name: "simplify",
      description: "Find low-info comments. (global)",
      argumentHint: "scope",
    },
    { kind: "skill", name: "create-rule", description: "Create Cursor rules." },
    {
      kind: "skill",
      name: "pdf",
      description: "Work with PDF files.",
      path: "/home/u/.claude/skills/pdf/SKILL.md",
    },
    {
      kind: "skill",
      name: "local",
      description: "A workspace skill",
      path: "/w/.cursor/skills/local/SKILL.md",
    },
  ])
})
