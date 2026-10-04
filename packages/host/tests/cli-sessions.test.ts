import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
import {
  cursorSessionSummaries,
  cursorTurns,
  listsSessions,
} from "../../provider-cursor/src/sessions"
import { listPiSessions, readPiSession } from "../../provider-pi/src/sessions"

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
  assert.equal(
    (reply?.params as { item: { text: string } } | undefined)?.item.text,
    "Set model to opus",
  )
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
  assert.equal(cliResumeCommand("cursor", "abc"), "cursor-agent --resume abc")
  assert.equal(
    cliResumeCommand(
      "pi",
      "/home/me/.pi/agent/sessions/--repo--/2026-10-04T00-08-40-111Z_01a1043d.jsonl",
    ),
    "pi --session 01a1043d",
  )
})

/** A session Pi 1.0.1 wrote for a real two-turn run, trimmed, with an abandoned branch added. */
const piSession = [
  {
    type: "session",
    version: 3,
    id: "01a1043d-c7ad-7753-b718-95564259c26f",
    timestamp: "2026-10-04T00:08:40.111Z",
    cwd: "/repo",
  },
  {
    type: "model_change",
    id: "b8e002e3",
    parentId: null,
    timestamp: "2026-10-04T00:08:40.160Z",
    provider: "fixture",
    modelId: "model",
  },
  {
    type: "message",
    id: "f57181e4",
    parentId: "b8e002e3",
    timestamp: "2026-10-04T00:08:40.173Z",
    message: {
      role: "user",
      content: [{ type: "text", text: "Fix the add function" }],
      timestamp: 1791072520171,
    },
  },
  {
    type: "message",
    id: "8c08d889",
    parentId: "f57181e4",
    timestamp: "2026-10-04T00:08:40.234Z",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Let me look at the file." },
        {
          type: "toolCall",
          id: "call_1",
          name: "edit",
          arguments: { path: "math.js", edits: [{ oldText: "a - b", newText: "a + b" }] },
        },
      ],
      provider: "fixture",
      model: "model",
      stopReason: "toolUse",
      timestamp: 1791072520197,
    },
  },
  {
    type: "message",
    id: "4058c42d",
    parentId: "8c08d889",
    timestamp: "2026-10-04T00:08:40.250Z",
    message: {
      role: "toolResult",
      toolCallId: "call_1",
      toolName: "edit",
      content: [{ type: "text", text: "Successfully replaced 1 block(s) in math.js." }],
      details: {
        patch:
          "--- math.js\n+++ math.js\n@@ -1,3 +1,3 @@\n export function add(a, b) {\n-  return a - b\n+  return a + b\n }\n",
      },
      isError: false,
      timestamp: 1791072520250,
    },
  },
  {
    type: "message",
    id: "ca64dc4b",
    parentId: "4058c42d",
    timestamp: "2026-10-04T00:08:40.262Z",
    message: {
      role: "assistant",
      content: [
        { type: "toolCall", id: "call_2", name: "bash", arguments: { command: "cat math.js" } },
      ],
      provider: "fixture",
      model: "model",
      stopReason: "toolUse",
      timestamp: 1791072520254,
    },
  },
  {
    type: "message",
    id: "72ef2675",
    parentId: "ca64dc4b",
    timestamp: "2026-10-04T00:08:40.276Z",
    message: {
      role: "toolResult",
      toolCallId: "call_2",
      toolName: "bash",
      content: [{ type: "text", text: "export function add(a, b) {\n  return a + b\n}\n" }],
      isError: false,
      timestamp: 1791072520276,
    },
  },
  {
    type: "message",
    id: "0552b9e6",
    parentId: "72ef2675",
    timestamp: "2026-10-04T00:08:40.282Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Fixed: `add` now returns `a + b`." }],
      provider: "fixture",
      model: "model",
      stopReason: "stop",
      timestamp: 1791072520277,
    },
  },
  {
    type: "message",
    id: "aa11bb22",
    parentId: "0552b9e6",
    timestamp: "2026-10-04T00:08:50.000Z",
    message: {
      role: "user",
      content: [{ type: "text", text: "An abandoned question" }],
      timestamp: 1791072530000,
    },
  },
  {
    type: "message",
    id: "782042ee",
    parentId: "0552b9e6",
    timestamp: "2026-10-04T00:08:56.988Z",
    message: {
      role: "user",
      content: [{ type: "text", text: "Does it add now?" }],
      timestamp: 1791072536986,
    },
  },
  {
    type: "session_info",
    id: "5e551011",
    parentId: "782042ee",
    timestamp: "2026-10-04T00:08:56.990Z",
    name: "Fix add",
  },
  {
    type: "message",
    id: "c2d4970a",
    parentId: "5e551011",
    timestamp: "2026-10-04T00:08:57.035Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "It returns the sum now." }],
      provider: "fixture",
      model: "model",
      stopReason: "aborted",
      timestamp: 1791072537000,
    },
  },
]

test("a Pi session file plays back its current branch as the records Pi streams live", async () => {
  const agent = await mkdtemp(join(tmpdir(), "meldshell-pi-"))
  const previous = process.env.PI_CODING_AGENT_DIR
  process.env.PI_CODING_AGENT_DIR = agent
  try {
    const folder = join(agent, "sessions", "--repo--")
    await mkdir(folder, { recursive: true })
    const file = join(folder, "2026-10-04T00-08-40-111Z_01a1043d-c7ad-7753-b718-95564259c26f.jsonl")
    await writeFile(file, `${piSession.map((entry) => JSON.stringify(entry)).join("\n")}\n`)
    await writeFile(join(folder, "not-a-session.jsonl"), '{"type":"message"}\n')

    const [listed, ...others] = await listPiSessions("/repo")
    assert.equal(others.length, 0)
    assert.equal(listed?.nativeThreadId, file)
    assert.equal(listed?.title, "Fix add")
    assert.equal(cliResumeCommand("pi", file), "pi --session 01a1043d-c7ad-7753-b718-95564259c26f")

    const history = await readPiSession("/repo", file)
    assert.equal(history.title, "Fix add")
    assert.deepEqual(
      history.turns.map((turn) => [turn.text, turn.status, turn.model, turn.startedAt]),
      [
        ["Fix the add function", "completed", "fixture/model", "2026-10-04T00:08:40.173Z"],
        ["Does it add now?", "interrupted", "fixture/model", "2026-10-04T00:08:56.988Z"],
      ],
    )
    assert.deepEqual(
      history.turns[0]?.events.map((event) => event.method),
      [
        "turn/started",
        "pi/message_start",
        "pi/message_end",
        "pi/message_end",
        "pi/message_start",
        "pi/message_end",
        "pi/message_end",
        "pi/message_start",
        "pi/message_end",
        "turn/completed",
      ],
    )
    // Only files Pi keeps for this folder are read.
    await assert.rejects(readPiSession("/repo", join(agent, "elsewhere.jsonl")))
    await assert.rejects(readPiSession("/other", file))
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = previous
    await rm(agent, { recursive: true, force: true })
  }
})

const chunk = (sessionUpdate: string, text: string) => ({
  sessionUpdate,
  content: { type: "text", text },
})

/** What a Cursor CLI replays over ACP while it loads a chat. */
const cursorReplay = [
  { sessionUpdate: "available_commands_update", availableCommands: [] },
  chunk("user_message_chunk", "Rename the "),
  chunk("user_message_chunk", "helper"),
  chunk("agent_thought_chunk", "Looking for it."),
  {
    sessionUpdate: "tool_call",
    toolCallId: "t1",
    title: "Edit util.ts",
    kind: "edit",
    status: "pending",
  },
  { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" },
  chunk("agent_message_chunk", "Renamed it to "),
  chunk("agent_message_chunk", "formatDate."),
  { sessionUpdate: "usage_update", used: 10, size: 100 },
  chunk("user_message_chunk", "Thanks"),
  chunk("agent_message_chunk", "You're welcome."),
]

test("a Cursor chat replayed over ACP splits into turns at each message the user sent", () => {
  assert.equal(listsSessions({ agentCapabilities: { sessionCapabilities: { list: {} } } }), true)
  assert.equal(listsSessions({ agentCapabilities: { loadSession: true } }), false)
  assert.deepEqual(
    cursorSessionSummaries(
      {
        sessions: [
          {
            sessionId: "chat-1",
            cwd: "/repo",
            title: "Rename\nthe helper",
            updatedAt: "2026-10-01T10:00:00Z",
          },
          { sessionId: "chat-2", cwd: "/elsewhere", title: "Other folder" },
          { sessionId: "chat-3", cwd: "/repo" },
        ],
      },
      "/repo",
      "2026-10-02T00:00:00.000Z",
    ),
    [
      {
        nativeThreadId: "chat-1",
        title: "Rename the helper",
        updatedAt: "2026-10-01T10:00:00.000Z",
        branch: null,
      },
      {
        nativeThreadId: "chat-3",
        title: "Cursor chat",
        updatedAt: "2026-10-02T00:00:00.000Z",
        branch: null,
      },
    ],
  )
  const turns = cursorTurns("chat-1", cursorReplay, "2026-10-01T10:00:00.000Z")
  assert.deepEqual(
    turns.map((turn) => [turn.text, turn.events.length]),
    [
      ["Rename the helper", 7],
      ["Thanks", 3],
    ],
  )
  assert.ok(
    turns[0]?.events.every(
      (event) =>
        event.method !== "cursor/acp/session/update" ||
        !/usage_update|available_commands/.test(JSON.stringify(event.params)),
    ),
  )
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

test("Cursor and Pi sessions come in as threads their CLIs can continue", async () => {
  const agent = await mkdtemp(join(tmpdir(), "meldshell-pi-"))
  const previous = process.env.PI_CODING_AGENT_DIR
  process.env.PI_CODING_AGENT_DIR = agent
  try {
    const folder = join(agent, "sessions", "--repo--")
    await mkdir(folder, { recursive: true })
    const file = join(folder, "2026-10-04T00-08-40-111Z_01a1043d-c7ad-7753-b718-95564259c26f.jsonl")
    await writeFile(file, piSession.map((entry) => JSON.stringify(entry)).join("\n"))
    const piHistory = await readPiSession("/repo", file)
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* setup
        const sql = yield* SqlClient.SqlClient
        for (const [harness, slug] of [
          ["pi", "fixture/model"],
          ["cursor", "cursor-default"],
        ] as const) {
          const [provider] = yield* sql<{
            id: string
          }>`SELECT id FROM providers WHERE harness = ${harness}`
          yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES (${slug}, ${provider!.id}, ${slug}, ${slug})`
        }

        const pi = yield* importCliSession({
          workspaceId: "workspace",
          harness: "pi",
          nativeThreadId: file,
          history: piHistory,
        })
        const piTurns = prepareTranscriptTurns(
          (yield* getTranscript({ threadId: pi.threadId })).events,
        )
        assert.deepEqual(
          piTurns.map((turn) => turn.userMessages.map((message) => message.text)),
          [["Fix the add function"], ["Does it add now?"]],
        )
        assert.equal(piTurns[0]?.finalResponse?.text, "Fixed: `add` now returns `a + b`.")
        assert.deepEqual(
          piTurns[0]?.workingEvents.map((event) => event.kind),
          ["assistant", "file-change", "command"],
        )
        assert.deepEqual(yield* resumableSession(pi.threadId), {
          harness: "pi",
          nativeThreadId: file,
        })

        const cursor = yield* importCliSession({
          workspaceId: "workspace",
          harness: "cursor",
          nativeThreadId: "chat-1",
          history: {
            title: "Rename the helper",
            turns: cursorTurns("chat-1", cursorReplay, "2026-10-01T10:00:00.000Z"),
          },
        })
        const cursorThreadTurns = prepareTranscriptTurns(
          (yield* getTranscript({ threadId: cursor.threadId })).events,
        )
        assert.deepEqual(
          cursorThreadTurns.map((turn) => [
            turn.userMessages.map((message) => message.text),
            turn.finalResponse?.text,
          ]),
          [
            [["Rename the helper"], "Renamed it to formatDate."],
            [["Thanks"], "You're welcome."],
          ],
        )
        assert.deepEqual(yield* resumableSession(cursor.threadId), {
          harness: "cursor",
          nativeThreadId: "chat-1",
        })
      }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
    )
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = previous
    await rm(agent, { recursive: true, force: true })
  }
})
