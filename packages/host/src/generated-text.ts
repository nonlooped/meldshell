import { randomUUID } from "node:crypto"
import type { WorkerEvent } from "@meldshell/contracts"

const PREFIX = "git-message:"

const pending = new Map<
  string,
  { resolve: (text: string) => void; reject: (error: Error) => void }
>()

// Reuse the providers' ephemeral, read-only generation transport without updating a thread.
export async function requestGeneratedText(
  send: (requestId: string) => Promise<void>,
): Promise<string> {
  const id = `${PREFIX}${randomUUID()}`
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      timer = setTimeout(
        () => reject(new Error("The model did not answer in time. Try again.")),
        75_000,
      )
      void send(id).catch(reject)
    })
  } finally {
    clearTimeout(timer)
    pending.delete(id)
  }
}

/** Settles a generation request from its title event; false when the event names a real thread. */
export function handleGeneratedText(
  event: Extract<WorkerEvent, { type: "thread-title" | "title-failed" }>,
): boolean {
  if (!event.threadId.startsWith(PREFIX)) return false
  const request = pending.get(event.threadId)
  if (event.type === "title-failed") request?.reject(new Error(event.message))
  else if (event.title.trim()) request?.resolve(event.title.trim())
  else request?.reject(new Error("The model returned an empty message."))
  return true
}
