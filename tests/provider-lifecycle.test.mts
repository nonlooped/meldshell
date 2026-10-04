import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { Effect, Schema } from "effect"
import { WorkerEvent, type TurnDispatch } from "@meldshell/contracts"
import type { WorkerPort } from "@meldshell/provider-runtime"
import { CursorClient } from "../packages/provider-cursor/src/client.ts"
import { runCursorWorker } from "../packages/provider-cursor/src/worker-runtime.ts"
import { runPiWorker } from "../packages/provider-pi/src/worker-runtime.ts"
import { runCodexWorker } from "../packages/provider-codex/src/worker-runtime.ts"
import type { AppServerCallbacks } from "../packages/provider-codex/src/client.ts"

const harness = () => {
  const events: Array<typeof WorkerEvent.Type> = []
  let receive = (_message: { data: unknown }) => {}
  let changed = Promise.withResolvers<void>()
  const port: WorkerPort = {
    on: (_event, listener) => {
      receive = listener
    },
    postMessage: (message) => {
      events.push(Schema.decodeUnknownSync(WorkerEvent)(structuredClone(message)))
      changed.resolve()
    },
  }
  const waitFor = async (predicate: () => boolean) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Missing worker event: ${JSON.stringify(events.slice(-5))}`)),
        3000,
      )
    })
    try {
      while (!predicate()) {
        changed = Promise.withResolvers<void>()
        await Promise.race([changed.promise, deadline])
      }
    } finally {
      clearTimeout(timer)
    }
  }
  const completed = (turnId: string) =>
    events.filter(
      (event) =>
        event.type === "runtime-event" &&
        event.input.turnId === turnId &&
        event.input.method === "turn/completed",
    )
  return { port, events, waitFor, completed, send: (data: unknown) => receive({ data }) }
}

const dispatchFor = (harness: TurnDispatch["harness"], workspacePath: string): TurnDispatch => ({
  harness,
  threadId: "thread",
  turnId: "turn-1",
  nativeThreadId: null,
  workspacePath,
  model: harness === "pi" ? "fixture/model" : "fixture",
  reasoningEffort: null,
  speed: "standard",
  serviceTier: "default",
  mode: "default",
  sandbox: "danger-full-access",
  approvalPolicy: "never",
  text: "reply",
  attachments: [],
})

const piFixture = `
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  const reply = (data = {}) => emit({ type: 'response', command: request.type, id: request.id, success: true, data });
  if (request.type === 'get_available_models') return reply({ models: [{ provider: 'fixture', id: 'model' }] });
  if (request.type === 'get_state') return reply({ model: { provider: 'fixture', id: 'model' }, sessionFile: 'native-thread' });
  if (request.type !== 'prompt') return reply();
  if (request.message === '/handled') {
    emit({ type: 'agent_settled' });
    return reply({ disposition: 'handled' });
  }
  // An idle record from the previous run must not finish the prompt just accepted.
  emit({ type: 'agent_settled' });
  reply({ disposition: 'accepted' });
  setTimeout(() => {
    emit({ type: 'agent_start' });
    emit({ type: 'agent_end', messages: [] });
    // agent_end can precede retry/compaction continuations; only agent_settled ends the turn.
    setTimeout(() => {
      emit({ type: 'agent_start' });
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'reply' }], stopReason: 'stop' } });
      emit({ type: 'agent_end', messages: [] });
      emit({ type: 'agent_settled' });
    }, 30);
  }, 30);
});
process.stdin.on('end', () => process.exit(0));
`

const cursorFixture = `
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
const configuration = { sessionId: 'native-thread',
  models: { currentModelId: 'fixture', availableModels: [{ modelId: 'fixture', name: 'Fixture' }] },
  modes: { currentModeId: 'agent', availableModes: [{ id: 'agent', name: 'Agent' }] } };
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  const reply = (result = {}) => emit({ jsonrpc: '2.0', id: request.id, result });
  if (request.method === 'initialize') return reply({ protocolVersion: 1,
    agentCapabilities: { loadSession: true }, authMethods: [{ id: 'cursor_login', name: 'Cursor login' }] });
  if (request.method === 'cursor/list_available_models')
    return emit({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Legacy catalog' } });
  if (request.method === 'session/new' || request.method === 'session/load') return reply(configuration);
  if (request.method !== 'session/prompt') { if (request.id !== undefined) reply(); return; }
  // A completed background tool and an unrelated response must not settle this prompt.
  emit({ jsonrpc: '2.0', id: 'old-request', result: { stopReason: 'end_turn' } });
  emit({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: request.params.sessionId,
    update: { sessionUpdate: 'tool_call_update', toolCallId: 'background', status: 'completed' } } });
  setTimeout(() => {
    emit({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: request.params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'reply' } } } });
    reply({ stopReason: 'end_turn' });
  }, 50);
});
process.stdin.on('end', () => process.exit(0));
`

for (const provider of ["pi", "cursor"] as const)
  test(`${provider} retains sessions, ignores unrelated completion, and closes only the requested thread`, {
    timeout: 15000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), `meldshell-${provider}-lifecycle-`))
    const script = join(directory, "fixture.cjs")
    await writeFile(script, provider === "pi" ? piFixture : cursorFixture)
    const h = harness()
    const worker =
      provider === "pi"
        ? runPiWorker(h.port, {
            discover: async () => ({
              command: process.execPath,
              args: [script],
              executablePath: script,
              version: "1.0.0",
            }),
          })
        : runCursorWorker(h.port, {
            discover: async () => ({ command: process.execPath, args: [script] }),
            Client: CursorClient,
            readAccountEmail: async () => null,
          })
    t.after(async () => {
      await worker.shutdown()
      await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    })
    await h.waitFor(() => h.events.some((event) => event.type === "provider-ready"))
    const dispatch = dispatchFor(provider, directory)
    const start = async (
      turnId: string,
      threadId = "thread",
      nativeThreadId: string | null = null,
    ) => {
      h.send({ type: "start-turn", dispatch: { ...dispatch, turnId, threadId, nativeThreadId } })
      await h.waitFor(() => h.completed(turnId).length > 0)
      assert.equal(h.completed(turnId).length, 1)
      const replyIndex = h.events.findIndex(
        (event) =>
          event.type === "runtime-event" &&
          event.input.turnId === turnId &&
          event.input.method ===
            (provider === "pi" ? "pi/message_end" : "cursor/acp/session/update") &&
          JSON.stringify(event.input.params).includes('"reply"'),
      )
      assert.ok(replyIndex >= 0, "the real reply must arrive before completion")
      assert.ok(replyIndex < h.events.indexOf(h.completed(turnId)[0]))
      assert.equal(
        h.events.some((event) => event.type === "turn-start-failed" && event.turnId === turnId),
        false,
      )
    }
    const count = () => h.events.filter((event) => event.type === "process-started").length
    await start("turn-1")
    const firstCount = count()
    const processStarted = h.events.findLast((event) => event.type === "process-started")
    assert.ok(processStarted?.type === "process-started")
    await start("turn-2", "thread", "native-thread")
    assert.equal(count(), firstCount, "a second turn reuses its provider process")
    if (provider === "pi") {
      h.send({
        type: "start-turn",
        dispatch: {
          ...dispatch,
          turnId: "handled",
          nativeThreadId: "native-thread",
          text: "/handled",
        },
      })
      await h.waitFor(() => h.completed("handled").length === 1)
      assert.equal(count(), firstCount, "a handled extension command needs no agent run")
    }
    await start("sibling", "sibling")
    const siblingStarted = h.events.findLast((event) => event.type === "process-started")
    assert.ok(siblingStarted?.type === "process-started")
    h.send({ type: "close-thread-session", threadId: "thread", commandId: "close" })
    await h.waitFor(() =>
      h.events.some((event) => event.type === "command-ack" && event.commandId === "close"),
    )
    await h.waitFor(() =>
      h.events.some(
        (event) => event.type === "process-stopped" && event.pid === processStarted.pid,
      ),
    )
    assert.equal(
      h.events.some(
        (event) => event.type === "process-stopped" && event.pid === siblingStarted.pid,
      ),
      false,
    )
    assert.ok(
      h.events.some(
        (event) => event.type === "command-ack" && event.commandId === "close" && !event.error,
      ),
    )
    const retainedCount = count()
    await start("sibling-2", "sibling", "native-thread")
    assert.equal(count(), retainedCount, "closing another thread leaves this session intact")
    await start("reopened", "thread", "native-thread")
    assert.equal(count(), retainedCount + 1, "explicitly closing a session requires a new process")
  })

test("Codex retains its app-server and accepts completion only for the current native turn", {
  timeout: 10000,
}, async (t) => {
  const h = harness()
  let server!: FixtureServer
  let constructions = 0
  let stops = 0
  class FixtureServer {
    constructor(
      _path: string,
      readonly callbacks: AppServerCallbacks,
    ) {
      server = this
      constructions++
    }
    async start() {}
    async stop() {
      stops++
    }
    respond() {}
    rejectRequest() {}
    turn = 0
    notify(id?: string, threadId = "native-thread") {
      this.callbacks.onNotification(
        {
          method: "turn/completed",
          params: { threadId, turn: { ...(id ? { id } : {}), items: [], status: "completed" } },
        },
        "validated",
      )
    }
    async request<A>(method: string): Promise<A> {
      if (method === "model/list")
        return {
          data: [
            {
              id: "fixture",
              model: "fixture",
              displayName: "Fixture",
              description: "Fixture",
              hidden: false,
              isDefault: true,
              defaultReasoningEffort: "medium",
              supportedReasoningEfforts: [],
            },
          ],
          nextCursor: null,
        } as A
      if (method === "thread/start" || method === "thread/resume")
        return {
          approvalPolicy: "never",
          approvalsReviewer: "user",
          cwd: process.cwd(),
          model: "fixture",
          modelProvider: "openai",
          sandbox: { type: "dangerFullAccess" },
          thread: {
            id: "native-thread",
            cliVersion: "1",
            createdAt: 1,
            updatedAt: 1,
            cwd: process.cwd(),
            ephemeral: false,
            modelProvider: "openai",
            preview: "",
            projectId: null,
            sessionId: "session",
            source: "appServer",
            status: { type: "idle" },
            turns: [],
          },
        } as A
      if (method === "turn/start") {
        const id = `native-${++this.turn}`
        this.notify("old-turn")
        this.notify()
        this.notify(id, "another-thread")
        return { turn: { id, items: [], status: "inProgress" } } as A
      }
      throw new Error(`Unexpected request: ${method}`)
    }
  }
  const worker = runCodexWorker(h.port, {
    Server: FixtureServer,
    probe: Effect.succeed({
      provider: "openai",
      harness: "codex",
      availability: "ready",
      detail: "Fixture",
      executablePath: "fixture",
      version: "1",
      accountEmail: null,
      checkedAt: new Date().toISOString(),
    }),
  })
  t.after(() => worker.shutdown())
  await h.waitFor(() => h.events.some((event) => event.type === "provider-ready"))
  for (let turn = 1; turn <= 2; turn++) {
    const turnId = `turn-${turn}`
    h.send({
      type: "start-turn",
      dispatch: {
        ...dispatchFor("codex", process.cwd()),
        turnId,
        nativeThreadId: turn === 1 ? null : "native-thread",
      },
    })
    await h.waitFor(() =>
      h.events.some(
        (event) =>
          event.type === "runtime-event" &&
          event.input.turnId === turnId &&
          event.input.method === "turn/accepted",
      ),
    )
    assert.equal(h.completed(turnId).length, 0)
    server.notify(`native-${turn - 1}`)
    assert.equal(h.completed(turnId).length, 0, "a late previous-turn completion is ignored")
    server.notify(`native-${turn}`)
    assert.equal(h.completed(turnId).length, 1)
  }
  assert.equal(constructions, 1)
  assert.equal(stops, 0, "normal turn completion does not stop the app-server")
})
