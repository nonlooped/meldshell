import { randomUUID } from "node:crypto"

const pending = new Map<
  string,
  { resolve: (text: string) => void; reject: (error: Error) => void }
>()

// Reuse the providers' ephemeral, read-only generation transport without updating a thread.
export async function requestGeneratedText(
  send: (requestId: string) => Promise<void>,
): Promise<string> {
  const id = `git-message:${randomUUID()}`
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

export function handleGeneratedText(record: Record<string, unknown>): boolean {
  if (typeof record.threadId !== "string" || !record.threadId.startsWith("git-message:"))
    return false
  const request = pending.get(record.threadId)
  if (record.type === "title-failed")
    request?.reject(new Error(String(record.message ?? "Message generation failed.")))
  else if (typeof record.title === "string" && record.title.trim())
    request?.resolve(record.title.trim())
  else request?.reject(new Error("The model returned an empty message."))
  return true
}
