import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect, Schema } from "effect"
import { RuntimeEventInput, WorkerEvent } from "@meldshell/contracts"
import { initializeDatabase, recordRuntimeEvent } from "@meldshell/core"
import { toolApproval } from "../../provider-claude/src/approvals"
import { ClaudeEvents } from "../../provider-claude/src/events"
import { runClaudeWorker } from "../../provider-claude/src/worker-runtime"

// Advanced Node IPC retains undefined properties. Exercise the core RPC codec before JSON
// serialization could silently remove them, as the WSL host does on every provider event.
const encodeEvent = Schema.encodeSync(Schema.toCodecJson(RuntimeEventInput))
const runtimeEvent = (method: string, params: unknown): typeof RuntimeEventInput.Type => ({
  threadId: "thread",
  turnId: "turn",
  method,
  params: structuredClone(params),
  validated: true,
})

test("Claude tool, task, and compaction events survive the core JSON codec", () => {
  const emitted: Array<{ method: string; params: unknown }> = []
  const events = new ClaudeEvents((method, params) => {
    encodeEvent(runtimeEvent(method, params))
    emitted.push({ method, params })
  })
  const accept = (message: unknown) => events.accept(message as SDKMessage)
  for (const [name, input] of [
    ["Bash", { command: "printf probe" }],
    ["PowerShell", { command: "Write-Output probe", cwd: "C:/workspace" }],
    ["Skill", { skill: "diagnosing-bugs" }],
    ["Read", { file_path: "/workspace/README.md" }],
  ] as const) {
    accept({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        id: `message-${name}`,
        content: [{ type: "tool_use", id: name, name, input }],
      },
    })
    accept({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: name, content: "probe" }] },
    })
  }
  accept({
    type: "user",
    tool_use_result: { extension: { answer: null, values: [1, false] } },
    message: { content: [{ type: "tool_result", tool_use_id: "untracked" }] },
  })
  accept({ type: "system", subtype: "task_notification", task_id: "task", status: "completed" })
  accept({ type: "system", subtype: "status", uuid: "compact-success", compact_result: "success" })
  accept({ type: "system", subtype: "status", uuid: "compact-failure", compact_result: "failed" })
  const items = emitted.map((event) => (event.params as { item?: Record<string, unknown> }).item)
  assert.equal(items.find((item) => item?.id === "Bash")?.cwd, undefined)
  assert.equal(items.find((item) => item?.id === "PowerShell")?.cwd, "C:/workspace")
  assert.deepEqual(items.find((item) => item?.id === "untracked")?.result, {
    extension: { answer: null, values: [1, false] },
  })
  assert.equal(items.filter((item) => item?.status === "completed").length, 7)
})

test("Claude approvals without shell commands survive the core JSON codec", () => {
  for (const name of ["Read", "Skill", "AskUserQuestion", "ExitPlanMode", "Bash"]) {
    const input = name === "Bash" ? { command: "printf probe" } : { extension: { value: null } }
    const approval = toolApproval(name, input, [], "default")
    encodeEvent(runtimeEvent(approval.method, approval.params))
    assert.deepEqual(approval.params.input, input)
  }
})

const fixture = `
if (process.argv.includes('--version')) {
  console.log('2.1.289 (Claude Code)');
  process.exit(0);
}
const emit = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'control_request') {
    emit({ type: 'control_response', response: {
      subtype: 'success', request_id: message.request_id,
      response: { commands: [], models: [], account: { apiKeySource: 'environment' } }
    }});
  }
  if (message.type === 'user') {
    emit({ type: 'system', subtype: 'init', session_id: 'native-thread' });
    if (JSON.stringify(message.message.content).includes('printf')) {
      emit({ type: 'assistant', parent_tool_use_id: null, message: {
        id: 'tool-message', content: [{ type: 'tool_use', id: 'bash', name: 'Bash', input: { command: 'printf probe' } }]
      }});
      emit({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'bash', content: 'probe' }] }});
    }
    emit({ type: 'assistant', parent_tool_use_id: null, message: {
      id: 'reply', stop_reason: 'end_turn', content: [{ type: 'text', text: 'probe' }]
    }});
    emit({ type: 'result', subtype: 'success', is_error: false, result: 'probe', usage: {}, modelUsage: {}, total_cost_usd: 0 });
  }
});
process.stdin.on('end', () => process.exit(0));
`

for (const tools of [false, true])
  test(`Claude ${tools ? "tool" : "text"} turns reach completed through the SDK, WSL IPC shape, and core persistence`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "meldshell-claude-test-"))
    const script = join(directory, "claude.js")
    await writeFile(script, fixture)
    const previousExecutable = process.env.MELDSHELL_CLAUDE_EXECUTABLE
    const previousBase = process.env.ANTHROPIC_BASE_URL
    process.env.MELDSHELL_CLAUDE_EXECUTABLE = script
    // Model history is unnecessary for this local protocol fixture; skip the public catalog fetch.
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1"
    t.after(async () => {
      if (previousExecutable === undefined) delete process.env.MELDSHELL_CLAUDE_EXECUTABLE
      else process.env.MELDSHELL_CLAUDE_EXECUTABLE = previousExecutable
      if (previousBase === undefined) delete process.env.ANTHROPIC_BASE_URL
      else process.env.ANTHROPIC_BASE_URL = previousBase
      await rm(directory, { recursive: true, force: true })
    })
    const inputs: Array<typeof RuntimeEventInput.Type> = []
    let receive = (_message: { data: unknown }) => {
      // Replaced synchronously when the worker registers its command listener.
    }
    const finished = Promise.withResolvers<void>()
    const timer = setTimeout(() => finished.reject(new Error("Claude fixture timed out")), 10_000)
    const worker = runClaudeWorker({
      on: (_event, listener) => {
        receive = listener
      },
      postMessage: (message) => {
        const event = Schema.decodeUnknownSync(WorkerEvent)(structuredClone(message))
        if (event.type === "provider-ready")
          receive({
            data: {
              type: "start-turn",
              dispatch: {
                harness: "claude-code",
                threadId: "thread",
                turnId: "turn",
                nativeThreadId: null,
                workspacePath: directory,
                model: "opus",
                reasoningEffort: "medium",
                speed: "standard",
                serviceTier: "default",
                mode: "default",
                sandbox: "danger-full-access",
                approvalPolicy: "never",
                text: tools ? "Run printf probe and return its output." : "Reply with probe.",
                attachments: [],
              },
            },
          })
        if (event.type === "runtime-event") {
          inputs.push(event.input)
          if (event.input.method === "turn/completed") finished.resolve()
        }
      },
    })
    try {
      await finished.promise
    } finally {
      clearTimeout(timer)
      await worker.shutdown()
    }
    assert.equal(
      inputs.some((input) => input.method === "item/started"),
      tools,
    )
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* initializeDatabase
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES ('workspace', ${directory}, 'test', 'now', 'now')`
        yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at) VALUES ('thread', 'workspace', 'test', 'active', 'now', 'now')`
        yield* sql`INSERT INTO turns (id, thread_id, provider, harness, model, speed, status, started_at) VALUES ('turn', 'thread', 'anthropic', 'claude-code', 'opus', 'standard', 'running', 'now')`
        for (const input of inputs) {
          const encoded = encodeEvent(input)
          const decoded = Schema.decodeUnknownSync(Schema.toCodecJson(RuntimeEventInput))(encoded)
          assert.deepEqual(yield* recordRuntimeEvent(decoded), {
            changed: true,
            snapshotChanged: input.method === "turn/completed",
            nextDispatch: null,
          })
        }
        const turns = yield* sql<{
          status: string
          error: string | null
        }>`SELECT status, error FROM turns`
        assert.equal(turns.length, 1)
        assert.equal(turns[0]!.status, "completed")
        assert.equal(turns[0]!.error, null)
        const stored = yield* sql<{
          provider_data: string
        }>`SELECT provider_data FROM events WHERE method = 'item/completed' ORDER BY sequence`
        assert.equal(JSON.parse(stored.at(-1)!.provider_data).item.text, "probe")
      }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
    )
  })
