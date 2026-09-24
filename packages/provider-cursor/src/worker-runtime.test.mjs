import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { runCursorWorker } from "./worker-runtime.ts"

const until = async (predicate) => {
  for (let index = 0; index < 1000; index++) {
    if (predicate()) return
    await setImmediate()
  }
  throw new Error("Timed out waiting for Cursor worker")
}
const setup = async (t, selection = {}) => {
  const output = []
  const clients = []
  let receive
  class FakeClient {
    controller = new AbortController()
    prompt = Promise.withResolvers()
    prompting = false
    requests = []
    constructor(_command, _cwd, callbacks) {
      this.callbacks = callbacks
      clients.push(this)
    }
    async initialize() {
      return { agentCapabilities: { loadSession: true } }
    }
    async run(operation) {
      return operation({
        request: async (method, params) => {
          this.requests.push({ method, params })
          if (method === "cursor/list_available_models")
            return { models: [{ value: "model", name: "Model" }] }
          if (method === "session/new") return { sessionId: "session" }
          if (method === "session/prompt") {
            this.prompting = true
            return this.prompt.promise
          }
          return {}
        },
        notify: async () => this.prompt.resolve({ stopReason: "cancelled" }),
      })
    }
    async close() {
      this.controller.abort(new Error("Connection closed"))
      if (this.prompting) this.prompt.reject(new Error("Connection closed"))
    }
  }
  const worker = runCursorWorker(
    {
      postMessage: (message) => output.push(message),
      on: (_event, handler) => {
        receive = handler
      },
    },
    {
      discover: async () => ({ command: "fixture", args: [] }),
      Client: FakeClient,
      readAccountEmail: async () => null,
    },
  )
  t.after(() => worker.shutdown())
  await until(() => output.some((message) => message.type === "provider-ready"))
  const send = (message) => receive({ data: message })
  send({
    type: "start-turn",
    dispatch: {
      harness: "cursor",
      threadId: "thread",
      turnId: "turn",
      nativeThreadId: null,
      workspacePath: process.cwd(),
      model: "model",
      reasoningEffort: null,
      speed: "standard",
      serviceTier: "default",
      mode: "default",
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      text: "Hello",
      attachments: [],
      ...selection,
    },
  })
  await until(() => clients.some((client) => client.prompting))
  const client = clients.find((client) => client.prompting)
  const call = (handler, params) =>
    client.callbacks[handler]({ params, signal: client.controller.signal })
  return { output, send, call, worker, client }
}
const permission = {
  sessionId: "session",
  toolCall: { toolCallId: "tool" },
  options: [
    { optionId: "allow", name: "Allow", kind: "allow_once" },
    { optionId: "deny", name: "Deny", kind: "reject_once" },
  ],
}

test("worker keeps an approval pending after invalid input and resolves the SDK handler on a valid answer", async (t) => {
  const { output, send, call } = await setup(t)
  const response = call("requestPermission", permission)
  const event = output.find(
    (message) => message.input?.method === "cursor/acp/session/request_permission",
  )
  assert.ok(event.input.requestId)
  send({
    type: "resolve-approval",
    requestId: event.input.requestId,
    decision: "accept",
    optionId: "missing",
    commandId: "invalid",
  })
  assert.match(
    output.find((message) => message.commandId === "invalid").error,
    /advertised permission options/,
  )
  send({
    type: "resolve-approval",
    requestId: event.input.requestId,
    decision: "accept",
    optionId: "allow",
    commandId: "valid",
  })
  assert.deepEqual(await response, { outcome: { outcome: "selected", optionId: "allow" } })
  assert.equal(output.find((message) => message.commandId === "valid").error, undefined)
})

test("a turn runs in the Cursor mode the thread chose", async (t) => {
  for (const [mode, modeId] of [
    ["default", "agent"],
    ["plan", "plan"],
    ["ask", "ask"],
  ]) {
    await t.test(mode, async (t) => {
      const { client } = await setup(t, { mode })
      assert.deepEqual(
        client.requests.filter((request) => request.method === "session/set_mode"),
        [{ method: "session/set_mode", params: { sessionId: "session", modeId } }],
      )
    })
  }
})

test("automatic permission policies return the advertised option through the SDK handler", async (t) => {
  for (const [sandbox, optionId] of [
    ["workspace-write", "deny"],
    ["danger-full-access", "allow"],
  ]) {
    await t.test(sandbox, async (t) => {
      const { call, output } = await setup(t, { sandbox, approvalPolicy: "never" })
      assert.deepEqual(await call("requestPermission", permission), {
        outcome: { outcome: "selected", optionId },
      })
      assert.equal(
        output.some((message) => message.input?.requestId),
        false,
      )
    })
  }
})

test("interrupt settles question and plan handlers as cancelled", async (t) => {
  const { call, send, output } = await setup(t)
  const question = call("askQuestion", { toolCallId: "q", questions: [] })
  const plan = call("createPlan", { toolCallId: "p", plan: "Plan", todos: [] })
  send({ type: "interrupt-turn", nativeThreadId: "session", nativeTurnId: "turn" })
  assert.deepEqual(await Promise.all([question, plan]), [
    { outcome: { outcome: "cancelled" } },
    { outcome: { outcome: "cancelled" } },
  ])
  await until(() => output.some((message) => message.input?.method === "turn/completed"))
})

test("disconnect aborts an approval and clears its UI request", async (t) => {
  const { call, worker, output } = await setup(t)
  const pending = assert.rejects(call("requestPermission", permission), /Connection closed/)
  await worker.shutdown()
  await pending
  assert.equal(
    output.some((message) => message.input?.method === "serverRequest/resolved"),
    true,
  )
})
