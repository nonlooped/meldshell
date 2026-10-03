import assert from "node:assert/strict"
import { test } from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect } from "effect"
import { cliResumeCommand, type TurnDispatch } from "@meldshell/contracts"
import {
  findSessionThreads,
  getSnapshot,
  getTranscript,
  importCliSession,
  initializeDatabase,
  resumableSession,
  submitTurn,
} from "@meldshell/core"
import { prepareTranscriptTurns } from "@meldshell/projection"
import { claudeTurns } from "../../provider-claude/src/sessions"
import { importedCodexTurn } from "../../provider-codex/src/sessions"

type SessionMessage = Parameters<typeof claudeTurns>[0][number]

const SESSION = "5b0c6a51-7f0e-4d43-9a39-1f6d8f0b2c11"

const message = (
  type: "user" | "assistant",
  uuid: string,
  timestamp: string,
  body: Record<string, unknown>,
): SessionMessage =>
  ({
    type,
    uuid,
    session_id: SESSION,
    message: { role: type, ...body },
    parent_tool_use_id: null,
    parent_agent_id: null,
    timestamp,
  }) as SessionMessage

/** A Claude Code transcript as the SDK reads it back: an edit, an interrupted turn, and `/model`. */
const transcript: SessionMessage[] = [
  message("user", "u1", "2026-10-01T10:00:00.000Z", { content: "Fix the parser test" }),
  message("assistant", "a1", "2026-10-01T10:00:03.000Z", {
    id: "msg_1",
    model: "claude-sonnet-fixture",
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "toolu_edit",
        name: "Edit",
        input: { file_path: "/repo/src/parser.ts", old_string: "1", new_string: "2" },
      },
    ],
  }),
  message("user", "u2", "2026-10-01T10:00:04.000Z", {
    content: [{ type: "tool_result", tool_use_id: "toolu_edit", content: "Updated." }],
  }),
  message("assistant", "a2", "2026-10-01T10:00:09.000Z", {
    id: "msg_2",
    model: "claude-sonnet-fixture",
    stop_reason: "end_turn",
    content: [{ type: "text", text: "The parser test passes now." }],
  }),
  message("user", "u3", "2026-10-01T10:05:00.000Z", { content: "Now refactor it" }),
  message("user", "u4", "2026-10-01T10:05:02.000Z", {
    content: [{ type: "text", text: "[Request interrupted by user]" }],
  }),
  message("user", "u5", "2026-10-01T10:06:00.000Z", {
    content:
      "<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>opus</command-args>",
  }),
  message("user", "u6", "2026-10-01T10:06:01.000Z", {
    content: "<local-command-stdout>Set model to \u001b[1mopus\u001b[22m</local-command-stdout>",
  }),
]

const results = new Map<string, unknown>([
  [
    "u2",
    {
      filePath: "/repo/src/parser.ts",
      structuredPatch: [
        { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-1", "+2"] },
      ],
    },
  ],
])

test("a Claude Code transcript splits into turns at each message the user typed", () => {
  const turns = claudeTurns(transcript, results)
  assert.deepEqual(
    turns.map((turn) => [turn.text, turn.status, turn.startedAt, turn.completedAt]),
    [
      ["Fix the parser test", "completed", "2026-10-01T10:00:00.000Z", "2026-10-01T10:00:09.000Z"],
      ["Now refactor it", "interrupted", "2026-10-01T10:05:00.000Z", "2026-10-01T10:05:00.000Z"],
      ["/model opus", "completed", "2026-10-01T10:06:00.000Z", "2026-10-01T10:06:01.000Z"],
    ],
  )
  const [first, , command] = turns
  assert.equal(first?.model, "claude-sonnet-fixture")
  const edit = first?.events.find(
    (event) =>
      event.method === "item/completed" &&
      (event.params as { item: { type: string } }).item.type === "fileChange",
  )
  assert.match(JSON.stringify(edit?.params), /@@ -1,1 \+1,1 @@\\n-1\\n\+2/)
  const reply = command?.events.find((event) => event.method === "item/completed")
  assert.equal((reply?.params as { item: { text: string } } | undefined)?.item.text, "Set model to opus")
  assert.deepEqual(
    turns.map((turn) => turn.events.at(-1)?.method),
    ["turn/completed", "turn/completed", "turn/completed"],
  )
})

test("a stored Codex turn plays back as the item notifications Codex sends live", () => {
  const turn = importedCodexTurn(
    "codex-thread",
    {
      id: "turn-1",
      status: "inProgress",
      startedAt: 1_790_848_800,
      completedAt: null,
      items: [
        { type: "userMessage", id: "i1", content: [{ type: "text", text: "Run the tests" }] },
        {
          type: "commandExecution",
          id: "i2",
          command: "npm test",
          commandActions: [],
          cwd: "/repo",
          status: "completed",
          aggregatedOutput: "ok",
        },
        { type: "agentMessage", id: "i3", text: "All green.", phase: "final_answer" },
      ],
    },
    "gpt-fixture",
    "2026-01-01T00:00:00.000Z",
  )
  assert.equal(turn.text, "Run the tests")
  assert.equal(turn.status, "interrupted")
  assert.equal(turn.startedAt, "2026-10-01T10:00:00.000Z")
  assert.deepEqual(
    turn.events.map((event) => event.method),
    ["turn/started", "item/completed", "item/completed", "turn/completed"],
  )
  assert.equal(cliResumeCommand("codex", "abc"), "codex resume abc")
  assert.equal(cliResumeCommand("claude-code", "abc"), "claude --resume abc")
})

const setup = Effect.gen(function* () {
  yield* initializeDatabase
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES ('workspace', '/repo', 'repo', 'now', 'now')`
  const [provider] = yield* sql<{
    id: string
  }>`SELECT id FROM providers WHERE harness = 'claude-code'`
  yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES ('claude-default', ${provider!.id}, 'claude-default', 'Default')`
  yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES ('claude-sonnet', ${provider!.id}, 'claude-sonnet-fixture', 'Sonnet')`
})

test("an imported session becomes a thread whose next turn continues the CLI session", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setup
      const input = {
        workspaceId: "workspace",
        harness: "claude-code" as const,
        nativeThreadId: SESSION,
        history: { title: "Fix the parser test", turns: claudeTurns(transcript, results) },
      }
      const imported = yield* importCliSession(input)
      const thread = imported.snapshot.threads.find(({ id }) => id === imported.threadId)
      assert.equal(thread?.title, "Fix the parser test")
      assert.equal(thread?.lastHarness, "claude-code")
      assert.equal(thread?.turnCount, 3)
      const settings = imported.snapshot.threadSettings.find(
        ({ threadId }) => threadId === imported.threadId,
      )
      // The session's own model is kept when MeldShell offers it.
      assert.equal(settings?.modelId, "claude-sonnet")

      const page = yield* getTranscript({ threadId: imported.threadId })
      const turns = prepareTranscriptTurns(page.events)
      assert.deepEqual(
        turns.map((turn) => turn.userMessages[0]?.text),
        ["Fix the parser test", "Now refactor it", "/model opus"],
      )
      assert.equal(turns[0]?.finalResponse?.text, "The parser test passes now.")
      assert.equal(turns[0]?.durationMs, 9_000)

      // Bringing the same session in again opens the thread that already holds it.
      const again = yield* importCliSession(input)
      assert.equal(again.threadId, imported.threadId)
      assert.equal((yield* getSnapshot).threads.length, 1)
      assert.deepEqual(yield* findSessionThreads("claude-code", [SESSION, "other"]), [
        { nativeThreadId: SESSION, threadId: imported.threadId },
      ])

      assert.deepEqual(yield* resumableSession(imported.threadId), {
        harness: "claude-code",
        nativeThreadId: SESSION,
      })
      const next = yield* submitTurn({ threadId: imported.threadId, text: "Add a test" })
      assert.equal((next.dispatch as TurnDispatch).nativeThreadId, SESSION)
      assert.equal((next.dispatch as TurnDispatch).context, null)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})
