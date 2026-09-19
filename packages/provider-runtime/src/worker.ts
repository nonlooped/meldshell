import { WorkerCommand } from "@meldshell/contracts"
import { Either, Schema } from "effect"

export interface WorkerPort {
  readonly postMessage: (message: unknown) => void
  readonly on: (event: "message", listener: (event: { readonly data: unknown }) => void) => unknown
}

const decode = Schema.decodeUnknownEither(WorkerCommand)

/** Decode the shared envelope; each provider retains ownership of acknowledgment timing. */
export function workerCommand(port: WorkerPort, data: unknown) {
  const commandId =
    typeof data === "object" && data !== null && "commandId" in data ? data.commandId : undefined
  const acknowledge = (error?: string): void => {
    if (typeof commandId === "string")
      port.postMessage({
        type: "command-ack",
        commandId,
        ...(error === undefined ? {} : { error }),
      })
  }
  const decoded = decode(data)
  return { input: Either.isRight(decoded) ? decoded.right : null, acknowledge }
}
