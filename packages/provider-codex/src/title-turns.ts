import { Either } from "effect"
import { decodeNativePayload, type WorkerEvent } from "@meldshell/contracts"
import type { JsonRpcNotification } from "./client"
import { agentMessageText, finalMessageText } from "./messages"

interface PendingTitle {
  readonly threadId: string
  text: string | null
  readonly timeout: ReturnType<typeof setTimeout>
}

/** Codex answers a title turn long before this; the timer only stops a hung turn leaking an entry. */
const TITLE_TIMEOUT_MS = 60_000

/**
 * Title turns run on their own ephemeral Codex thread, keyed separately from conversation threads:
 * nothing they emit belongs in a transcript, and the user never sees them run.
 */
export class TitleTurns {
  readonly #pending = new Map<string, PendingTitle>()

  constructor(private readonly publish: (event: WorkerEvent) => void) {}

  owns(nativeThreadId: string): boolean {
    return this.#pending.has(nativeThreadId)
  }

  /** Starts waiting for the title a native thread produces for a MeldShell thread. */
  track(nativeThreadId: string, threadId: string): void {
    const timeout = setTimeout(
      () => this.settle(nativeThreadId, null, "The title model did not answer in time."),
      TITLE_TIMEOUT_MS,
    )
    this.#pending.set(nativeThreadId, { threadId, text: null, timeout })
  }

  /** Reads the answer from a title thread's notifications; returns false for other threads. */
  observe(nativeThreadId: string, message: JsonRpcNotification): boolean {
    const pending = this.#pending.get(nativeThreadId)
    if (pending === undefined) return false
    if (message.method !== "item/completed" && message.method !== "turn/completed") return true
    const decoded = decodeNativePayload(message.params)
    if (Either.isLeft(decoded)) {
      this.settle(nativeThreadId, null, decoded.left.message)
      return true
    }
    if (message.method === "item/completed")
      pending.text = agentMessageText(decoded.right.item) ?? pending.text
    if (message.method === "turn/completed")
      this.settle(nativeThreadId, pending.text ?? finalMessageText(message.params))
    return true
  }

  settle(nativeThreadId: string, title: string | null, detail?: string): void {
    const pending = this.#pending.get(nativeThreadId)
    if (pending === undefined) return
    clearTimeout(pending.timeout)
    this.#pending.delete(nativeThreadId)
    if (title === null || title.trim() === "")
      this.publish({
        type: "title-failed",
        threadId: pending.threadId,
        message: detail ?? "The title model answered with no text.",
      })
    else this.publish({ type: "thread-title", threadId: pending.threadId, title })
  }

  /** Fails every title still waiting, for example when the app-server exits. */
  failAll(detail: string): void {
    for (const nativeThreadId of [...this.#pending.keys()])
      this.settle(nativeThreadId, null, detail)
  }

  /** Forgets every title without reporting it, for shutdown. */
  clear(): void {
    for (const pending of this.#pending.values()) clearTimeout(pending.timeout)
    this.#pending.clear()
  }
}
