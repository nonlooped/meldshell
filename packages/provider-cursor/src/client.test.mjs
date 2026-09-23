import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { RequestError } from "@agentclientprotocol/sdk"
import { CursorClient } from "./client.ts"

const cancelled = () => ({ outcome: { outcome: "cancelled" } })
const callbacks = {
  message: () => undefined,
  sessionUpdate: () => undefined,
  requestPermission: cancelled,
  askQuestion: cancelled,
  createPlan: cancelled,
}
const setup = (t, handlers = {}) => {
  const client = new CursorClient(
    {
      command: process.execPath,
      args: [fileURLToPath(new URL("./fixtures/acp-agent.mjs", import.meta.url))],
    },
    process.cwd(),
    { ...callbacks, ...handlers },
  )
  t.after(() => client.close())
  return client
}
const request = (client, method, params = {}, timeout = 20_000) =>
  client.run((agent) => agent.request(method, params), timeout)
const permission = {
  sessionId: "session",
  toolCall: { toolCallId: "tool" },
  options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
}
const question = {
  toolCallId: "question",
  questions: [{ id: "q", prompt: "Choose", options: [{ id: "a", label: "A" }] }],
}

test("authenticates and correlates concurrent replies without stripping native fields", async (t) => {
  const client = setup(t)
  assert.equal((await client.initialize()).extra, true)
  const first = { delay: 30, future: { value: 1 } }
  const second = { delay: 1, future: [2] }
  assert.deepEqual(
    await Promise.all([request(client, "echo", first), request(client, "echo", second)]),
    [first, second],
  )
})

test("observes untouched native updates while SDK handlers receive typed notifications", async (t) => {
  const messages = []
  const updates = []
  const client = setup(t, {
    message: (message) => messages.push(message),
    sessionUpdate: (params) => updates.push(params),
  })
  const params = {
    sessionId: "session",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "🌍" },
      future: [1],
    },
  }
  await request(client, "notifications", params)
  assert.deepEqual(messages, [
    { method: "session/update", params },
    { method: "cursor/future_event", params },
  ])
  assert.equal(updates[0].update.content.text, "🌍")
})

test("SDK returns handler results using original numeric and string request IDs", async (t) => {
  const messages = []
  const client = setup(t, { message: (message) => messages.push(message) })
  for (const [id, method, params] of [
    [7, "session/request_permission", permission],
    ["question", "cursor/ask_question", question],
    [9, "cursor/create_plan", { toolCallId: "plan", plan: "Plan", todos: [] }],
  ]) {
    const native = { ...params, future: { untouched: true } }
    const result = await request(client, "interaction", { id, method, params: native })
    assert.deepEqual(result, { jsonrpc: "2.0", id, result: cancelled() })
    assert.deepEqual(messages.at(-1), { id, method, params: native })
  }
})

test("SDK rejects unknown and malformed requests without invoking approval handlers", async (t) => {
  const fail = () => assert.fail("Invalid request reached an approval handler")
  const client = setup(t, { requestPermission: fail, askQuestion: fail, createPlan: fail })
  for (const [method, code] of [
    ["cursor/future", -32601],
    ["session/request_permission", -32602],
    ["cursor/ask_question", -32602],
    ["cursor/create_plan", -32602],
  ]) {
    const result = await request(client, "interaction", { id: method, method, params: {} })
    assert.equal(result.error.code, code)
  }
})

test("uses SDK errors for native failures and rejected handler promises", async (t) => {
  const client = setup(t, {
    requestPermission: async () => {
      throw RequestError.invalidParams(undefined, "Wrong session")
    },
  })
  const response = await request(client, "interaction", {
    id: 1,
    method: "session/request_permission",
    params: permission,
  })
  assert.equal(response.error.code, -32602)
  await assert.rejects(request(client, "error", { native: [1] }), (error) => {
    assert.ok(error instanceof RequestError)
    assert.deepEqual(error.toErrorResponse(), {
      code: -32601,
      message: "Unsupported",
      data: { native: [1] },
    })
    return true
  })
})

test("pending approval handlers do not block other requests", async (t) => {
  const received = Promise.withResolvers()
  const answer = Promise.withResolvers()
  const client = setup(t, {
    requestPermission: () => {
      received.resolve()
      return answer.promise
    },
  })
  const pending = request(client, "interaction", {
    id: 5,
    method: "session/request_permission",
    params: permission,
  })
  await received.promise
  assert.deepEqual(await request(client, "echo", { other: true }), { other: true })
  answer.resolve({ outcome: { outcome: "selected", optionId: "allow" } })
  assert.deepEqual((await pending).result, { outcome: { outcome: "selected", optionId: "allow" } })
})

test("sends cancellation notifications through the SDK", async (t) => {
  const received = Promise.withResolvers()
  const client = setup(t, { message: received.resolve })
  await client.run((agent) => agent.notify("session/cancel", { sessionId: "session" }))
  assert.deepEqual(await received.promise, {
    method: "cancelled",
    params: { sessionId: "session" },
  })
})

test("timeouts close the connection and reject every outstanding request", async (t) => {
  const client = setup(t)
  const pending = assert.rejects(request(client, "stall", {}, 0), /timed out/)
  await assert.rejects(request(client, "stall", {}, 30), /Cursor ACP request timed out/)
  await pending
  await assert.rejects(request(client, "echo"), /timed out/)
})

test("explicit close rejects requests and can be repeated", async (t) => {
  const client = setup(t)
  const pending = assert.rejects(request(client, "stall", {}, 0), /connection closed/)
  await Promise.all([client.close(), client.close()])
  await pending
})

test("bounds incoming message size before SDK decoding", async (t) => {
  const client = setup(t)
  await assert.rejects(request(client, "oversized", {}, 0), /message size limit/)
})

test("closing aborts pending approval handlers and settles the prompt", async (t) => {
  const received = Promise.withResolvers()
  let aborted = false
  const client = setup(t, {
    askQuestion: ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true
            reject(signal.reason)
          },
          { once: true },
        )
        received.resolve()
      }),
  })
  const pending = assert.rejects(
    request(
      client,
      "interaction",
      { id: "pending", method: "cursor/ask_question", params: question },
      0,
    ),
    /connection closed/,
  )
  await received.promise
  await client.close()
  await pending
  assert.equal(aborted, true)
})

test("spawn failures reject requests without waiting for the deadline", async (t) => {
  const client = new CursorClient(
    { command: process.execPath, args: [] },
    fileURLToPath(new URL("./fixtures/nonexistent-directory", import.meta.url)),
    callbacks,
  )
  t.after(() => client.close())
  await assert.rejects(client.initialize(), /ENOENT/)
})
