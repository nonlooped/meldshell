import { randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { McpServerHttp } from "@agentclientprotocol/sdk"
import { asRecord, asRecords, asText, type UnknownRecord } from "@meldshell/contracts"

/**
 * Cursor withholds its own AskQuestion tool from ACP clients, so MeldShell offers the model an
 * equivalent over MCP. Each session gets an unguessable path on a loopback-only HTTP server that
 * speaks just enough of MCP's Streamable HTTP transport: JSON responses, no event stream.
 */
export const QUESTION_TOOL = "ask_user_question"

/** A question in the shape every MeldShell user-input request shares. */
export interface ToolQuestion {
  readonly id: string
  readonly header: string
  readonly question: string
  readonly multiSelect: boolean
  readonly isOther: true
  readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>
}

export interface ToolResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>
  readonly isError?: boolean
}

export type AskHandler = (
  questions: ReadonlyArray<ToolQuestion>,
  signal: AbortSignal,
) => Promise<ToolResult>

const BODY_LIMIT = 1024 * 1024

const toolDefinition = {
  name: QUESTION_TOOL,
  title: "Ask the user",
  description:
    "Ask the user one to four multiple-choice questions and wait for their answers. Use this " +
    "whenever you need the user to choose between options or clarify a requirement, instead " +
    "of asking in your reply. The user can always answer in their own words as well.",
  inputSchema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            question: { type: "string", description: "The complete question, ending with '?'." },
            header: { type: "string", description: "A label of at most 12 characters." },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "The choice, in one to five words." },
                  description: { type: "string", description: "What choosing it means." },
                },
                required: ["label"],
              },
            },
            multiSelect: { type: "boolean", description: "Whether several options may be chosen." },
          },
          required: ["question", "options"],
        },
      },
    },
    required: ["questions"],
  },
} as const

/** Reads the tool's arguments leniently: models sometimes send bare option strings. */
export const toolQuestions = (args: unknown): ToolQuestion[] =>
  asRecords(asRecord(args).questions).flatMap((value, index) => {
    const question = asText(value.question).trim()
    if (!question) return []
    const options = (Array.isArray(value.options) ? value.options : []).flatMap((option) => {
      const record = typeof option === "string" ? { label: option } : asRecord(option)
      const label = asText(record.label).trim()
      return label ? [{ label, description: asText(record.description) }] : []
    })
    return [
      {
        id: String(index),
        header: asText(value.header).trim() || "Question",
        question,
        multiSelect: value.multiSelect === true,
        isOther: true as const,
        options,
      },
    ]
  })

/** The tool result for a completed or skipped set of questions. */
export const answeredResult = (
  questions: ReadonlyArray<ToolQuestion>,
  answers: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
): ToolResult => {
  const lines = questions.map((question) => {
    const answer = (answers?.[question.id] ?? []).map((text) => text.trim()).filter(Boolean)
    if (!answer.length) throw new Error("Answer each question before continuing.")
    return `"${question.question}" = "${answer.join(", ")}"`
  })
  return {
    content: [
      {
        type: "text",
        text: `The user answered your questions:\n${lines.join("\n")}\nContinue with these answers in mind.`,
      },
    ],
  }
}

export const skippedResult: ToolResult = {
  content: [
    {
      type: "text",
      text: "The user skipped these questions without answering. Continue without their answers, or ask again later if you must.",
    },
  ],
}

export class QuestionServer {
  private server: Server | null = null
  private listening: Promise<number> | null = null
  private readonly handlers = new Map<string, AskHandler>()

  /** Registers a session's handler and returns the MCP server entry that reaches it. */
  async register(
    handler: AskHandler,
  ): Promise<{ entry: McpServerHttp & { type: "http" }; release: () => void }> {
    const port = await this.listen()
    const token = randomBytes(24).toString("hex")
    this.handlers.set(token, handler)
    return {
      entry: {
        type: "http",
        name: "meldshell",
        url: `http://127.0.0.1:${port}/mcp/${token}`,
        headers: [],
      },
      release: () => {
        this.handlers.delete(token)
      },
    }
  }

  async close(): Promise<void> {
    this.handlers.clear()
    const server = this.server
    this.server = null
    this.listening = null
    if (!server) return
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private listen(): Promise<number> {
    this.listening ??= new Promise<number>((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.handle(request, response).catch(() => {
          if (!response.headersSent) response.writeHead(500)
          response.end()
        })
      })
      this.server = server
      server.once("error", (cause) => {
        this.listening = null
        reject(cause)
      })
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        if (address === null || typeof address === "string")
          reject(new Error("The question server has no port."))
        else resolve(address.port)
      })
    })
    return this.listening
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const token = /^\/mcp\/([a-f0-9]+)$/.exec(request.url ?? "")?.[1]
    const handler = token === undefined ? undefined : this.handlers.get(token)
    // Browsers attach an Origin; the ACP agent does not, so a page cannot reach the tool.
    if (handler === undefined || request.headers.origin !== undefined) {
      response.writeHead(404).end()
      return
    }
    if (request.method === "DELETE") {
      response.writeHead(200).end()
      return
    }
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST, DELETE" }).end()
      return
    }
    let message: UnknownRecord
    try {
      message = asRecord(JSON.parse(await readBody(request)))
    } catch {
      reply(response, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
      return
    }
    if (message.id === undefined || message.id === null) {
      response.writeHead(202).end()
      return
    }
    const outcome = await respond(handler, message.method, asRecord(message.params), response)
    if (outcome !== null) reply(response, { jsonrpc: "2.0", id: message.id, ...outcome })
  }
}

type Outcome = { result: unknown } | { error: { code: number; message: string } }

/** Answers one MCP request, or null when Cursor abandoned it before an answer. */
const respond = async (
  handler: AskHandler,
  method: unknown,
  params: UnknownRecord,
  response: ServerResponse,
): Promise<Outcome | null> => {
  switch (method) {
    case "initialize":
      return {
        result: {
          protocolVersion: asText(params.protocolVersion) || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "meldshell", version: "1.0.0" },
        },
      }
    case "ping":
      return { result: {} }
    case "tools/list":
      return { result: { tools: [toolDefinition] } }
    case "tools/call":
      return params.name === QUESTION_TOOL
        ? callTool(handler, params.arguments, response)
        : { error: { code: -32602, message: `Unknown tool: ${asText(params.name)}` } }
    default:
      return { error: { code: -32601, message: "Method not found" } }
  }
}

const errorResult = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
})

const callTool = async (
  handler: AskHandler,
  args: unknown,
  response: ServerResponse,
): Promise<Outcome | null> => {
  const questions = toolQuestions(args)
  if (!questions.length) return { result: errorResult("Provide at least one question to ask.") }
  // Cursor abandons the call by closing the request; that withdraws the question.
  const abort = new AbortController()
  response.once("close", () => {
    if (!response.writableFinished) abort.abort(new Error("Cursor withdrew the question."))
  })
  try {
    return { result: await handler(questions, abort.signal) }
  } catch (cause) {
    if (abort.signal.aborted) return null
    return { result: errorResult(cause instanceof Error ? cause.message : String(cause)) }
  }
}

const reply = (response: ServerResponse, message: UnknownRecord): void => {
  if (response.destroyed) return
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(message))
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error("Request too large.")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}
