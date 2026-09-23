import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { WebSocketServer, type WebSocket } from "ws"
import { MAX_FRAME_BYTES } from "@meldshell/contracts"
import { connectRelay, frameText } from "./remote-connection"

test("oversized results return a bounded error correlated to the original request", () => {
  const text = frameText({
    type: "result",
    id: "command",
    clientId: "client",
    ok: true,
    value: "x".repeat(MAX_FRAME_BYTES),
  } as never)
  const result = JSON.parse(text)
  assert.equal(result.id, "command")
  assert.equal(result.clientId, "client")
  assert.equal(result.ok, false)
  assert.ok(text.length < 1024)
})

test("the host streams events only while the relay reports a connected browser", async (t) => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" })
  await once(server, "listening")
  const directory = await mkdtemp(join(tmpdir(), "meldshell-relay-"))
  await writeFile(
    join(directory, "remote-credential.json"),
    JSON.stringify({
      deviceId: "device",
      credential: "secret",
      controlURL: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      siteURL: "http://127.0.0.1",
      account: { id: "account", email: "owner@example.com", name: "Owner" },
    }),
  )
  const relay = connectRelay(directory, async () => ({ type: "result", id: "", ok: true }))
  t.after(async () => {
    relay.close()
    server.close()
    await rm(directory, { recursive: true, force: true })
  })
  const [socket] = (await once(server, "connection")) as [WebSocket]
  const received: string[] = []
  socket.on("message", (data) => received.push(String(data)))
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
  while (relay.status() !== "Online") await settle()

  socket.send(JSON.stringify({ type: "clients", count: 0 }))
  await settle()
  relay.publish({ type: "event", channel: "unwatched", args: [] } as never)
  socket.send(JSON.stringify({ type: "clients", count: 1 }))
  await settle()
  relay.publish({ type: "event", channel: "watched", args: [] } as never)
  await settle()
  assert.deepEqual(
    received.map((text) => JSON.parse(text).channel),
    ["watched"],
  )
  // Presence and heartbeat replies are not commands, so they must not reset the connection.
  socket.send("pong")
  await settle()
  assert.equal(relay.status(), "Online")
})
