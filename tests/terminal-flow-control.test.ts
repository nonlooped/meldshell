import assert from "node:assert/strict"
import test from "node:test"
import type { IPty } from "node-pty"
import { IPC } from "@meldshell/contracts/ipc"
import { createTerminals } from "../packages/host/src/terminals.ts"
import { remoteTerminals } from "../packages/host/src/remote-terminals.ts"

const chunk = "x".repeat(64 * 1024)

/** A shell whose output the test emits, recording whether the host paused it. */
function fakeShell() {
  const shell = {
    paused: false,
    killed: false,
    emit: (_data: string) => {},
    pty: {
      onData: (listener: (data: string) => void) => {
        shell.emit = listener
        return { dispose: () => {} }
      },
      onExit: () => ({ dispose: () => {} }),
      write: () => {},
      resize: () => {},
      kill: () => {
        shell.killed = true
      },
      pause: () => {
        shell.paused = true
      },
      resume: () => {
        shell.paused = false
      },
    } as unknown as IPty,
  }
  return shell
}

const context = {
  terminalContext: async () => ({ cwd: process.cwd(), env: {}, run: null }),
}
const open = {
  id: "terminal:flow-control-test",
  workspaceId: "w",
  threadId: "t",
  cols: 80,
  rows: 24,
}

test("a shell pauses while its view has too much unparsed output and resumes after acks", async () => {
  const shell = fakeShell()
  const sent: unknown[][] = []
  const terminals = createTerminals(
    context,
    (_channel, args) => sent.push(args),
    async () => ({ spawn: () => shell.pty }),
  )
  await terminals.open(open)
  for (let index = 0; index < 16; index++) shell.emit(chunk)
  assert.equal(sent.length, 16)
  assert.equal(shell.paused, false, "a 1 MB window is not exceeded yet")
  shell.emit(chunk)
  assert.equal(shell.paused, true)
  // Acknowledgements above the low watermark keep it paused.
  terminals.ack(open.id, 12 * chunk.length)
  assert.equal(shell.paused, true)
  terminals.ack(open.id, 2 * chunk.length)
  assert.equal(shell.paused, false)
  // Stale or excess acknowledgements never build credit beyond what was sent.
  terminals.ack(open.id, 1_000 * chunk.length)
  for (let index = 0; index < 17; index++) shell.emit(chunk)
  assert.equal(shell.paused, true)
  await terminals.close(open.id)
  assert.equal(shell.paused, false, "closing releases a paused shell")
  assert.equal(shell.killed, true)
})

test("remote output that no acknowledging browser receives never holds a shell", async () => {
  const shell = fakeShell()
  const frames: { clientId: string; channel: string; args: unknown[] }[] = []
  const remote = remoteTerminals(
    context,
    (frame) => frames.push(frame),
    60_000,
    (host, send) => createTerminals(host, send, async () => ({ spawn: () => shell.pty })),
  )
  const session = "flow-control-session-key"
  const call = (method: string, input: object, client = "browser-a") =>
    remote.execute(method, { session, ...input }, client)

  // A page from before acknowledgements existed must keep streaming.
  await call("meldshell:terminal-attach", {})
  await call(IPC.terminalOpen, open)
  for (let index = 0; index < 40; index++) shell.emit(chunk)
  assert.equal(shell.paused, false)

  // An acknowledging page holds the shell until it reports parsed output.
  await call("meldshell:terminal-attach", { acks: true })
  for (let index = 0; index < 17; index++) shell.emit(chunk)
  assert.equal(shell.paused, true)
  await call(IPC.terminalAck, { id: open.id, chars: 16 * chunk.length })
  assert.equal(shell.paused, false)

  // A browser that drops away releases what it never acknowledged, then output only fills the buffer.
  for (let index = 0; index < 17; index++) shell.emit(chunk)
  assert.equal(shell.paused, true)
  remote.clients([])
  assert.equal(shell.paused, false)
  for (let index = 0; index < 40; index++) shell.emit(chunk)
  assert.equal(shell.paused, false)

  // Acknowledging replayed output cannot credit the shell beyond what was owed.
  remote.clients(["browser-a"])
  const replayed = frames.at(-1)!
  assert.equal(replayed.channel, IPC.terminalData)
  await call(IPC.terminalAck, { id: open.id, chars: String(replayed.args[1]).length })
  for (let index = 0; index < 17; index++) shell.emit(chunk)
  assert.equal(shell.paused, true)
  await remote.close()
})
