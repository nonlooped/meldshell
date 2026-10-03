import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as SqlClient from "effect/sql/SqlClient"
import { Effect, Schema } from "effect"
import { WorkerEvent, type WorkerCommand } from "@meldshell/contracts"
import { initializeDatabase, openProviderTurn, setThreadSettings } from "@meldshell/core"
import { planUpdate } from "../src/provider-updates"
import { runPiWorker } from "../../provider-pi/src/worker-runtime"

const fixture = `
const fs = require('node:fs');
const readline = require('node:readline');
const emit = (record) => process.stdout.write(JSON.stringify(record) + '\\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const command = JSON.parse(line);
  let data = {};
  if (command.type === 'get_available_models') data = { models: [{ provider: 'fixture', id: 'model' }] };
  if (command.type === 'get_state') data = { model: { provider: 'fixture', id: 'model' }, sessionFile: 'fixture-session' };
  if (command.type === 'get_commands') data = { commands: [
    { name: 'skill:pdf-tools', source: 'skill', description: 'Read PDF files' },
    { name: 'ask', source: 'extension', description: 'Ask a question' }
  ] };
  if (command.type === 'prompt') {
    emit({ type: 'agent_start' });
    emit({ type: 'agent_settled' });
    setTimeout(() => {
      fs.writeFileSync(process.argv[2], 'extension ran');
      emit({ type: 'agent_start' });
      emit({ type: 'agent_settled' });
    }, 200);
  }
  emit({ type: 'response', id: command.id, success: true, data });
});
process.stdin.on('end', () => process.exit(0));
`

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("Pi command discovery preserves native skill slash commands and reports its launcher", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "meldshell-pi-test-"))
  const script = join(directory, "pi.cjs")
  await writeFile(script, fixture)
  const events: Array<typeof WorkerEvent.Type> = []
  let receive = (_message: { data: unknown }) => {
    // Replaced synchronously when the worker registers its command listener.
  }
  const worker = runPiWorker(
    {
      on: (_event, listener) => {
        receive = listener
      },
      postMessage: (message) => events.push(Schema.decodeUnknownSync(WorkerEvent)(message)),
    },
    {
      discover: async () => ({
        command: process.execPath,
        args: [script, join(directory, "marker")],
        executablePath: script,
        version: "1.0.0",
      }),
    },
  )
  t.after(async () => {
    await worker.shutdown()
    await rm(directory, { recursive: true, force: true })
  })
  receive({ data: { type: "list-commands", requestId: "commands", workspacePath: directory } })
  for (
    let attempt = 0;
    attempt < 100 && !events.some((event) => event.type === "commands-result");
    attempt++
  )
    await pause(10)
  const listed = events.find((event) => event.type === "commands-result")
  assert.equal(listed?.type, "commands-result")
  assert.deepEqual(listed?.commands, [
    { kind: "command", name: "skill:pdf-tools", description: "Read PDF files" },
    { kind: "command", name: "ask", description: "Ask a question" },
  ])
  for (
    let attempt = 0;
    attempt < 100 && !events.some((event) => event.type === "provider-ready");
    attempt++
  )
    await pause(10)
  const ready = events.find((event) => event.type === "provider-ready")
  assert.equal(ready?.status.harness, "pi")
  if (ready?.status.harness === "pi")
    assert.deepEqual(ready.status.launcher, {
      command: process.execPath,
      args: [script, join(directory, "marker")],
    })
})

for (const closeSession of [false, true])
  test(
    closeSession
      ? "closing a retained Pi session stops timer extensions before acknowledging"
      : "a selected Pi session still records autonomous timer work",
    async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "meldshell-pi-test-"))
      const script = join(directory, "pi.cjs")
      const marker = join(directory, "marker")
      await writeFile(script, fixture)
      const events: Array<typeof WorkerEvent.Type> = []
      let receive = (_message: { data: unknown }) => {
        // Replaced synchronously when the worker registers its command listener.
      }
      const worker = runPiWorker(
        {
          on: (_event, listener) => {
            receive = listener
          },
          postMessage: (message) => events.push(Schema.decodeUnknownSync(WorkerEvent)(message)),
        },
        {
          discover: async () => ({
            command: process.execPath,
            args: [script, marker],
            executablePath: script,
            version: "1.0.0",
          }),
        },
      )
      t.after(async () => {
        await worker.shutdown()
        await rm(directory, { recursive: true, force: true })
      })
      const command: WorkerCommand = {
        type: "start-turn",
        dispatch: {
          threadId: "thread",
          turnId: "turn",
          harness: "pi",
          model: "fixture/model",
          workspacePath: directory,
          nativeThreadId: null,
          text: "hello",
          attachments: [],
          reasoningEffort: null,
          speed: "standard",
          serviceTier: "default",
          mode: "default",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
        },
      }
      receive({ data: command })
      for (
        let attempt = 0;
        attempt < 100 &&
        !events.some(
          (event) => event.type === "runtime-event" && event.input.method === "turn/completed",
        );
        attempt++
      )
        await pause(10)
      assert.ok(
        events.some(
          (event) => event.type === "runtime-event" && event.input.method === "turn/completed",
        ),
      )
      if (!closeSession) {
        await pause(250)
        assert.ok(events.some((event) => event.type === "turn-opened"))
        assert.equal(await readFile(marker, "utf8"), "extension ran")
        return
      }
      receive({ data: { type: "close-thread-session", threadId: "thread", commandId: "close" } })
      for (
        let attempt = 0;
        attempt < 100 &&
        !events.some((event) => event.type === "command-ack" && event.commandId === "close");
        attempt++
      )
        await pause(10)
      const ack = events.find(
        (event) => event.type === "command-ack" && event.commandId === "close",
      )
      assert.ok(ack?.type === "command-ack")
      assert.equal(ack.error, undefined)
      await pause(250)
      assert.equal(
        events.some((event) => event.type === "turn-opened"),
        false,
      )
      await assert.rejects(readFile(marker), { code: "ENOENT" })
    },
  )

test("Pi update plans reuse Node launchers for JavaScript overrides and Windows shims", () => {
  for (const path of ["/home/user/pi.cjs", "C:\\Users\\user\\npm\\pi.cmd"]) {
    assert.deepEqual(planUpdate("pi", path, path, { command: "node", args: ["entry.js"] }), {
      plan: { file: "node", args: ["entry.js", "update", "self"], display: "pi update self" },
    })
    assert.ok("manual" in planUpdate("pi", path, path))
  }
  assert.deepEqual(planUpdate("pi", "/home/user/pi", "/opt/homebrew/Cellar/pi/1.0/bin/pi"), {
    plan: {
      file: "brew",
      args: ["upgrade", "--formula", "pi"],
      display: "brew upgrade --formula pi",
    },
  })
})

test("core rejects autonomous turns from deselected or disabled providers without creating a turn", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* initializeDatabase
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES ('workspace', '/tmp/pi-test', 'test', 'now', 'now')`
      yield* sql`INSERT INTO threads (id, workspace_id, title, status, created_at, updated_at) VALUES ('thread', 'workspace', 'test', 'active', 'now', 'now')`
      const providers = yield* sql<{ id: string }>`SELECT id FROM providers WHERE harness = 'pi'`
      const providerId = providers[0]!.id
      yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES ('model', ${providerId}, 'fixture/model', 'Fixture')`
      yield* sql`INSERT INTO thread_settings (thread_id, provider_id, model_id) VALUES ('thread', ${providerId}, 'model')`
      const input = {
        harness: "pi" as const,
        threadId: "thread",
        turnId: "turn",
        model: "fixture/model",
        generation: "worker",
      }
      assert.equal(yield* openProviderTurn(input), true)
      assert.equal(yield* openProviderTurn({ ...input, turnId: "overlap" }), false)
      yield* sql`DELETE FROM turns`
      const codex = yield* sql<{ id: string }>`SELECT id FROM providers WHERE harness = 'codex'`
      yield* sql`INSERT INTO provider_models (id, provider_id, slug, display_name) VALUES ('codex-model', ${codex[0]!.id}, 'fixture', 'Fixture')`
      yield* setThreadSettings({ threadId: "thread", modelId: "codex-model" })
      assert.equal(yield* openProviderTurn({ ...input, turnId: "deselected" }), false)
      yield* setThreadSettings({ threadId: "thread", modelId: "model" })
      yield* sql`UPDATE providers SET enabled = 0 WHERE id = ${providerId}`
      assert.equal(yield* openProviderTurn({ ...input, turnId: "disabled" }), false)
      assert.deepEqual(yield* sql`SELECT id FROM turns`, [])
      assert.equal(yield* openProviderTurn({ ...input, threadId: "missing" }), false)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  )
})
