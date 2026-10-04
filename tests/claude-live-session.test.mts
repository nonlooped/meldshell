import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { Schema } from "effect"
import { WorkerEvent, type TurnDispatch } from "@meldshell/contracts"
import { ClaudeEvents } from "../packages/provider-claude/src/events.ts"
import { runClaudeWorker } from "../packages/provider-claude/src/worker-runtime.ts"

const fixture = `
if (process.argv.includes('--version')) {
  console.log('2.1.289 (Claude Code)');
  process.exit(0);
}
const emit = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
const result = (extra = {}) => emit({ type: 'result', subtype: 'success', is_error: false,
  result: '', usage: {}, modelUsage: {}, total_cost_usd: 0, ...extra });
let count = 0;
let pending;
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'control_request') {
    if (message.request.subtype === 'interrupt' && pending) {
      clearTimeout(pending.timer);
      result({ user_message_uuid: pending.uuid, result: 'Interrupted' });
      pending = undefined;
    }
    emit({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id,
      response: { commands: [], models: [], account: { apiKeySource: 'environment' } } } });
  }
  if (message.type !== 'user') return;
  const text = JSON.stringify(message.message.content);
  const turn = ++count;
  const echo = text.includes('legacy') ? {} : { user_message_uuid: message.uuid };
  emit({ type: 'system', subtype: 'init', session_id: 'native-thread' });
  // Reproduce the resumed notification and empty result that preceded the real user turn.
  emit({ type: 'system', subtype: 'task_notification', task_id: 'old-server',
    tool_use_id: 'old-shell', status: 'stopped', summary: "Background shell command didn't finish before the previous session ended" });
  result();
  const timer = setTimeout(() => {
    if (text.includes('startup-error')) {
      result({ subtype: 'error_during_execution', is_error: true, errors: ['Startup failed'] });
      return;
    }
    if (text.includes('/command')) {
      emit({ type: 'system', subtype: 'local_command_output', uuid: 'command-output', content: 'Command done' });
      result({ ...echo, ...(text.includes('legacy') ? {} : { local_command: '/command' }), result: 'Command done' });
      return;
    }
    emit({ type: 'assistant', parent_tool_use_id: null, message: {
      id: 'reply-' + turn, stop_reason: 'end_turn', content: [{ type: 'text', text: 'reply-' + turn }] } });
    // A result for another prompt must not settle this one, even after its response has started.
    if (!text.includes('legacy')) result({ user_message_uuid: 'another-prompt' });
    emit({ type: 'system', subtype: 'task_started', task_id: 'server', task_type: 'local_bash',
      tool_use_id: 'shell', description: 'Dev server', is_backgrounded: true });
    result({ ...echo, result: 'reply-' + turn });
    pending = undefined;
  }, text.includes('interrupt-me') ? 10000 : 30);
  pending = { timer, uuid: message.uuid };
});
process.stdin.on('end', () => process.exit(0));
`

for (const legacy of [false, true])
  test(`Claude keeps a streaming session across turns and ignores unrelated results (${legacy ? "legacy" : "prompt echo"})`, {
    timeout: 15000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "meldshell-claude-live-"))
    const script = join(directory, "claude.js")
    await writeFile(script, fixture)
    const previousExecutable = process.env.MELDSHELL_CLAUDE_EXECUTABLE
    const previousBase = process.env.ANTHROPIC_BASE_URL
    process.env.MELDSHELL_CLAUDE_EXECUTABLE = script
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1"
    let shutdown = async () => {}
    t.after(async () => {
      await shutdown()
      if (previousExecutable === undefined) delete process.env.MELDSHELL_CLAUDE_EXECUTABLE
      else process.env.MELDSHELL_CLAUDE_EXECUTABLE = previousExecutable
      if (previousBase === undefined) delete process.env.ANTHROPIC_BASE_URL
      else process.env.ANTHROPIC_BASE_URL = previousBase
      await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    })
    const emitted: Array<typeof WorkerEvent.Type> = []
    let receive = (_message: { data: unknown }) => {}
    let changed = Promise.withResolvers<void>()
    const worker = runClaudeWorker({
      on: (_event, listener) => {
        receive = listener
      },
      postMessage: (message) => {
        emitted.push(Schema.decodeUnknownSync(WorkerEvent)(structuredClone(message)))
        changed.resolve()
      },
    })
    shutdown = () => worker.shutdown()
    const waitFor = async (predicate: () => boolean) => {
      while (!predicate()) {
        changed = Promise.withResolvers<void>()
        await changed.promise
      }
    }
    await waitFor(() => emitted.some((event) => event.type === "provider-ready"))
    const dispatch: TurnDispatch = {
      harness: "claude-code",
      threadId: "thread",
      turnId: "turn-1",
      nativeThreadId: null,
      workspacePath: directory,
      model: "opus",
      reasoningEffort: "medium",
      speed: "standard",
      serviceTier: "default",
      mode: "default",
      sandbox: "danger-full-access",
      approvalPolicy: "never",
      text: legacy ? "legacy reply" : "reply",
      attachments: [],
    }
    const completed = (turnId: string) =>
      emitted.filter(
        (event) =>
          event.type === "runtime-event" &&
          event.input.turnId === turnId &&
          event.input.method === "turn/completed",
      )
    const start = async (turnId: string, text = dispatch.text) => {
      receive({ data: { type: "start-turn", dispatch: { ...dispatch, turnId, text } } })
      await waitFor(() => completed(turnId).length > 0)
      assert.equal(completed(turnId).length, 1)
    }
    const before = emitted.filter((event) => event.type === "process-started").length
    await start("turn-1")
    dispatch.nativeThreadId = "native-thread"
    dispatch.speed = "fast"
    dispatch.reasoningEffort = "high"
    dispatch.mode = "plan"
    await start("turn-2")
    assert.equal(emitted.filter((event) => event.type === "process-started").length, before + 1)
    const replies = emitted.filter(
      (event) =>
        event.type === "runtime-event" &&
        event.input.method === "item/completed" &&
        (event.input.params as { item: { type: string } }).item.type === "agentMessage",
    )
    assert.equal(replies.length, 2)
    const rows = emitted.filter(
      (event) =>
        event.type === "runtime-event" &&
        event.input.method === "item/completed" &&
        (event.input.params as { item: { id: string } }).item.id === "task:old-server",
    )
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.ok(row.type === "runtime-event")
      assert.equal(
        (row.input.params as { item: Record<string, unknown> }).item.parentToolUseId,
        undefined,
      )
    }
    await start("command", legacy ? "/command legacy" : "/command")
    await start("failure", "startup-error")
    const failure = completed("failure")[0]
    assert.ok(failure?.type === "runtime-event")
    assert.equal((failure.input.params as { turn: { status: string } }).turn.status, "failed")
    receive({
      data: {
        type: "start-turn",
        dispatch: {
          ...dispatch,
          turnId: "interrupted",
          text: "interrupt-me",
        },
      },
    })
    await waitFor(() =>
      emitted.some(
        (event) =>
          event.type === "runtime-event" &&
          event.input.turnId === "interrupted" &&
          event.input.method === "claude/system/init",
      ),
    )
    receive({
      data: {
        type: "interrupt-turn",
        nativeThreadId: "native-thread",
        nativeTurnId: "interrupted",
        commandId: "interrupt",
      },
    })
    await waitFor(() => completed("interrupted").length > 0)
    const interrupted = completed("interrupted")[0]
    assert.ok(interrupted?.type === "runtime-event")
    assert.equal(
      (interrupted.input.params as { turn: { status: string } }).turn.status,
      "interrupted",
    )
    await start("after-interrupt")
    assert.equal(emitted.filter((event) => event.type === "process-started").length, before + 1)
    receive({ data: { type: "close-thread-session", threadId: "thread", commandId: "close" } })
    await waitFor(() =>
      emitted.some((event) => event.type === "command-ack" && event.commandId === "close"),
    )
    assert.equal(
      emitted.filter((event) => event.type === "process-stopped").length,
      emitted.filter((event) => event.type === "process-started").length,
    )
    await start("reopened")
    assert.equal(emitted.filter((event) => event.type === "process-started").length, before + 2)
    dispatch.sandbox = "read-only"
    await start("restricted")
    assert.equal(emitted.filter((event) => event.type === "process-started").length, before + 3)
  })

test("Claude nests known agent tasks but keeps shell and untyped resume notifications at the top level", () => {
  const items: Record<string, unknown>[] = []
  const events = new ClaudeEvents((_method, params) => {
    items.push((params as { item: Record<string, unknown> }).item)
  })
  const accept = (message: unknown) =>
    events.accept(message as Parameters<ClaudeEvents["accept"]>[0])
  for (const taskType of ["local_bash", "local_agent"]) {
    accept({
      type: "system",
      subtype: "task_started",
      task_id: taskType,
      task_type: taskType,
      tool_use_id: "parent",
      description: taskType,
      is_backgrounded: true,
    })
    accept({
      type: "system",
      subtype: "task_notification",
      task_id: taskType,
      tool_use_id: "parent",
      status: "completed",
      summary: "done",
    })
  }
  accept({
    type: "system",
    subtype: "task_notification",
    task_id: "unknown",
    tool_use_id: "old-shell",
    status: "stopped",
    summary: "previous session ended",
  })
  assert.deepEqual(
    items.map((item) => item.parentToolUseId),
    [undefined, undefined, "parent", "parent", undefined],
  )
})
