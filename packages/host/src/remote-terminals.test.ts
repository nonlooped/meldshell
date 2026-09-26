import assert from "node:assert/strict"
import { test } from "node:test"
import { IPC } from "@meldshell/contracts/ipc"
import { remoteTerminals } from "./remote-terminals"

const token = "browser-session-1234"
const id = "terminal-session-1234"
test("remote PTYs isolate clients, buffer during disconnect, and reattach without reopening", async () => {
  const frames: { clientId: string; channel: string; args: unknown[] }[] = []
  let output!: (channel: string, args: unknown[]) => void
  let opens = 0
  let closed = 0
  const writes: string[] = []
  const terminals = remoteTerminals(
    {
      terminalContext: async () => {
        throw new Error("unused")
      },
    },
    (frame) => frames.push(frame),
    1000,
    (_host, send) => {
      output = send
      return {
        open: async () => {
          opens++
          return { cwd: "/host", shell: "bash" }
        },
        write: (_id, data) => {
          writes.push(data)
        },
        resize: () => undefined,
        close: async () => {
          closed++
        },
        closeAll: async () => {
          closed++
        },
      }
    },
  )
  try {
    await terminals.execute("meldshell:terminal-attach", { session: token }, "client-a")
    await terminals.execute(
      IPC.terminalOpen,
      { session: token, id, workspaceId: "w", threadId: "t" },
      "client-a",
    )
    await assert.rejects(
      terminals.execute(IPC.terminalWrite, { session: token, id, data: "bad" }, "client-b"),
      /Reconnect/,
    )
    await assert.rejects(
      terminals.execute(
        IPC.terminalOpen,
        { session: token, id, workspaceId: "w", threadId: "t" },
        "client-a",
      ),
      /already open/,
    )
    output(IPC.terminalData, [id, "before"])
    assert.equal(frames[0]?.clientId, "client-a")
    terminals.clients([])
    output(IPC.terminalData, [id, "during"])
    assert.equal(frames.length, 1)
    assert.deepEqual(
      await terminals.execute(
        "meldshell:terminal-attach",
        { session: token, offsets: { [id]: 6 } },
        "client-b",
      ),
      [id],
    )
    assert.deepEqual(frames[1], {
      type: "event",
      clientId: "client-b",
      channel: IPC.terminalData,
      args: [id, "during", 12],
    })
    await terminals.execute(IPC.terminalWrite, { session: token, id, data: "ok" }, "client-b")
    assert.deepEqual(writes, ["ok"])
    assert.equal(opens, 1)
    output(IPC.terminalExit, [id, 0])
    await assert.rejects(
      terminals.execute(IPC.terminalWrite, { session: token, id, data: "late" }, "client-b"),
      /ended/,
    )
  } finally {
    await terminals.close()
  }
  assert.equal(closed, 1)
})

test("remote terminal sessions expire after the reconnect grace period", async () => {
  let closed = false
  const terminals = remoteTerminals(
    {
      terminalContext: async () => {
        throw new Error("unused")
      },
    },
    () => undefined,
    5,
    () => ({
      open: async () => ({ cwd: "/host", shell: "bash" }),
      write: () => undefined,
      resize: () => undefined,
      close: async () => undefined,
      closeAll: async () => {
        closed = true
      },
    }),
  )
  await terminals.execute("meldshell:terminal-attach", { session: token }, "a")
  terminals.clients([])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(closed, true)
  await terminals.close()
})

test("a host relay reconnect resumes the browser that stayed connected", async () => {
  const frames: { clientId: string; channel: string; args: unknown[] }[] = []
  let output!: (channel: string, args: unknown[]) => void
  const writes: string[] = []
  const terminals = remoteTerminals(
    {
      terminalContext: async () => {
        throw new Error("unused")
      },
    },
    (frame) => frames.push(frame),
    1000,
    (_host, send) => {
      output = send
      return {
        open: async () => ({ cwd: "/host", shell: "bash" }),
        write: (_id, data) => {
          writes.push(data)
        },
        resize: () => undefined,
        close: async () => undefined,
        closeAll: async () => undefined,
      }
    },
  )
  const other = "terminal-session-5678"
  try {
    await terminals.execute("meldshell:terminal-attach", { session: token }, "client-a")
    for (const terminal of [id, other])
      await terminals.execute(
        IPC.terminalOpen,
        { session: token, id: terminal, workspaceId: "w", threadId: "t" },
        "client-a",
      )
    output(IPC.terminalData, [id, "before"])
    output(IPC.terminalExit, [other, 0])
    assert.equal(frames.length, 2)
    terminals.clients([])
    output(IPC.terminalData, [id, "during"])
    terminals.clients(["client-a"])
    assert.deepEqual(
      frames.slice(2).map((frame) => [frame.clientId, frame.channel, frame.args]),
      [["client-a", IPC.terminalData, [id, "during", 12]]],
    )
    await terminals.execute(IPC.terminalWrite, { session: token, id, data: "ok" }, "client-a")
    assert.deepEqual(writes, ["ok"])
  } finally {
    await terminals.close()
  }
})
