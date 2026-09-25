import assert from "node:assert/strict"
import { test } from "node:test"
import { QuestionServer, QUESTION_TOOL, answeredResult, toolQuestions } from "./question-server"

const rpc = async (url: string, message: object, headers: Record<string, string> = {}) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", ...message }),
  })
  return { status: response.status, body: response.status === 200 ? await response.json() : null }
}

test("the question tool reaches only its session's handler over loopback MCP", async () => {
  const server = new QuestionServer()
  const asked: unknown[] = []
  const { entry, release } = await server.register(async (questions) => {
    asked.push(questions)
    return answeredResult(questions, { "0": ["Science"] })
  })
  try {
    assert.equal(entry.type, "http")
    const url = entry.url
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/mcp\/[a-f0-9]{48}$/)

    const init = await rpc(url, { id: 0, method: "initialize", params: { protocolVersion: "x" } })
    assert.equal(init.body.result.protocolVersion, "x")
    assert.equal((await rpc(url, { method: "notifications/initialized" })).status, 202)
    const list = await rpc(url, { id: 1, method: "tools/list" })
    assert.deepEqual(
      list.body.result.tools.map((tool: { name: string }) => tool.name),
      [QUESTION_TOOL],
    )

    const call = await rpc(url, {
      id: 2,
      method: "tools/call",
      params: {
        name: QUESTION_TOOL,
        arguments: { questions: [{ question: "Which topic?", options: ["Science", "History"] }] },
      },
    })
    assert.match(call.body.result.content[0].text, /"Which topic\?" = "Science"/)
    assert.deepEqual(asked, [
      [
        {
          id: "0",
          header: "Question",
          question: "Which topic?",
          multiSelect: false,
          isOther: true,
          options: [
            { label: "Science", description: "" },
            { label: "History", description: "" },
          ],
        },
      ],
    ])

    // A web page cannot drive the tool, and a guessed or released path finds nothing.
    assert.equal(
      (await rpc(url, { id: 3, method: "tools/list" }, { origin: "https://x" })).status,
      404,
    )
    assert.equal((await rpc(url.replace(/[a-f0-9]{48}$/, "0".repeat(48)), { id: 4 })).status, 404)
    release()
    assert.equal((await rpc(url, { id: 5, method: "tools/list" })).status, 404)
  } finally {
    await server.close()
  }
})

test("tool questions accept rich options and reject unanswered submissions", () => {
  const questions = toolQuestions({
    questions: [
      {
        question: "Which?",
        header: "Pick",
        multiSelect: true,
        options: [{ label: "A", description: "First" }, { label: " " }],
      },
      { question: " " },
    ],
  })
  assert.deepEqual(questions, [
    {
      id: "0",
      header: "Pick",
      question: "Which?",
      multiSelect: true,
      isOther: true,
      options: [{ label: "A", description: "First" }],
    },
  ])
  assert.throws(() => answeredResult(questions, { "0": [" "] }), /Answer each question/)
  assert.match(answeredResult(questions, { "0": ["A", "Mine"] }).content[0]!.text, /"A, Mine"/)
})
