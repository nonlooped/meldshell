import { Schema } from "effect"
import { IPC, type TerminalSession } from "@meldshell/contracts/ipc"
import { createTerminals } from "./terminals"

const key = Schema.String.pipe(Schema.minLength(16), Schema.maxLength(100))
const dimensions = { cols: Schema.Number, rows: Schema.Number }
const input = Schema.Struct({
  session: key,
  offsets: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Number.pipe(Schema.nonNegative(), Schema.int()),
    }),
  ),
  id: Schema.optional(key),
  workspaceId: Schema.optional(Schema.String),
  threadId: Schema.optional(Schema.String),
  run: Schema.optional(Schema.String),
  data: Schema.optional(Schema.String.pipe(Schema.maxLength(64 * 1024))),
  cols: Schema.optional(dimensions.cols),
  rows: Schema.optional(dimensions.rows),
})
const methods = new Set([
  IPC.terminalOpen,
  IPC.terminalWrite,
  IPC.terminalResize,
  IPC.terminalClose,
  "meldshell:terminal-attach",
])
type Frame = { type: "event"; clientId: string; channel: string; args: unknown[] }

/** Each browser owns its PTYs. A brief network loss retains them and buffers output for reattach. */
export function remoteTerminals(
  host: Parameters<typeof createTerminals>[0],
  send: (frame: Frame) => void,
  graceMs = 5 * 60_000,
  factory = createTerminals,
) {
  const sessions = new Map<
    string,
    {
      client: string | null
      /** The client that lost its host connection; a relay reconnect that keeps it resumes it. */
      last: string | null
      terminals: ReturnType<typeof createTerminals>
      open: Map<string, TerminalSession | null>
      buffered: Map<string, { text: string; offset: number }>
      /** Output offset and exits already delivered to the attached client. */
      sent: Map<string, number>
      exits: Map<string, number>
      reported: Set<string>
      timer?: NodeJS.Timeout
    }
  >()
  type Session = NonNullable<ReturnType<typeof sessions.get>>
  const replay = (
    session: Session,
    client: string,
    offsets: Readonly<Record<string, number>>,
    everything: boolean,
  ) => {
    for (const [id, history] of session.buffered) {
      const seen = offsets[id] ?? 0
      const start = history.offset - history.text.length
      const data = history.text.slice(Math.max(0, seen - start))
      session.sent.set(id, history.offset)
      if (data)
        send({
          type: "event",
          clientId: client,
          channel: IPC.terminalData,
          args: [
            id,
            (seen < start ? "\r\n[Earlier output was truncated during disconnect.]\r\n" : "") +
              data,
            history.offset,
          ],
        })
    }
    for (const [id, code] of session.exits) {
      if (!everything && session.reported.has(id)) continue
      session.reported.add(id)
      send({ type: "event", clientId: client, channel: IPC.terminalExit, args: [id, code] })
    }
  }
  const attach = (
    token: string,
    client: string,
    offsets: Readonly<Record<string, number>> = {},
  ) => {
    let session = sessions.get(token)
    if (!session) {
      if (sessions.size >= 32)
        throw new Error("Too many remote terminal sessions. Close another remote connection.")
      const terminals = factory(host, (channel, args) => {
        const current = sessions.get(token)
        if (!current) return
        const id = String(args[0])
        if (channel === IPC.terminalData) {
          const previous = current.buffered.get(id) ?? { text: "", offset: 0 }
          const data = String(args[1])
          const offset = previous.offset + data.length
          current.buffered.set(id, { text: (previous.text + data).slice(-256 * 1024), offset })
          if (current.client) {
            current.sent.set(id, offset)
            send({ type: "event", clientId: current.client, channel, args: [id, data, offset] })
          }
        } else {
          current.open.delete(id)
          current.exits.set(id, Number(args[1]))
          if (current.client) {
            current.reported.add(id)
            send({ type: "event", clientId: current.client, channel, args })
          }
        }
      })
      session = {
        client,
        last: null,
        terminals,
        open: new Map(),
        buffered: new Map(),
        sent: new Map(),
        exits: new Map(),
        reported: new Set(),
      }
      sessions.set(token, session)
    }
    clearTimeout(session.timer)
    session.client = client
    session.last = null
    replay(session, client, offsets, true)
    return session
  }
  const open = async (session: Session, id: string, value: typeof input.Type) => {
    if (!value.workspaceId || !value.threadId)
      throw new Error("A terminal needs a workspace and thread.")
    if (session.open.has(id)) throw new Error("This terminal is already open.")
    if (session.open.size >= 32) throw new Error("Close a terminal before opening another.")
    session.open.set(id, null)
    try {
      const result = await session.terminals.open({
        id,
        workspaceId: value.workspaceId,
        threadId: value.threadId,
        cols: value.cols ?? 80,
        rows: value.rows ?? 24,
        ...(value.run === undefined ? {} : { run: value.run }),
      })
      if (session.open.has(id)) session.open.set(id, result)
      return result
    } catch (cause) {
      session.open.delete(id)
      throw cause
    }
  }
  return {
    handles: (method: string) => methods.has(method),
    execute: async (method: string, raw: unknown, client: string) => {
      const value = Schema.decodeUnknownSync(input)(raw)
      if (method === "meldshell:terminal-attach") {
        const session = attach(value.session, client, value.offsets)
        return [...session.open.keys()]
      }
      const session = sessions.get(value.session)
      if (!session || session.client !== client)
        throw new Error("Reconnect the terminal session before using it.")
      const id = value.id
      if (!id) throw new Error("A terminal ID is required.")
      if (method === IPC.terminalOpen) return open(session, id, value)
      if (method === IPC.terminalClose) {
        session.open.delete(id)
        session.buffered.delete(id)
        session.sent.delete(id)
        session.exits.delete(id)
        session.reported.delete(id)
        await session.terminals.close(id)
        return null
      }
      if (!session.open.has(id)) throw new Error("This terminal has ended. Open another terminal.")
      if (method === IPC.terminalWrite) session.terminals.write(id, value.data ?? "")
      if (method === IPC.terminalResize)
        session.terminals.resize(id, value.cols ?? 80, value.rows ?? 24)
      return null
    },
    clients: (ids: readonly string[]) => {
      for (const [token, session] of sessions) {
        if (session.client === null) {
          // Browsers stay connected while the host's relay socket reconnects, so they never
          // attach again; resume the one that was attached and send what it missed.
          if (session.last === null || !ids.includes(session.last)) continue
          clearTimeout(session.timer)
          session.client = session.last
          session.last = null
          replay(session, session.client, Object.fromEntries(session.sent), false)
          continue
        }
        if (ids.includes(session.client)) continue
        session.last = session.client
        session.client = null
        session.timer = setTimeout(() => {
          sessions.delete(token)
          void session.terminals.closeAll()
        }, graceMs)
        session.timer.unref()
      }
    },
    close: async () => {
      const all = [...sessions.values()]
      sessions.clear()
      for (const session of all) clearTimeout(session.timer)
      await Promise.all(all.map((session) => session.terminals.closeAll()))
    },
  }
}
