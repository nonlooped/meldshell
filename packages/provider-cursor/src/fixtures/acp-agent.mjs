import { createInterface } from "node:readline"

const send = (message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
let waiting
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line)
  const { id, method, params } = message
  if (!method) {
    send({ id: waiting, result: message })
    return
  }
  switch (method) {
    case "initialize":
      send({
        id,
        result: { protocolVersion: 1, authMethods: [{ id: "cursor_login" }], extra: true },
      })
      break
    case "authenticate":
      send({ id, result: {} })
      break
    case "echo":
      setTimeout(() => send({ id, result: params }), params.delay ?? 0)
      break
    case "interaction":
      waiting = id
      send({ id: params.id, method: params.method, params: params.params })
      break
    case "notifications": {
      const bytes = Buffer.from(
        JSON.stringify({ jsonrpc: "2.0", method: "session/update", params }) + "\n",
      )
      const split = bytes.indexOf(Buffer.from("🌍")) + 1
      process.stdout.write(bytes.subarray(0, split))
      setTimeout(() => {
        process.stdout.write(bytes.subarray(split))
        send({ method: "cursor/future_event", params })
        send({ id, result: {} })
      }, 10)
      break
    }
    case "error":
      send({ id, error: { code: -32601, message: "Unsupported", data: params } })
      break
    case "oversized":
      process.stdout.write("x".repeat(16 * 1024 * 1024 + 1))
      break
    case "stall":
      break
    case "session/cancel":
      send({ method: "cancelled", params })
      break
    default:
      send({ id, result: {} })
  }
})
