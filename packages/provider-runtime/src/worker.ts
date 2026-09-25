import { asRecord, WorkerCommand, type WorkerEvent } from "@meldshell/contracts"
import { Either, Schema } from "effect"

export interface WorkerPort {
  readonly postMessage: (message: unknown) => void
  readonly on: (event: "message", listener: (event: { readonly data: unknown }) => void) => unknown
}

/** Posts events to the host, which decodes them against the same `WorkerEvent` schema. */
export const eventPublisher =
  (port: WorkerPort) =>
  (event: WorkerEvent): void =>
    port.postMessage(event)

const decode = Schema.decodeUnknownEither(WorkerCommand)

/** Decode the shared envelope; each provider retains ownership of acknowledgment timing. */
export function workerCommand(port: WorkerPort, data: unknown) {
  const { commandId } = asRecord(data)
  const publish = eventPublisher(port)
  const acknowledge = (error?: string): void => {
    if (typeof commandId === "string")
      publish({ type: "command-ack", commandId, ...(error === undefined ? {} : { error }) })
  }
  const decoded = decode(data)
  return { input: Either.isRight(decoded) ? decoded.right : null, acknowledge }
}
