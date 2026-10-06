import type { CanonicalEvent } from "@meldshell/contracts"

/**
 * A projection stage's output, in order. A later event can replace an entry in place, as a stream
 * grows the message it belongs to; the indexes written since the last `drain` are kept, so the
 * next stage only reads what changed.
 */
export class Slots {
  readonly items: CanonicalEvent[] = []
  private changed: number[] = []

  push(event: CanonicalEvent): void {
    this.changed.push(this.items.length)
    this.items.push(event)
  }

  set(index: number, event: CanonicalEvent): void {
    this.items[index] = event
    this.changed.push(index)
  }

  /** The indexes written since the last call, oldest write first, each once. */
  drain(): number[] {
    const changed = [...new Set(this.changed)]
    this.changed = []
    return changed
  }
}
